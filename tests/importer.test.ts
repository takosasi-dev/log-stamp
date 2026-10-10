// 記録と取り込みの流れを、メモリ上の偽の vault で確かめる(AC-10・AC-12・AC-13・AC-14・AC-20 の論理。実機の確認は別)。
// obsidian はテストでは読めない(型だけのパッケージ)ので、Vault に触る src/io.ts を偽の vault につなぎ替える。
import { describe, expect, it, vi } from "vitest";
import type { App, TFile } from "obsidian";
import { buildEntry, submitEntry, type EntryInput } from "../src/core/format";
import { buildInboxText } from "../src/core/inbox";
import { Importer, recordToInbox } from "../src/importer";
import { DEFAULTS, type Settings } from "../src/settings";
import { S } from "../src/strings";
import { collectVerify } from "../src/verify";
import { check86, H } from "./helpers";

interface FakeFile { path: string }
interface FakeFolder { path: string; files: FakeFile[] }

/** io.ts の各関数は第1引数の app を受けるので、app として FakeVault を渡し、その中身を読み書きする */
class FakeVault {
	files = new Map<string, string>();
	folders = new Set<string>(["開発ログ"]);
	writes: string[] = [];
	fileAt(p: string): FakeFile | null { return this.files.has(p) ? { path: p } : null; }
	folderAt(p: string): FakeFolder | null {
		if (!this.folders.has(p)) return null;
		return { path: p, files: [...this.files.keys()].filter((k) => k.split("/").slice(0, -1).join("/") === p).map((path) => ({ path })) };
	}
	create(p: string, data: string): Promise<FakeFile> {
		if (this.files.has(p)) return Promise.reject(new Error("exists"));
		if (!this.folders.has(p.split("/").slice(0, -1).join("/"))) return Promise.reject(new Error("no folder"));
		this.files.set(p, data);
		this.writes.push(p);
		return Promise.resolve({ path: p });
	}
	process(f: FakeFile, fn: (t: string) => string): Promise<string> {
		const t = this.files.get(f.path) ?? "";
		const n = fn(t);
		if (n !== t) this.writes.push(f.path);
		this.files.set(f.path, n);
		return Promise.resolve(n);
	}
	logFiles(): [string, string][] { return [...this.files].filter(([k]) => k.startsWith("開発ログ/")); }
}

vi.mock("../src/io", () => {
	const np = (p: string): string => p.replace(/\\/g, "/").replace(/\/+/g, "/").replace(/^\/+|\/+$/g, "") || "/";
	return {
		np,
		fileAt: (v: FakeVault, p: string) => v.fileAt(np(p)),
		folderAt: (v: FakeVault, p: string) => v.folderAt(np(p)),
		exists: (v: FakeVault, p: string) => v.fileAt(np(p)) !== null || v.folderAt(np(p)) !== null,
		readFile: (v: FakeVault, f: FakeFile) => Promise.resolve(v.files.get(f.path) ?? ""),
		ensureFolder: (v: FakeVault, p: string) => { v.folders.add(np(p)); return Promise.resolve(true); },
		createFile: (v: FakeVault, p: string, d: string) => v.create(np(p), d),
		processFile: (v: FakeVault, f: FakeFile, fn: (t: string) => string) => v.process(f, fn),
		mdFilesIn: (d: FakeFolder) => d.files.filter((f) => f.path.endsWith(".md")),
	};
});

function setup(on: boolean): { v: FakeVault; app: App; st: Settings; imp: Importer; flag: { on: boolean } } {
	const v = new FakeVault();
	const app = v as unknown as App;
	const st: Settings = { ...DEFAULTS, skeletonTail: [...DEFAULTS.skeletonTail] };
	const flag = { on };
	return { v, app, st, imp: new Importer(app, () => st, () => flag.on), flag };
}

const SUM = "## この日の総括";
const LOG = `# 2026-09-25 開発ログ\n\n${H("09:00", "A: x")}\n\n- a\n\n---\n\n${SUM}\n\n- s\n`;
const input = (heading: string, time = "09:31", date = "2026-09-25"): EntryInput => ({ date, time, heading, body: "本文" });

async function record(app: App, st: Settings, i: EntryInput, now = new Date(2026, 8, 25, 9, 31, 12)): Promise<TFile> {
	const r = await submitEntry(i, st.bulletize, (e) => recordToInbox(app, st, e, now));
	if (!r.ok || !r.value.ok) throw new Error("record failed");
	return r.value.file;
}

