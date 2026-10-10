// ログの本文に項目の行を足す純関数(§9.4 の手順。FR-11〜FR-14)。既存の行は1バイトも変えない(INV-1)。
// 足した後に「足した行を除くと元に戻る」を確かめ、戻らなければ失敗を返す(FR-12・D-17)。obsidian を import しない。
import { S } from "../strings";
import { fenceWalker } from "./format";

export interface Line {
	text: string;
	eol: "\r\n" | "\n" | "";
}

/** 改行(\r\n か \n)で分ける。最後の改行の後ろの空の行は作らない */
export function splitLines(text: string): Line[] {
	const out: Line[] = [];
	let i = 0;
	while (i < text.length) {
		const j = text.indexOf("\n", i);
		if (j < 0) {
			out.push({ text: text.slice(i), eol: "" });
			break;
		}
		const cr = j > i && text[j - 1] === "\r";
		out.push({ text: text.slice(i, cr ? j - 1 : j), eol: cr ? "\r\n" : "\n" });
		i = j + 1;
	}
	return out;
}

const blank = (s: string): boolean => s.trim() === "";
/** H1(BOM 付きのファイルの1行目も H1 として見る。実 vault に BOM 付きが2本ある) */
const isH1 = (s: string): boolean => s.replace(/^\u{FEFF}/u, "").startsWith("# ");

/** コードフェンスの外で、行末の空白を除くと summaryHeading と同じ最初の行。無ければ -1 */
export function findSummary(lines: Line[], summaryHeading: string): number {
	const want = summaryHeading.trimEnd();
	if (want.trim() === "") return -1;
	const fw = fenceWalker();
	for (let i = 0; i < lines.length; i++) {
		const t = lines[i]?.text ?? "";
		if (fw.step(t)) continue;
		if (t.trimEnd() === want) return i;
	}
	return -1;
}

export type InsertResult = { ok: true; text: string } | { ok: false };

/**
 * §9.4 の手順で entry(見出し行・空行・本文)を足す。
 * 総括(S)があればその直前、無ければ末尾。足した項目の後ろには、総括の有無によらず 空行・---・空行 を置く
 * (§8.2 の実物: 総括の無い日のログは `---` と空行で終わる。仮決め、NOTES)。
 */
export function insertEntry(text: string, entry: string[], summaryHeading: string): InsertResult {
	const L = splitLines(text);
	const s = findSummary(L, summaryHeading);
	const at = s >= 0 ? s : L.length;
	const prev = at > 0 ? L[at - 1] : undefined;
	let prevNonEmpty: Line | undefined;
	for (let k = at - 1; k >= 0; k--) {
		const l = L[k];
		if (l && !blank(l.text)) { prevNonEmpty = l; break; }
	}

	const add: string[] = [];
	if (prev && !blank(prev.text)) add.push("");
	if (prevNonEmpty && prevNonEmpty.text.trim() !== "---" && !isH1(prevNonEmpty.text)) add.push("---", "");
	add.push(...entry, "", "---", "");

	// INV-4: 総括の見出しと同じ行・改行を含む行は書かない
	const sum = summaryHeading.trimEnd();
	if (add.some((a) => /[\r\n]/.test(a) || (sum.trim() !== "" && a.trimEnd() === sum))) return { ok: false };

	let lastEol: Line["eol"] = "\n";
	for (const l of L) if (l.eol) lastEol = l.eol;
	const eol: Line["eol"] = prev?.eol ? prev.eol : lastEol;

	const out: Line[] = L.map((l) => ({ ...l }));
	const fixedTail = s < 0 && prev !== undefined && prev.eol === "";
	if (fixedTail) out[out.length - 1] = { text: prev.text, eol }; // 最後の行に改行を1つ付ける(FR-12 で許す唯一の変更)
	out.splice(at, 0, ...add.map((t) => ({ text: t, eol })));
	const result = out.map((l) => l.text + l.eol).join("");

	// FR-12: 結果を分け直し、足した行を除くと元に戻るか
	const back = splitLines(result);
	back.splice(at, add.length);
	const restored = back.map((l) => l.text + l.eol).join("");
	if (restored !== text && !(fixedTail && restored === text + eol)) return { ok: false };
	return { ok: true, text: result };
}

/** FR-14: 同じ見出し行があり、その後の空行を除いた行が本文と同じ並びで続く所の数 */
export function countEntry(text: string, entry: { headingLine: string; body: string[] }): number {
	const L = splitLines(text).map((l) => l.text.trimEnd());
	let n = 0;
	for (let i = 0; i < L.length; i++) {
		if (L[i] !== entry.headingLine) continue;
		let j = 0;
		for (let k = i + 1; k < L.length && j < entry.body.length; k++) {
			const t = L[k] ?? "";
			if (blank(t)) continue;
			if (t !== entry.body[j]?.trimEnd()) break;
			j++;
		}
		if (j === entry.body.length) n++;
	}
	return n;
}

/** 新しく作るログの中身(titleFormat の {date} を日付に。LF・BOM なし) */
export function newLogText(titleFormat: string, date: string): string {
	return titleFormat.split("{date}").join(date) + "\n";
}

/** §10: H1 が無い・H1 の日付がファイル名と違うときの添え書き。問題なければ null */
export function h1Warning(text: string, date: string): string | null {
	const fw = fenceWalker();
	for (const l of splitLines(text)) {
		if (fw.step(l.text)) continue;
		if (isH1(l.text)) return l.text.includes(date) ? null : S.warnH1Date;
	}
	return S.warnNoH1;
}
