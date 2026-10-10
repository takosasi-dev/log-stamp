// 純関数のテスト: 日付(AC-8)・検証と整形(AC-6・AC-9)・設定(§9.2)・総括の骨組み(AC-23)。
import { describe, expect, it, vi } from "vitest";
import { formatDate, formatHms, formatTime, isoWithOffset, isValidDate, isValidTime } from "../src/core/dates";
import { buildEntry, type EntryInput, entryLines, formatBody, HEADING_RE, isEntryHeading, submitEntry, validateEntry } from "../src/core/format";
import { S } from "../src/strings";
import { DEFAULTS, importHereKey, isSameOrInside, loadSettings } from "../src/settings";
import { buildSkeleton } from "../src/core/skeleton";
import { H } from "./helpers";

// 日付と時刻(FR-2・AC-8)。Date は現地時刻で作るので、TZ=Asia/Tokyo でもほかの時刻帯でも同じに通る。
describe("dates", () => {
	describe("AC-8: 0:00 からは翌日の日付", () => {
		it("2026-09-26T23:59:30 → 2026-09-26、2026-09-27T00:00:10 → 2026-09-27", () => {
			expect(formatDate(new Date(2026, 8, 26, 23, 59, 30))).toBe("2026-09-26");
			expect(formatDate(new Date(2026, 8, 27, 0, 0, 10))).toBe("2026-09-27");
		});
		it("時刻は24時間・0埋め", () => {
			const d = new Date(2026, 0, 2, 9, 5, 7);
			expect(formatTime(d)).toBe("09:05");
			expect(formatHms(d)).toBe("090507");
		});
		it("作成の時刻は現地時刻と UTC からの差", () => {
			const s = isoWithOffset(new Date(2026, 8, 26, 9, 31, 12));
			expect(s).toMatch(/^2026-09-26T09:31:12[+-]\d{2}:\d{2}$/);
			expect(new Date(s).getTime()).toBe(new Date(2026, 8, 26, 9, 31, 12).getTime());
		});
	});

	describe("実在する日付・00:00〜23:59", () => {
		it("日付", () => {
			expect(isValidDate("2026-02-28")).toBe(true);
			expect(isValidDate("2026-02-29")).toBe(false);
			expect(isValidDate("2028-02-29")).toBe(true);
			expect(isValidDate("2026-13-01")).toBe(false);
			expect(isValidDate("2026-09-26 ")).toBe(false);
		});
		it("時刻", () => {
			for (const t of ["00:00", "09:05", "23:59"]) expect(isValidTime(t)).toBe(true);
			for (const t of ["24:00", "9:05", "12:60", "12:5", "1200"]) expect(isValidTime(t)).toBe(false);
		});
	});
});

