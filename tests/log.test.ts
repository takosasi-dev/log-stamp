// ログへの挿入(AC-2・AC-15・FR-12・FR-14)と、既存 CLI の読み方の写しでの確かめ(§8.4)。
/* global process -- vitest は Node で動き、実 vault を読むのは skipIf の所だけ */
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { countEntry, h1Warning, insertEntry, newLogText, splitLines } from "../src/core/insert";
import { check86, H } from "./helpers";
import { buildEntry, entryLines } from "../src/core/format";

// insertEntry(§9.4)の検体 (a)〜(g)(AC-2)とバイト単位の一致、改行の混在(AC-15)、FR-12・FR-14・§10 の H1。
// 検体は §8.1 の形だけを写した合成の物(実物のログの文章は入れない)。
describe("insert", () => {
	const SUM = "## この日の総括";
	const B = [H("09:31", "SampleKit: 切り替えキーを Ctrl+Shift+K に変えた"), "", "- 起動時の音が鳴らなくなった"];
	const BTXT = `${B[0]}\n\n${B[2]}\n`;

	function ins(text: string, entry = B): string {
		const r = insertEntry(text, entry, SUM);
		if (!r.ok) throw new Error("insert failed");
		expect(check86(text, r.text).ok).toBe(true);
		return r.text;
	}

	describe("insertEntry: AC-2 の7つの検体", () => {
		it("(a) 総括の前が --- と空行(2026-09-25 の形。§9.4 の例)", () => {
			const t = `# 2026-09-25 開発ログ\n\n${H("09:00", "A: x")}\n\n- a\n\n---\n\n${SUM}\n\n- **A**: x\n`;
			expect(ins(t)).toBe(`# 2026-09-25 開発ログ\n\n${H("09:00", "A: x")}\n\n- a\n\n---\n\n${BTXT}\n---\n\n${SUM}\n\n- **A**: x\n`);
		});

		it("(b) 総括の直前に空行も --- も無い", () => {
			const t = `# d\n\n${H("09:00", "A")}\n\n- a\n${SUM}\n- s\n`;
			expect(ins(t)).toBe(`# d\n\n${H("09:00", "A")}\n\n- a\n\n---\n\n${BTXT}\n---\n\n${SUM}\n- s\n`);
		});

		it("(c) 総括の後ろに項目がある(2026-09-24 の形)。最初の総括の前に足し、後ろには触れない", () => {
			const tail = `${SUM}\n\n- s\n\n${H("09:30", "C")}\n\n- c\n\n---\n\n---\n\n${H("12:57", "D")}\n`;
			const t = `# d\n\n${H("09:00", "A")}\n\n---\n\n${tail}`;
			expect(ins(t)).toBe(`# d\n\n${H("09:00", "A")}\n\n---\n\n${BTXT}\n---\n\n${tail}`);
		});

		it("(d) 総括が無い(§8.2 の実物の末尾: --- と空行で終わる)", () => {
			const t = `# d\n\n${H("09:00", "A")}\n\n- a\n\n---\n\n`;
			expect(ins(t)).toBe(`${t}${BTXT}\n---\n\n`);
		});

		it("(d) 総括が無く、--- で終わらない・最後の行に改行が無い", () => {
			expect(ins(`# d\n\n${H("09:00", "A")}\n\n- a\n`)).toBe(`# d\n\n${H("09:00", "A")}\n\n- a\n\n---\n\n${BTXT}\n---\n\n`);
			expect(ins(`# d\n\n${H("09:00", "A")}\n\n- a`)).toBe(`# d\n\n${H("09:00", "A")}\n\n- a\n\n---\n\n${BTXT}\n---\n\n`);
		});

		it("(e) H1 だけのファイル(AC-14 の形: `# <日付> 開発ログ\\n\\n### ` で始まる)", () => {
			const t = newLogText("# {date} 開発ログ", "2026-09-26");
			expect(t).toBe("# 2026-09-26 開発ログ\n");
			const r = ins(t);
			expect(r).toBe(`# 2026-09-26 開発ログ\n\n${BTXT}\n---\n\n`);
			expect(r.startsWith("# 2026-09-26 開発ログ\n\n### ")).toBe(true);
			expect(r.charCodeAt(0)).not.toBe(0xfeff);
		});

		it("(f) 前半 CRLF・後半 LF で、総括が CRLF の側にある(2026-09-24 の形)", () => {
			const head = `# d\r\n\r\n${H("23:58", "A")}\r\n\r\n- a\r\n\r\n---\r\n\r\n`;
			const tail = `${SUM}\r\n\r\n- s\n\n${H("09:30", "C")}\n\n- c\n`;
			const r = ins(head + tail);
			expect(r).toBe(`${head}${B[0]}\r\n\r\n${B[2]}\r\n\r\n---\r\n\r\n${tail}`);
		});

		it("(g) コードブロックの中にだけ総括の見出しがある → 総括が無いものとして末尾", () => {
			const t = `# d\n\n${H("09:00", "A")}\n\n\`\`\`\n${SUM}\n\`\`\`\n`;
			expect(ins(t)).toBe(`${t}\n---\n\n${BTXT}\n---\n\n`);
			const t2 = `# d\n\n~~~md\n${SUM}\n~~~\n`;
			expect(ins(t2)).toBe(`${t2}\n---\n\n${BTXT}\n---\n\n`);
		});
	});

	describe("insertEntry: そのほかの形", () => {
		it("本文の無い項目", () => {
			expect(ins("# d\n", [H("10:00", "X")])).toBe(`# d\n\n${H("10:00", "X")}\n\n---\n\n`);
		});

		it("総括が2つあれば最初の前。行末に空白のある総括も総括として扱う", () => {
			const t = `# d\n\n---\n\n${SUM}  \n\n${SUM}\n`;
			expect(ins(t)).toBe(`# d\n\n---\n\n${BTXT}\n---\n\n${SUM}  \n\n${SUM}\n`);
		});

		it("総括が1行目にある", () => {
			expect(ins(`${SUM}\n- s\n`)).toBe(`${BTXT}\n---\n\n${SUM}\n- s\n`);
		});

		it("空のファイルにも足せる(取り込み側は先に H1 を足す)", () => {
			expect(ins("")).toBe(`${BTXT}\n---\n\n`);
		});

		it("改行の無い1行だけのファイルは \\n を使う。CRLF だけのファイルで最後に改行が無ければ CRLF", () => {
			expect(ins("# d")).toBe(`# d\n\n${BTXT}\n---\n\n`);
			expect(ins("# d\r\n- a")).toBe(`# d\r\n- a\r\n\r\n---\r\n\r\n${B[0]}\r\n\r\n${B[2]}\r\n\r\n---\r\n\r\n`);
		});

		it("総括の見出しが空なら総括は無いものとする", () => {
			const r = insertEntry("# d\n\n- a\n", B, "");
			expect(r.ok && r.text).toBe(`# d\n\n- a\n\n---\n\n${BTXT}\n---\n\n`);
		});

		it("FR-12・INV-4: 改行を含む行・総括と同じ行は書かない(元を変えない)", () => {
			expect(insertEntry("# d\n", [H("09:00", "a\nb")], SUM)).toEqual({ ok: false });
			expect(insertEntry("# d\n", [H("09:00", "a"), "", SUM], SUM)).toEqual({ ok: false });
		});
	});

	describe("AC-15: 前半 CRLF・後半 LF のファイルに3件取り込む", () => {
		it("§8.6 の検査が OK で、足した行がすべて \\r\\n で終わる", () => {
			const before = `# d\r\n\r\n${H("23:00", "A")}\r\n\r\n- a\r\n\r\n---\r\n\r\n${SUM}\r\n\r\n- s\r\n${H("09:30", "C")}\n\n- c\n`;
			let t = before;
			for (const [i, time] of ["10:00", "10:05", "10:10"].entries()) t = ins(t, [H(time, `E${i}: x`), "", `- b${i}`]);
			const c = check86(before, t);
			expect(c.ok).toBe(true);
			expect(c.added.length).toBe(3 * 6); // 見出し・空行・本文・空行・---・空行
			for (const l of c.added) expect(l.endsWith("\r\n")).toBe(true);
		});
	});

	describe("countEntry(FR-14・FR-16)", () => {
		const item = { headingLine: B[0] ?? "", body: [B[2] ?? ""] };
		it("1回・2回・0回", () => {
			const once = ins("# d\n");
			expect(countEntry(once, item)).toBe(1);
			const twice = ins(once);

			expect(countEntry(twice, item)).toBe(2);
			expect(countEntry("# d\n", item)).toBe(0);
		});
		it("本文が違えば別の項目。空行は飛ばして比べる。CRLF も同じに読む", () => {
			expect(countEntry(`${B[0]}\n\n- 別の本文\n`, item)).toBe(0);
			expect(countEntry(`${B[0]}\r\n\r\n\r\n${B[2]}\r\n`, item)).toBe(1);
			expect(countEntry(`${B[0]}\n`, item)).toBe(0);
			expect(countEntry(`${B[0]}\n`, { headingLine: item.headingLine, body: [] })).toBe(1);
		});
	});

	describe("§10 の H1", () => {
		it("H1 が無い・日付が違う・合っている", () => {
			expect(h1Warning(`${H("09:00", "a")}\n`, "2026-09-26")).toBe("H1 がありません");
			expect(h1Warning("# 2026-09-25 開発ログ\n", "2026-09-26")).toBe("H1 の日付が違います");
			expect(h1Warning("# 2026-09-26 開発ログ\n", "2026-09-26")).toBeNull();
		});
	});

	describe("splitLines", () => {
		it("改行の種類を行ごとに持つ", () => {
			expect(splitLines("a\r\nb\nc")).toEqual([{ text: "a", eol: "\r\n" }, { text: "b", eol: "\n" }, { text: "c", eol: "" }]);
			expect(splitLines("")).toEqual([]);
			expect(splitLines("a\n\n")).toEqual([{ text: "a", eol: "\n" }, { text: "", eol: "\n" }]);
		});
	});
});