describe("AC-10・INV-10: 取り込み OFF", () => {
	it("3件記録すると受け箱が3つ増え、ログのフォルダは変わらない。取り込みも何も書かない", async () => {
		const { v, app, st, imp } = setup(false);
		v.files.set("開発ログ/2026-09-25.md", LOG);
		const before = JSON.stringify(v.logFiles());
		for (const h of ["一", "二", "三"]) await record(app, st, input(h));
		expect([...v.files.keys()].filter((k) => k.startsWith("開発ログ受け箱/")).length).toBe(3);
		expect(v.folders.has("開発ログ受け箱")).toBe(true);
		expect(JSON.stringify(v.logFiles())).toBe(before);
		expect(await imp.importAll()).toEqual({ inserted: 0, existed: 0, invalid: 0, notes: [] });
		expect(v.writes.every((p) => p.startsWith("開発ログ受け箱/"))).toBe(true);
	});
});

describe("AC-12: 取り込み ON で記録と同時に入る", () => {
	it("総括の直前に §9.4 の形で入り、受け箱に `取り込み:` が1行増える", async () => {
		const { v, app, st, imp } = setup(true);
		v.files.set("開発ログ/2026-09-25.md", LOG);
		const f = await record(app, st, input("SampleKit: 直した"));
		const inboxBefore = v.files.get(f.path) ?? "";
		const o = await imp.importFile(f);
		expect(o).toEqual({ kind: "inserted", logPath: "開発ログ/2026-09-25.md", warn: null });
		const log = v.files.get("開発ログ/2026-09-25.md") ?? "";
		expect(log).toBe(LOG.replace(SUM, `${H("09:31", "SampleKit: 直した")}\n\n- 本文\n\n---\n\n${SUM}`));
		expect(check86(LOG, log).ok).toBe(true);
		const c = check86(inboxBefore, v.files.get(f.path) ?? "");
		expect(c.ok).toBe(true);
		expect(c.added.length).toBe(1);
		expect(c.added[0]).toMatch(/^取り込み: \d{4}-\d{2}-\d{2}T/);
	});
});

describe("AC-13: 受け箱を取り込む", () => {
	it("作成の古い順に入り、もう一度では入れた 0・既にあった 3 でログが変わらない", async () => {
		const { v, imp } = setup(true);
		v.files.set("開発ログ/2026-09-25.md", LOG);
		v.folders.add("開発ログ受け箱");
		const mk = (name: string, h: string, created: string): void => {
			v.files.set(`開発ログ受け箱/${name}.md`, buildInboxText(buildEntry(input(h), true), created));
		};
		mk("a", "三番目", "2026-09-25T12:00:00+09:00");
		mk("b", "一番目", "2026-09-25T10:00:00+09:00");
		mk("c", "二番目", "2026-09-25T02:00:00Z");
		const r1 = await imp.importAll();
		expect(S.importResult(r1.inserted, r1.existed, r1.invalid)).toBe("取り込み: 入れた 3・既にあった 0・形式外 0");
		const log = v.files.get("開発ログ/2026-09-25.md") ?? "";
		expect(log.indexOf("一番目") < log.indexOf("二番目") && log.indexOf("二番目") < log.indexOf("三番目")).toBe(true);
		const r2 = await imp.importAll();
		expect(S.importResult(r2.inserted, r2.existed, r2.invalid)).toBe("取り込み: 入れた 0・既にあった 3・形式外 0");
		expect(v.files.get("開発ログ/2026-09-25.md")).toBe(log);
	});

	it("ログには入ったが `取り込み:` を足す前に落ちた物は、次で既にあったになり印だけ足す(§10)", async () => {
		const { v, app, st, imp } = setup(true);
		v.files.set("開発ログ/2026-09-25.md", LOG);
		const f = await record(app, st, input("落ちた"));
		const raw = v.files.get(f.path) ?? "";
		await imp.importFile(f);
		const log = v.files.get("開発ログ/2026-09-25.md");
		v.files.set(f.path, raw); // 印を消して、落ちた状態にする
		const r = await imp.importAll();
		expect([r.inserted, r.existed]).toEqual([0, 1]);
		expect(v.files.get("開発ログ/2026-09-25.md")).toBe(log);
		expect(v.files.get(f.path)).toMatch(/取り込み: /);
	});

	it("形式外は数えて飛ばす。最中にもう一度は断る", async () => {
		const { v, imp } = setup(true);
		v.folders.add("開発ログ受け箱");
		v.files.set("開発ログ受け箱/壊れ.md", "---\nlogstamp: 1\n本文\n");
		expect((await imp.importAll()).invalid).toBe(1);
		let inner: unknown = "not run";
		await imp.run(async () => { inner = await imp.run(() => Promise.resolve(1)); });
		expect(inner).toBeNull();
	});
});

