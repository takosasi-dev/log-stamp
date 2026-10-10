// 受け箱への記録(FR-6)と、受け箱 → ログの取り込み(FR-8〜FR-10・FR-14)。書き込みは io.ts を通す。
// 取り込みは「この端末で取り込む」が ON のときだけ動く(INV-10)。最中にもう一度呼ばれたら断る(§10)。
import type { App, TFile } from "obsidian";
import { isoWithOffset } from "./core/dates";
import { entryLines, type Entry } from "./core/format";
import { buildInboxText, byCreated, inboxPath, markImported, parseInbox, randomHex4, type InboxItem } from "./core/inbox";
import { countEntry, h1Warning, insertEntry, newLogText } from "./core/insert";
import { createFile, ensureFolder, exists, fileAt, folderAt, mdFilesIn, np, processFile, readFile } from "./io";
import { isSameOrInside, isUnset, type Settings } from "./settings";
import { S } from "./strings";

export type Outcome =
	| { kind: "inserted"; logPath: string; warn: string | null }
	| { kind: "existed"; logPath: string; warn: null }
	| { kind: "invalid" }
	| { kind: "rejected"; logPath: string }
	| { kind: "error"; reason: string };

const reasonOf = (e: unknown): string => (e instanceof Error ? e.message : String(e));

/** 受け箱に1項目1ファイルで作る。失敗したら Notice に出す文を返す(入力はモーダルに残す) */
export async function recordToInbox(
	app: App, st: Settings, e: Entry, now: Date,
): Promise<{ ok: true; file: TFile } | { ok: false; message: string }> {
	if (isUnset(st.inboxFolder)) return { ok: false, message: S.unsetInbox }; // 未設定なら vault の直下に作らない
	if (isSameOrInside(np(st.inboxFolder), np(st.logFolder))) return { ok: false, message: S.errInboxInsideLog }; // INV-3
	if (!(await ensureFolder(app, st.inboxFolder))) return { ok: false, message: S.makeInboxFolder(st.inboxFolder) };
	const text = buildInboxText(e, isoWithOffset(now));
	for (let i = 0; i < 4; i++) { // 名前が埋まっていたら4桁を作り直す(3回まで)
		const path = np(inboxPath(st.inboxFolder, e.date, now, randomHex4()));
		if (exists(app, path)) continue;
		try {
			return { ok: true, file: await createFile(app, path, text) };
		} catch (err) {
			if (!exists(app, path)) return { ok: false, message: S.recordFailed(reasonOf(err)) };
		}
	}
	return { ok: false, message: S.recordFailed(S.nameTaken) };
}

export class Importer {
	busy = false;

	constructor(
		private readonly app: App,
		private readonly settings: () => Settings,
		private readonly isOn: () => boolean,
	) {}

	logPath(date: string): string {
		return np(`${this.settings().logFolder}/${date}.md`);
	}

	/** busy の間は null を返して何もしない */
	async run<T>(fn: () => Promise<T>): Promise<T | null> {
		if (this.busy) return null;
		this.busy = true;
		try {
			return await fn();
		} finally {
			this.busy = false;
		}
	}

	/** FR-10 の (2)〜(4): ログが無ければ H1 だけで作り、既に無ければ足す */
	async insertItem(item: Pick<InboxItem, "date" | "headingLine" | "body">): Promise<Outcome> {
		if (!this.isOn()) return { kind: "error", reason: S.importOff };
		const st = this.settings();
		if (isUnset(st.logFolder)) return { kind: "error", reason: S.unsetLog }; // 未設定なら vault の直下に書かない
		const path = this.logPath(item.date);
		try {
			let file = fileAt(this.app, path);
			if (!file) {
				if (!folderAt(this.app, st.logFolder)) return { kind: "error", reason: S.noLogFolder(st.logFolder) };
				file = await createFile(this.app, path, newLogText(st.titleFormat, item.date));
			}
			const res = { kind: "rejected" as "inserted" | "existed" | "rejected", text: "" };
			await processFile(this.app, file, (t) => {
				const base = t === "" ? newLogText(st.titleFormat, item.date) : t; // 0 バイトなら H1 を足してから(§10)
				if (countEntry(base, item) > 0) {
					res.kind = "existed";
					return t;
				}
				const r = insertEntry(base, entryLines(item), st.summaryHeading);
				if (!r.ok) {
					res.kind = "rejected";
					return t;
				}
				res.kind = "inserted";
				res.text = r.text;
				return r.text;
			});
			if (res.kind === "rejected") return { kind: "rejected", logPath: path };
			if (res.kind === "existed") return { kind: "existed", logPath: path, warn: null };
			return { kind: "inserted", logPath: path, warn: h1Warning(res.text, item.date) };
		} catch (e) {
			return { kind: "error", reason: reasonOf(e) };
		}
	}

	/** FR-10: 受け箱ファイル1つを取り込み、入った(既にあった)ら `取り込み:` を1行足す */
	async importFile(file: TFile): Promise<Outcome> {
		if (!this.isOn()) return { kind: "error", reason: S.importOff };
		try {
			const item = parseInbox(await readFile(this.app, file));
			if (!item) return { kind: "invalid" };
			const o = await this.insertItem(item);
			if (o.kind === "inserted" || o.kind === "existed") {
				const stamp = isoWithOffset(new Date());
				await processFile(this.app, file, (t) => markImported(t, stamp) ?? t);
			}
			return o;
		} catch (e) {
			return { kind: "error", reason: reasonOf(e) };
		}
	}

	/** FR-9: `取り込み:` の無い受け箱ファイルを `作成` の古い順に取り込む。notes は個別に知らせる文。
	 *  `取り込み:` のある物は読むだけで「既にあった」に数える(AC-13 の2回目が「既にあった 3」になるため) */
	async importAll(): Promise<{ inserted: number; existed: number; invalid: number; notes: string[] }> {
		const sum = { inserted: 0, existed: 0, invalid: 0, notes: [] as string[] };
		const st = this.settings();
		if (!this.isOn() || isUnset(st.inboxFolder) || isUnset(st.logFolder)) return sum; // 未設定なら vault の直下を読まない
		const folder = folderAt(this.app, st.inboxFolder);
		if (!folder) return sum;
		const todo: { file: TFile; created: string; path: string }[] = [];
		for (const f of mdFilesIn(folder)) {
			const item = parseInbox(await readFile(this.app, f));
			if (!item) sum.invalid++;
			else if (item.imported) sum.existed++; // 取り込み済みは触らず「既にあった」に数える(AC-13。NOTES)
			else todo.push({ file: f, created: item.created, path: f.path });
		}
		todo.sort(byCreated);
		for (const t of todo) {
			const o = await this.importFile(t.file);
			if (o.kind === "inserted") sum.inserted++;
			else if (o.kind === "existed") sum.existed++;
			else if (o.kind === "invalid") sum.invalid++;
			sum.notes.push(...notesOf(o, t.path));
		}
		return sum;
	}
}

/** 1件の結果のうち、別に知らせる物(FR-12 に落ちた・失敗・H1 の添え書き) */
export function notesOf(o: Outcome, inboxPathText: string): string[] {
	if (o.kind === "rejected") return [S.rejected(o.logPath)];
	if (o.kind === "error") return [S.importFailed(inboxPathText, o.reason)];
	if (o.kind === "inserted" && o.warn) return [`${o.logPath}: ${o.warn}`];
	return [];
}
