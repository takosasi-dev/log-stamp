// 受け箱ファイル(§9.5): 作る中身・読み方(形式外の判定)・`取り込み:` の1行(INV-5)・作成の古い順。
import { describe, expect, it } from "vitest";
import { buildEntry } from "../src/core/format";
import { buildInboxText, byCreated, inboxPath, markImported, parseInbox } from "../src/core/inbox";
import { check86, H } from "./helpers";

const entry = buildEntry({ date: "2026-09-26", time: "09:31", heading: "SampleKit: 切り替えキーを Ctrl+Shift+K に変えた", body: "起動時の音が鳴らなくなった" }, true);
const EXAMPLE = [
	"---",
	"logstamp: 1",
	"日付: 2026-09-26",
	"時刻: \"09:31\"",
	"作成: 2026-09-26T09:31:12+09:00",
	"---",
	H("09:31", "SampleKit: 切り替えキーを Ctrl+Shift+K に変えた"),
	"",
	"- 起動時の音が鳴らなくなった",
	"",
].join("\n");

describe("作る", () => {
	it("§9.5 の形と同じ中身(LF・BOM なし)", () => {
		const t = buildInboxText(entry, "2026-09-26T09:31:12+09:00");
		expect(t).toBe(EXAMPLE);
		expect(t.includes("\r")).toBe(false);
	});
	it("名前は <受け箱>/<日付>_<時分秒>_<16進4桁>.md", () => {
		expect(inboxPath("開発ログ受け箱", "2026-09-26", new Date(2026, 8, 26, 9, 31, 12), "a3f0")).toBe("開発ログ受け箱/2026-09-26_093112_a3f0.md");
	});
});

describe("読む", () => {
	it("作った物を読み戻せる", () => {
		expect(parseInbox(EXAMPLE)).toEqual({
			date: "2026-09-26", created: "2026-09-26T09:31:12+09:00", imported: null, time: "09:31",
			heading: "SampleKit: 切り替えキーを Ctrl+Shift+K に変えた", headingLine: entry.headingLine, body: ["- 起動時の音が鳴らなくなった"],
		});
	});
	it("CRLF に直されていても読める。`時刻` より見出し行が優先", () => {
		const t = EXAMPLE.replace("時刻: \"09:31\"", "時刻: \"08:00\"").replace(/\n/g, "\r\n");
		expect(parseInbox(t)?.time).toBe("09:31");
	});
	it("手で直した本文も使う。取り込み済みの印を読む", () => {
		const t = markImported(EXAMPLE.replace("- 起動時の", "- 手で直した。起動時の"), "2026-09-26T20:05:40+09:00") ?? "";
		const p = parseInbox(t);
		expect(p?.body).toEqual(["- 手で直した。起動時の音が鳴らなくなった"]);
		expect(p?.imported).toBe("2026-09-26T20:05:40+09:00");
	});
	it("形式外: logstamp・日付・作成が無い、frontmatter が壊れている、見出し行が INV-2 に合わない、FR-3 に落ちる", () => {
		const bad = [
			EXAMPLE.replace("logstamp: 1\n", ""),
			EXAMPLE.replace("logstamp: 1", "logstamp: 2"),
			EXAMPLE.replace("日付: 2026-09-26\n", ""),
			EXAMPLE.replace("作成: 2026-09-26T09:31:12+09:00\n", ""),
			EXAMPLE.replace(/^---\n/, ""),
			EXAMPLE.replace("---\n###", "###"),
			EXAMPLE.replace("\u{1F552} [09:31]", "\u{1F552}\u{FE0F} [09:31]"),
			EXAMPLE.replace("[09:31]", "[25:31]"),
			EXAMPLE.replace("- 起動時の", "## 起動時の"),
			EXAMPLE.replace("- 起動時の音が鳴らなくなった", "```\n起動時の"),
			EXAMPLE.replace("日付: 2026-09-26", "日付: 2026-09-31"),
			"",
		];
		for (const t of bad) expect(parseInbox(t), t).toBeNull();
	});
});

describe("INV-5: `取り込み:` を1行足す", () => {
	it("frontmatter の閉じ --- の直前に1行だけ足す", () => {
		const t = markImported(EXAMPLE, "2026-09-26T20:05:40+09:00") ?? "";
		expect(t).toBe(EXAMPLE.replace("+09:00\n---\n", "+09:00\n取り込み: 2026-09-26T20:05:40+09:00\n---\n"));
		const c = check86(EXAMPLE, t);
		expect(c.ok).toBe(true);
		expect(c.added).toEqual(["取り込み: 2026-09-26T20:05:40+09:00\n"]);
	});
	it("CRLF のファイルには CRLF で足す", () => {
		const crlf = EXAMPLE.replace(/\n/g, "\r\n");
		expect(check86(crlf, markImported(crlf, "x") ?? "").added).toEqual(["取り込み: x\r\n"]);
	});
	it("既にある・frontmatter が無いときは足さない", () => {
		expect(markImported(markImported(EXAMPLE, "x") ?? "", "y")).toBeNull();
		expect(markImported("本文だけ\n", "x")).toBeNull();
	});
});

describe("作成の古い順", () => {
	it("時差の違う時刻も実際の時刻で比べ、読めない物は後ろ", () => {
		const xs = [
			{ created: "2026-09-26T10:00:00+09:00", path: "b" },
			{ created: "壊れた", path: "a" },
			{ created: "2026-09-26T00:30:00Z", path: "c" }, // = 09:30+09:00
			{ created: "2026-09-26T09:00:00+09:00", path: "d" },
		];
		expect([...xs].sort(byCreated).map((x) => x.path)).toEqual(["d", "c", "b", "a"]);
	});
});