// 入力の検証(FR-3・AC-9)、見出し行(FR-4・INV-2・AC-6)、本文の整形(FR-5)。
describe("format", () => {
	const ok: EntryInput = { date: "2026-09-26", time: "09:31", heading: "SampleKit: ホットキーを変えた", body: "通知が出なくなった" };

	describe("AC-9: FR-3 の7つの条件は §9.3 の文言を返し、受け箱を作る関数を呼ばない", () => {
		const cases: [string, Partial<EntryInput>, string][] = [
			["見出しが空", { heading: "  " }, S.errHeadingEmpty],
			["見出しに改行", { heading: "a\nb" }, S.errHeadingNewline],
			["日付が実在しない", { date: "2026-02-30" }, S.errDate],
			["時刻が範囲外", { time: "24:00" }, S.errTime],
			["本文に見出し行", { body: "ok\n## 見出し" }, S.errBodyLine(2)],
			["本文に区切り線", { body: "a\nb\n - - - \nc" }, S.errBodyLine(3)],
			["本文のフェンスが閉じていない", { body: "```js\ncode" }, S.errBodyFence],
		];
		for (const [name, patch, msg] of cases) {
			it(name, async () => {
				const save = vi.fn(() => Promise.resolve("saved"));
				const r = await submitEntry({ ...ok, ...patch }, true, save);
				expect(r).toEqual({ ok: false, message: msg });
				expect(save).not.toHaveBeenCalled();
			});
		}

		it("文言は §9.3 の文そのまま", () => {
			expect(S.errBodyLine(3)).toBe("本文の 3 行目は見出しか区切り線になるので入れられません");
			expect(S.errTime).toBe("時刻は 00:00〜23:59 の HH:MM にしてください");
		});

		it("通る入力は save を1回呼ぶ", async () => {
			const save = vi.fn(() => Promise.resolve("saved"));
			const r = await submitEntry(ok, true, save);
			expect(r).toEqual({ ok: true, value: "saved" });
			expect(save).toHaveBeenCalledTimes(1);
		});

		it("そのほかの検証の端", () => {
			const v = (p: Partial<EntryInput>): string | null => validateEntry({ ...ok, ...p });
			expect(v({ heading: "a\u{2028}b" })).toBe(S.errHeadingNewline);
			expect(v({ date: "2026-9-26" })).toBe(S.errDate);
			expect(v({ date: "2028-02-29" })).toBeNull();
			expect(v({ time: "9:05" })).toBe(S.errTime);
			expect(v({ time: "23:60" })).toBe(S.errTime);
			expect(v({ body: "#タグは見出しでない\n- 箇条書き\n1. 番号" })).toBeNull();
			expect(v({ body: "x\n===" })).toBe(S.errBodyLine(2));
			expect(v({ body: "x\n-" })).toBe(S.errBodyLine(2));
			expect(v({ body: "x\n**" })).toBe(S.errBodyLine(2));
			expect(v({ body: "```\na\n```\n~~~~\nb\n~~~~" })).toBeNull();
			expect(v({ body: "````\na\n```\n" })).toBe(S.errBodyFence);
			expect(v({ heading: "", time: "99:99" })).toBe(S.errHeadingEmpty); // 調べる順は §9.3 の表の順
		});
	});

	describe("AC-6: 100 通りの見出しと時刻で、見出し行が INV-2 を満たす", () => {
		const headings = [
			"日本語の見出し", "English heading", "SampleKit: ホットキーを変えた", "コロンなしの見出し", "[角括弧] を含む [x]",
			"a", "SampleApp：全角コロン", "SampleGame M3: 当たり判定と速度", "見出し — ダッシュ", "数字 123 と記号 !?",
			"  前後に空白  ", "絵文字の後ろの異体字 ✔\u{FE0F} を消す", "[09:00] の形を中に含む", "パス L:\\foo\\bar", "`code` を含む",
			"**太字**", "ab: cd: ef", "x]", "[", "最後",
		];
		const times = ["00:00", "09:05", "23:59", "12:30", "00:59"];
		const combos = headings.flatMap((h) => times.map((t) => ({ h, t })));
		it("100 通り", () => {
			expect(combos.length).toBe(100);
			for (const { h, t } of combos) {
				const line = buildEntry({ date: "2026-09-26", time: t, heading: h, body: "" }, true).headingLine;
				const m = HEADING_RE.exec(line);
				expect(m, line).not.toBeNull();
				expect(Number(m?.[1])).toBeLessThanOrEqual(23);
				expect(Number(m?.[2])).toBeLessThanOrEqual(59);
				expect(line.includes("\u{FE0F}")).toBe(false);
				expect(line.startsWith(`### \u{1F552} [${t}] `)).toBe(true);
				expect(isEntryHeading(line)).toBe(true);
			}
		});
		it("U+FE0F 付きの時計は INV-2 に合わない", () => {
			expect(isEntryHeading("### \u{1F552}\u{FE0F} [09:00] a")).toBe(false);
			expect(isEntryHeading("### \u{1F552} [24:00] a")).toBe(false);
			expect(isEntryHeading("### \u{1F552} [09:00]  a")).toBe(false);
		});
	});

	describe("FR-5: 本文の整形", () => {
		it("行末の空白・先頭と末尾の空行を消し、箇条書きにする", () => {
			expect(formatBody("\n\n一行目  \n- 既に箇条書き\n* 星\n12. 番号\n  字下げ\n\n最後\t\n\n", true))
				.toEqual(["- 一行目", "- 既に箇条書き", "* 星", "12. 番号", "  字下げ", "", "- 最後"]);
		});
		it("bulletize が false なら箇条書きにしない", () => {
			expect(formatBody("a \r\nb", false)).toEqual(["a", "b"]);
		});
		it("コードブロックの中は箇条書きにしない", () => {
			expect(formatBody("前\n```\ncode\n```\n後", true)).toEqual(["- 前", "```", "code", "```", "- 後"]);
		});
		it("本文が空なら見出し行だけ。あれば見出し行・空行・本文", () => {
			expect(entryLines(buildEntry({ ...ok, body: " \n " }, true))).toEqual(["### \u{1F552} [09:31] SampleKit: ホットキーを変えた"]);
			expect(entryLines(buildEntry(ok, true))).toEqual(["### \u{1F552} [09:31] SampleKit: ホットキーを変えた", "", "- 通知が出なくなった"]);
		});
	});
});