describe("AC-14: ログの無い日付", () => {
	it("H1 だけのファイルを作ってから入れる(BOM なし)", async () => {
		const { v, app, st, imp } = setup(true);
		const f = await record(app, st, input("新しい日", "08:15", "2026-09-27"));
		expect((await imp.importFile(f)).kind).toBe("inserted");
		const log = v.files.get("開発ログ/2026-09-27.md") ?? "";
		expect(log.startsWith("# 2026-09-27 開発ログ\n\n### ")).toBe(true);
		expect(log.charCodeAt(0)).not.toBe(0xfeff);
		expect(log).toBe(`# 2026-09-27 開発ログ\n\n${H("08:15", "新しい日")}\n\n- 本文\n\n---\n\n`);
	});
	it("0 バイトのログには H1 を足してから入れる。H1 が無いログには H1 を足さず添え書きを返す", async () => {
		const { v, app, st, imp } = setup(true);
		v.files.set("開発ログ/2026-09-25.md", "");
		await imp.importFile(await record(app, st, input("空")));
		expect(v.files.get("開発ログ/2026-09-25.md")).toBe(`# 2026-09-25 開発ログ\n\n${H("09:31", "空")}\n\n- 本文\n\n---\n\n`);
		v.files.set("開発ログ/2026-09-26.md", "- H1 なし\n");
		const o = await imp.importFile(await record(app, st, input("H1なし", "10:00", "2026-09-26")));
		expect(o).toEqual({ kind: "inserted", logPath: "開発ログ/2026-09-26.md", warn: "H1 がありません" });
	});
	it("ログのフォルダが無ければ作らずに失敗を返す", async () => {
		const { v, app, st, imp } = setup(true);
		v.folders.delete("開発ログ");
		const o = await imp.importFile(await record(app, st, input("x")));
		expect(o).toEqual({ kind: "error", reason: S.noLogFolder("開発ログ") });
	});
});

describe("記録の失敗", () => {
	it("名前が4回とも埋まっていたら失敗(入力はモーダルに残す側で扱う)", async () => {
		const { app, st } = setup(false);
		const spy = vi.spyOn(Math, "random").mockReturnValue(0.5);
		await record(app, st, input("一"));
		const r = await submitEntry(input("二"), true, (e) => recordToInbox(app, st, e, new Date(2026, 8, 25, 9, 31, 12)));
		spy.mockRestore();
		expect(r).toEqual({ ok: true, value: { ok: false, message: S.recordFailed(S.nameTaken) } });
	});
	it("受け箱が開発ログの中なら記録しない(INV-3)", async () => {
		const { app, st } = setup(false);
		st.inboxFolder = "開発ログ/inbox";
		const r = await submitEntry(input("x"), true, (e) => recordToInbox(app, st, e, new Date()));
		expect(r).toEqual({ ok: true, value: { ok: false, message: S.errInboxInsideLog } });
	});
});

describe("AC-20: 取り込んだ項目を照合", () => {
	it("消した物は「無い物」、2回にした物は「2回以上ある物」、壊れた受け箱は形式外に出る", async () => {
		const { v, app, st, imp } = setup(true);
		v.files.set("開発ログ/2026-09-25.md", LOG);
		const a = await record(app, st, input("消す"), new Date(2026, 8, 25, 9, 0, 1));
		const b = await record(app, st, input("二重"), new Date(2026, 8, 25, 9, 0, 2));
		await imp.importAll();
		const logPath = (d: string): string => imp.logPath(d);
		expect(await collectVerify(app, st, logPath)).toEqual({ missing: [], multiple: [], invalid: [] });
		const log = v.files.get("開発ログ/2026-09-25.md") ?? "";
		const del = `${H("09:31", "消す")}\n\n- 本文\n\n---\n\n`;
		const dup = `${H("09:31", "二重")}\n\n- 本文\n\n---\n\n`;
		v.files.set("開発ログ/2026-09-25.md", log.replace(del, "").replace(dup, dup + dup));
		v.files.set("開発ログ受け箱/壊れ.md", "壊れた");
		const r = await collectVerify(app, st, logPath);
		expect(r.missing.map((x) => x.path)).toEqual([a.path]);
		expect(r.multiple.map((x) => [x.path, x.count])).toEqual([[b.path, 2]]);
		expect(r.invalid).toEqual(["開発ログ受け箱/壊れ.md"]);
		// 入れ直し(FR-10 の (2)〜(4))
		const missing = r.missing[0];
		if (missing) expect((await imp.insertItem(missing.item)).kind).toBe("inserted");
		expect((await collectVerify(app, st, logPath)).missing).toEqual([]);
	});
});
