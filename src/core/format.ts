// 入力の検証(FR-3)・本文の整形(FR-5)・項目の見出し行と行の並び(FR-4・INV-2)。
// コードフェンスの内外の判定もここ(insert.ts も使う)。obsidian を import しない。
import { S } from "../strings";
import { isValidDate, isValidTime } from "./dates";

export interface EntryInput {
	date: string;
	time: string;
	heading: string;
	body: string;
}

/** 検証と整形を通った項目。lines はログに入れる行(見出し行・空行・本文) */
export interface Entry {
	date: string;
	time: string;
	heading: string;
	headingLine: string;
	body: string[];
}

export const CLOCK = "\u{1F552}"; // 🕒。異体字セレクタ U+FE0F は付けない(D-15)

/** INV-2 の見出し行 */
export const HEADING_RE = /^### \u{1F552} \[(\d{2}):(\d{2})\] \S.*$/u;

export function isEntryHeading(line: string): boolean {
	const m = HEADING_RE.exec(line);
	return !!m && Number(m[1]) <= 23 && Number(m[2]) <= 59 && !line.includes("\u{FE0F}");
}

/** コードフェンス(``` か ~~~)の内外を1行ずつ追う。step は「その行がコードブロックの一部か」を返す */
export function fenceWalker(): { step(line: string): boolean; isOpen(): boolean } {
	let open: { ch: string; len: number } | null = null;
	return {
		step(line: string): boolean {
			if (open) {
				const c = /^ {0,3}(`{3,}|~{3,})\s*$/.exec(line);
				if (c?.[1] && c[1][0] === open.ch && c[1].length >= open.len) open = null;
				return true;
			}
			const o = /^ {0,3}(`{3,}|~{3,})(.*)$/.exec(line);
			if (o?.[1] && !(o[1][0] === "`" && (o[2] ?? "").includes("`"))) {
				open = { ch: o[1][0] ?? "`", len: o[1].length };
				return true;
			}
			return false;
		},
		isOpen: () => open !== null,
	};
}

export const splitInputLines = (s: string): string[] => s.split(/\r\n|\r|\n/);

const normHeading = (h: string): string => h.replace(/\u{FE0F}/gu, "").trim();

/** FR-3。当たれば §9.3 の文言を返す。調べる順は §9.3 の表の順 */
export function validateEntry(input: EntryInput): string | null {
	const heading = normHeading(input.heading);
	if (heading === "") return S.errHeadingEmpty;
	if (/[\r\n\u{2028}\u{2029}]/u.test(heading)) return S.errHeadingNewline;
	if (!isValidDate(input.date.trim())) return S.errDate;
	if (!isValidTime(input.time.trim())) return S.errTime;
	const lines = splitInputLines(input.body);
	for (let i = 0; i < lines.length; i++) {
		const line = lines[i] ?? "";
		const bare = line.replace(/\s/g, "");
		if (/^#{1,6}[ \t]/.test(line) || /^(-+|\*+|_+|=+)$/.test(bare)) return S.errBodyLine(i + 1);
	}
	const fw = fenceWalker();
	for (const line of lines) fw.step(line);
	if (fw.isOpen()) return S.errBodyFence;
	return null;
}

/** FR-5: 行末の空白・先頭と末尾の空行を消し、bulletize なら箇条書きにする(コードブロックの中は除く) */
export function formatBody(body: string, bulletize: boolean): string[] {
	const lines = splitInputLines(body).map((l) => l.trimEnd());
	while (lines.length && lines[0] === "") lines.shift();
	while (lines.length && lines[lines.length - 1] === "") lines.pop();
	if (!bulletize) return lines;
	const fw = fenceWalker();
	return lines.map((l) => {
		if (fw.step(l)) return l; // ponytail: コードブロックの中は箇条書きにしない(仕様書に無い。NOTES の提案)
		if (l === "" || /^(- |\* |\d+\. )/.test(l) || /^\s/.test(l)) return l;
		return "- " + l;
	});
}

export function headingLine(time: string, heading: string): string {
	return `### ${CLOCK} [${time}] ${heading}`;
}

/** 検証済みの入力から項目を作る(FR-4・FR-5) */
export function buildEntry(input: EntryInput, bulletize: boolean): Entry {
	const time = input.time.trim();
	const heading = normHeading(input.heading);
	return { date: input.date.trim(), time, heading, headingLine: headingLine(time, heading), body: formatBody(input.body, bulletize) };
}

/** ログに入れる行(見出し行。本文があれば空行と本文) */
export function entryLines(e: Pick<Entry, "headingLine" | "body">): string[] {
	return e.body.length ? [e.headingLine, "", ...e.body] : [e.headingLine];
}

/** 確定の処理。検証に落ちたら save を呼ばずに文言を返す(AC-9) */
export async function submitEntry<T>(
	input: EntryInput, bulletize: boolean, save: (e: Entry) => Promise<T>,
): Promise<{ ok: false; message: string } | { ok: true; value: T }> {
	const err = validateEntry(input);
	if (err) return { ok: false, message: err };
	return { ok: true, value: await save(buildEntry(input, bulletize)) };
}