// 設定(§9.2): 既定値・欠けた項目の補い・壊れた data.json・受け箱が開発ログフォルダの中かの判定(INV-3)。
describe("settings", () => {
	describe("data.json", () => {
		it("キーは §9.2 の7つだけ(AC-11。「この端末で取り込む」は入らない)", () => {
			expect(Object.keys(DEFAULTS).sort()).toEqual(
				["bulletize", "inboxFolder", "logFolder", "schemaVersion", "skeletonTail", "summaryHeading", "titleFormat"]);
			expect(DEFAULTS).toEqual({
				schemaVersion: 1, logFolder: "開発ログ", titleFormat: "# {date} 開発ログ", summaryHeading: "## この日の総括",
				inboxFolder: "開発ログ受け箱", bulletize: true, skeletonTail: ["- **学び**: "],
			});
		});
		it("初回(null)は既定値で、壊れていない扱い", () => {
			expect(loadSettings(null)).toEqual({ settings: DEFAULTS, broken: false });
		});
		it("欠けた項目・型の違う項目は既定値で埋める。知らないキーは捨てる", () => {
			const r = loadSettings({ schemaVersion: 1, logFolder: "log", bulletize: "yes", extra: 1 });
			expect(r.broken).toBe(false);
			expect(r.settings).toEqual({ ...DEFAULTS, logFolder: "log" });
		});
		it("schemaVersion が違う・形が壊れている・受け箱が開発ログの中 → 既定値で broken", () => {
			for (const raw of [{ schemaVersion: 2 }, "text", [1], { logFolder: "a", inboxFolder: "a/inbox" }]) {
				expect(loadSettings(raw)).toEqual({ settings: DEFAULTS, broken: true });
			}
		});
		it("既定値は呼ぶたびに別の物(書き換えが DEFAULTS に漏れない)", () => {
			const a = loadSettings(null).settings;
			a.skeletonTail.push("x");
			expect(DEFAULTS.skeletonTail).toEqual(["- **学び**: "]);
		});
		it("端末ごとの値のキーは <id>:import-here", () => {
			expect(importHereKey("log-stamp")).toBe("log-stamp:import-here");
		});
	});

	describe("INV-3: 受け箱は開発ログフォルダの外", () => {
		it("同じ・配下は不可、隣や外はよい", () => {
			expect(isSameOrInside("開発ログ", "開発ログ")).toBe(true);
			expect(isSameOrInside("開発ログ/_inbox", "開発ログ")).toBe(true);
			expect(isSameOrInside("Devlog/inbox", "devlog")).toBe(true);
			expect(isSameOrInside("開発ログ受け箱", "開発ログ")).toBe(false);
			expect(isSameOrInside("メモ/受け箱", "開発ログ")).toBe(false);
			expect(isSameOrInside("受け箱", "/")).toBe(true); // ログが vault 直下なら、どこも配下
		});
	});
});

// 総括の骨組み(§9.6・FR-17・AC-23)。見出しの形(「名前: 中身」・コロンなし・時刻の前後・かっこ・版の表記)をそろえた作り物のログで、期待の文とバイト単位で一致する。
describe("skeleton", () => {
	const SUM = "## この日の総括";
	const LOG = [
		"# 2026-09-25 開発ログ", "",
		H("09:00", "SampleKit: Ctrl+Shift+K が効かない件の切り分け"), "", "- 本文", "", "---", "",
		H("09:30", "エディタを zip 版で入れ直した(予備のPC)"), "", "---", "",
		H("10:00", "SampleKit v0.1.0 の配布物を作成"), "", "---", "",
		H("09:56", "蔵書管理アプリ: Windows版の画面案を作成(v1.1)"), "", "---", "",
		H("10:17", "蔵書管理アプリ: 残りの項目を確定(Windows版 v1.2 / Android版 v1.1)"), "", "---", "",
	].join("\n");

	const EXPECTED = [
		"## この日の総括",
		"",
		"- **SampleKit**: ",
		"  - [09:00] Ctrl+Shift+K が効かない件の切り分け",
		"- **蔵書管理アプリ**: ",
		"  - [09:56] Windows版の画面案を作成(v1.1)",
		"  - [10:17] 残りの項目を確定(Windows版 v1.2 / Android版 v1.1)",
		"- [09:30] エディタを zip 版で入れ直した(予備のPC)",
		"- [10:00] SampleKit v0.1.0 の配布物を作成",
		"- **学び**: ",
		"",
	].join("\n");

	describe("AC-23", () => {
		it("期待の文とバイト単位で一致し、見出しの数を返す", () => {
			const r = buildSkeleton(LOG, SUM, ["- **学び**: "]);
			expect(r.text).toBe(EXPECTED);
			expect(r.count).toBe(5);
		});
	});

	describe("拾う見出し", () => {
		it("時計の無い `### [HH:MM] `・総括の後ろ・全角コロン・CRLF も拾い、それ以外の ### は拾わない", () => {
			const log = `# d\r\n### [23:00] 説明書: 追記\r\n${SUM}\r\n${H("09:30", "SampleApp：全角")}\n### 提案\n### \u{1F552} 23:XX 伏せ時刻\n`;
			const r = buildSkeleton(log, SUM, []);
			expect(r.count).toBe(2);
			expect(r.text).toBe(`${SUM}\n\n- **説明書**: \n  - [23:00] 追記\n- **SampleApp**: \n  - [09:30] 全角\n`);
		});
	});
});
