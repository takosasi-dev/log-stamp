// 受け箱ファイル(§9.5)の名前・中身を作り、読み、`取り込み:` の1行を足す純関数。
// 読むときは見出し行と本文を正とし、FR-3 の検証をもう一度通す。合わなければ「形式外」(null)。obsidian を import しない。
import { formatHms } from "./dates";
import { entryLines, isEntryHeading, validateEntry, type Entry } from "./format";
import { splitLines, type Line } from "./insert";

export interface InboxItem {
	date: string;
	created: string;
	imported: string | null;
	time: string;
	heading: string;
	headingLine: string;
	body: string[];
}

export const IMPORTED_KEY = "取り込み";

/** <inboxFolder>/<日付>_<時分秒>_<16進4桁>.md(日付は項目の日付、時分秒は記録した時刻) */
export function inboxPath(folder: string, date: string, now: Date, hex4: string): string {
	return `${folder}/${date}_${formatHms(now)}_${hex4}.md`;
}

export function randomHex4(): string {
	return Math.floor(Math.random() * 0x10000).toString(16).padStart(4, "0");
}

/** 作るときの中身(LF・BOM なし) */
export function buildInboxText(e: Entry, created: string): string {
	return [
		"---",
		"logstamp: 1",
		`日付: ${e.date}`,
		`時刻: "${e.time}"`,
		`作成: ${created}`,
		"---",
		...entryLines(e),
	].join("\n") + "\n";
}

function frontmatterEnd(L: Line[]): number {
	if (L[0]?.text.trimEnd() !== "---") return -1;
	for (let i = 1; i < L.length; i++) if (L[i]?.text.trimEnd() === "---") return i;
	return -1;
}

const unquote = (v: string): string => {
	const t = v.trim();
	return /^(["']).*\1$/.test(t) ? t.slice(1, -1) : t;
};

export function parseInbox(text: string): InboxItem | null {
	const L = splitLines(text);
	const end = frontmatterEnd(L);
	if (end < 0) return null;
	const fm = new Map<string, string>();
	for (let i = 1; i < end; i++) {
		const m = /^([^:]+):(.*)$/.exec(L[i]?.text ?? "");
		if (m?.[1] !== undefined) fm.set(m[1].trim(), unquote(m[2] ?? ""));
	}
	const date = fm.get("日付") ?? "";
	const created = fm.get("作成") ?? "";
	if (fm.get("logstamp") !== "1" || date === "" || created === "") return null;

	const rest = L.slice(end + 1).map((l) => l.text);
	while (rest.length && rest[0]?.trim() === "") rest.shift();
	const head = (rest.shift() ?? "").trimEnd();
	if (!isEntryHeading(head)) return null;
	while (rest.length && rest[0]?.trim() === "") rest.shift();
	while (rest.length && rest[rest.length - 1]?.trim() === "") rest.pop();

	const m = /^### \S+ \[(\d{2}:\d{2})\] (.*)$/u.exec(head);
	const time = m?.[1] ?? "";
	const heading = m?.[2] ?? "";
	if (validateEntry({ date, time, heading, body: rest.join("\n") }) !== null) return null;
	const imported = fm.get(IMPORTED_KEY);
	return { date, created, imported: imported ? imported : null, time, heading, headingLine: head, body: rest };
}

/** INV-5: frontmatter の閉じ `---` の直前に `取り込み: <stamp>` を1行足す。足せない・既にあるときは null */
export function markImported(text: string, stamp: string): string | null {
	const L = splitLines(text);
	const end = frontmatterEnd(L);
	if (end < 0) return null;
	for (let i = 1; i < end; i++) if (L[i]?.text.startsWith(IMPORTED_KEY + ":")) return null;
	const eol = L[end - 1]?.eol || "\n";
	const line = `${IMPORTED_KEY}: ${stamp}`;
	const out = [...L.slice(0, end), { text: line, eol }, ...L.slice(end)];
	const result = out.map((l) => l.text + l.eol).join("");
	// 足した1行を除くと元に戻るか
	const back = splitLines(result);
	back.splice(end, 1);
	return back.map((l) => l.text + l.eol).join("") === text ? result : null;
}

/** `作成` の古い順(読めない物は後ろ。同じならパス順) */
export function byCreated<T extends { created: string; path: string }>(a: T, b: T): number {
	const ka = Date.parse(a.created), kb = Date.parse(b.created);
	const x = Number.isNaN(ka) ? Infinity : ka, y = Number.isNaN(kb) ? Infinity : kb;
	if (x !== y) return x < y ? -1 : 1;
	return a.path < b.path ? -1 : a.path > b.path ? 1 : 0;
}
