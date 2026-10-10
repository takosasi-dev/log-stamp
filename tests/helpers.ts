// テスト用の道具: 仕様書 §8.6 の検査(前のファイルの行が順序を保って全部、後のファイルにあるか)の移植と、合成の検体を作る関数。

/** Python の splitlines(keepends=True) のうち \r\n と \n だけを扱う版 */
export function splitKeep(s: string): string[] {
	const out: string[] = [];
	let i = 0;
	while (i < s.length) {
		const j = s.indexOf("\n", i);
		if (j < 0) {
			out.push(s.slice(i));
			break;
		}
		out.push(s.slice(i, j + 1));
		i = j + 1;
	}
	return out;
}

const strip = (l: string): string => l.replace(/\r?\n$/, "");

/** §8.6 の検査。OK なら [] と足された行(後のファイルにだけある行)を返す */
export function check86(before: string, after: string): { ok: boolean; added: string[] } {
	const b = splitKeep(before);
	const a = splitKeep(after);
	let i = 0;
	const added: string[] = [];
	for (const line of a) {
		if (i < b.length && (line === b[i] || (i === b.length - 1 && strip(line) === strip(b[i] ?? "")))) i++;
		else added.push(line);
	}
	return { ok: i === b.length, added };
}

export const CLOCK = "🕒";
export const H = (time: string, heading: string): string => `### ${CLOCK} [${time}] ${heading}`;
