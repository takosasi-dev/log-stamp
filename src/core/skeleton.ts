// 総括の骨組み(§9.6・FR-17)をログの見出しから作る純関数。クリップボードに出すだけで、ファイルには書かない(D-19)。
// 区切り(: か ：)の前を語として語ごとにまとめ、区切りの無い見出しは後ろに並べる。obsidian を import しない。
import { splitLines } from "./insert";

const ITEM_RE = /^### (?:\u{1F552} )?\[(\d{2}:\d{2})\] (.*)$/u;

export function buildSkeleton(text: string, summaryHeading: string, tail: string[]): { text: string; count: number } {
	const groups = new Map<string, string[]>();
	const loose: string[] = [];
	let count = 0;
	for (const l of splitLines(text)) {
		const m = ITEM_RE.exec(l.text.trimEnd());
		if (!m) continue;
		count++;
		const time = m[1] ?? "";
		const title = (m[2] ?? "").trim();
		const cut = [title.indexOf(":"), title.indexOf("：")].filter((i) => i > 0);
		const word = cut.length ? title.slice(0, Math.min(...cut)).trim() : "";
		if (word === "") {
			loose.push(`- [${time}] ${title}`);
			continue;
		}
		const rest = title.slice(Math.min(...cut) + 1).trim();
		const g = groups.get(word) ?? [];
		g.push(`  - [${time}] ${rest}`);
		groups.set(word, g);
	}
	const out = [summaryHeading, ""];
	for (const [word, items] of groups) out.push(`- **${word}**: `, ...items);
	out.push(...loose, ...tail);
	return { text: out.join("\n") + "\n", count };
}