// 既存 CLI(この書式の開発ログを読む、作者の手元の道具 A〜D。公開していない)の読み方を JS に移した物で、LogStamp が足した項目が1件として読まれるか。
// 本物の CLI(Python)で確かめる AC-16〜AC-18 の代わりにはならない(実機待ち)。ずれを早く見つけるための写し。
describe("cli-compat", () => {
	// 読む道具 A(見出しの形3つと、項目の終わりの形)
	const A_HEADS = [
		/^###\s*(?:🕒\s*)?\[(?<time>[^\]]+)\]\s+(?<subject>.+?)\s*$/u,
		/^###\s*(?:🕒\s*)?(?<time>翌?\d{1,2}:(?:\d{2}|XX)(?:\s?[AP]M)?(?:\s*[〜~-]\s*\d{1,2}:\d{2})?)\s+(?<subject>.+?)\s*$/u,
		/^###\s*🕒\s*(?<subject>.+?)\s*$/u,
	];
	const A_END = /^#{1,2}\s/;
	function entriesA(text: string): { time: string; subject: string; body: string[] }[] {
		const out: { time: string; subject: string; body: string[] }[] = [];
		let cur: { time: string; subject: string; body: string[] } | null = null;
		for (const line of text.split(/\r\n|\n/)) {
			const m = A_HEADS.map((h) => h.exec(line)).find((x) => x);
			if (m) {
				cur = { time: (m.groups?.time ?? "").trim(), subject: (m.groups?.subject ?? "").trim(), body: [] };
				out.push(cur);
				continue;
			}
			if (A_END.test(line)) {
				cur = null;
				continue;
			}
			cur?.body.push(line);
		}
		return out;
	}

	// 読む道具 B(見出しの形の1つ目)
	const B_HEAD = /^### (?:🕒 )?\[(?<hour>\d{1,2}):(?<minute>\d{2})\] (?<title>.+)$/u;
	// 読む道具 C(合わない ### があるとファイルごと飛ばす)
	const C_HEADS = [/^### 🕒 .+$/u, /^### \d{1,2}:\d{2} .+$/, /^### \[\d{1,2}:\d{2}\] .+$/];
	// 読む道具 D(### の後ろが 🕒 で始まらなければ odd)
	const dOdd = (line: string): boolean => line.startsWith("### ") && !line.slice(4).trimStart().startsWith("🕒");

	const SUM = "## この日の総括";
	const BASE = [
		"# 2026-09-25 開発ログ", "",
		H("09:00", "SampleKit: 切り分け"), "", "- a", "", "---", "",
		H("10:00", "SampleKit を公開"), "", "### 提案", "- 時刻の無い H3 は前の項目の本文", "", "---", "",
		SUM, "", "- **SampleKit**: まとめ", "",
	].join("\n");

	const INPUTS = [
		{ time: "09:31", heading: "SampleKit: 切り替えキーを Ctrl+Shift+K に変えた", body: "通知が出なくなった\n二行目" },
		{ time: "00:00", heading: "コロンの無い見出し [角括弧] 入り", body: "" },
		{ time: "23:59", heading: "SampleApp：全角コロン", body: "```\ncode\n```" },
	];

	describe("§8.4 の読み方で、足した3件が読める", () => {
		const valid = INPUTS;
		let after = BASE;
		for (const x of valid) {
			const r = insertEntry(after, entryLines(buildEntry({ date: "2026-09-25", ...x }, true)), SUM);
			if (r.ok) after = r.text;
		}

		it("読む道具 A(AC-16 の写し): 項目数が3多く、時刻と件名が入力どおり", () => {
			const before = entriesA(BASE);
			const now = entriesA(after);
			expect(now.length).toBe(before.length + 3);
			const added = now.filter((e) => !before.some((b) => b.time === e.time && b.subject === e.subject));
			expect(added.map((e) => [e.time, e.subject])).toEqual(valid.map((x) => [x.time, x.heading]));
		});

		it("読む道具 B(AC-17 の写し): 足した見出しが1つ目の形で読め、時と分と件名が取れる", () => {
			for (const x of valid) {
				const line = after.split("\n").find((l) => l.endsWith(x.heading)) ?? "";
				const m = B_HEAD.exec(line);
				expect(m?.groups).toEqual({ hour: x.time.slice(0, 2), minute: x.time.slice(3), title: x.heading });
			}
		});

		it("読む道具 C: ### の行はどれもパターンに合う(ファイルを飛ばされない)。読む道具 D: odd にならない", () => {
			const h3 = after.split("\n").filter((l) => l.startsWith("### ") && l !== "### 提案");
			expect(h3.length).toBe(5);
			for (const l of h3) expect(C_HEADS.some((r) => r.test(l)), l).toBe(true);
			expect(h3.filter(dOdd)).toEqual([]);
		});
	});
	// 実 vault の開発ログ(読むだけ)。OP_REAL_VAULT に vault のフォルダを渡したときだけ動く。本文はリポジトリに写さず、数だけ NOTES に書く。
	describe.skipIf(!process.env.OP_REAL_VAULT)("実 vault の開発ログの全ファイルに1件足す(書き込まない)", () => {
		const dir = join(process.env.OP_REAL_VAULT ?? "", "開発ログ");
		const names = process.env.OP_REAL_VAULT ? readdirSync(dir).filter((n) => /^\d{4}-\d{2}-\d{2}\.md$/.test(n)) : [];
		const entry = entryLines(buildEntry({ date: "2026-10-10", time: "12:34", heading: "LogStamp: 照合用の項目", body: "一行目\n二行目" }, true));
		it("どのファイルでも §8.6 の検査が OK、足した行の改行は直前の行と同じ、読む道具 A の写しで1件増える", () => {
			expect(names.length).toBeGreaterThan(0);
			const stat = { files: 0, beforeSummary: 0, atEnd: 0, crlfAdded: 0 };
			for (const n of names) {
				const text = readFileSync(join(dir, n), "utf8");
				const r = insertEntry(text, entry, SUM);
				expect(r.ok, n).toBe(true);
				if (!r.ok) continue;
				const c = check86(text, r.text);
				expect(c.ok, n).toBe(true);
				const eols = new Set(c.added.map((l) => (l.endsWith("\r\n") ? "crlf" : l.endsWith("\n") ? "lf" : "none")));
				expect(eols.size, n).toBe(1);
				expect(eols.has("none"), n).toBe(false);
				expect(entriesA(r.text).length, n).toBe(entriesA(text).length + 1);
				expect(countEntry(r.text, { headingLine: entry[0] ?? "", body: entry.slice(2) }), n).toBe(1);
				stat.files++;
				if (r.text.endsWith(text.slice(text.indexOf(SUM)))) stat.beforeSummary++;
				else stat.atEnd++;
				if (eols.has("crlf")) stat.crlfAdded++;
			}
			expect(stat.files).toBe(names.length);
			process.stdout.write(`real-vault: ${JSON.stringify(stat)}\n`);
		});
	});
});
