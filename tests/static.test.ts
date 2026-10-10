// src/ を文字で調べる受け入れ基準(AC-3・AC-4・AC-5・AC-24)と manifest(AC-25)。毎回のテストで回して戻りを防ぐ。
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

function sources(dir: string): string[] {
	return readdirSync(dir).flatMap((n) => {
		const p = join(dir, n);
		return statSync(p).isDirectory() ? sources(p) : p.endsWith(".ts") ? [p] : [];
	});
}

const src = sources("src").map((p) => ({ p: p.replace(/\\/g, "/"), text: readFileSync(p, "utf8") }));
const hits = (words: string[], skip: string[] = []): string[] =>
	src.filter(({ p }) => !skip.includes(p)).flatMap(({ p, text }) => words.filter((w) => text.includes(w)).map((w) => `${p}: ${w}`));

describe("src/ の文字の検査", () => {
	it("AC-3: Node・Electron・通信が 0 件(INV-6・INV-7)", () => {
		const mods = ["fs", "path", "electron", "child_process"].flatMap((m) => [`from "${m}"`, `from '${m}'`, `from "node:${m}"`, `from 'node:${m}'`]);
		expect(hits(["require(", ...mods, "fetch(", "requestUrl", "XMLHttpRequest", "WebSocket"])).toEqual([]);
	});
	it("AC-4: innerHTML・outerHTML・insertAdjacentHTML が 0 件(INV-8)", () => {
		expect(hits(["innerHTML", "outerHTML", "insertAdjacentHTML"])).toEqual([]);
	});
	it("AC-5: 書き込み系が 0 件。vault.process・vault.create・createFolder は src/io.ts だけ(INV-1)", () => {
		expect(hits([".modify(", ".append(", ".delete(", ".trash(", ".rename(", "adapter.", "fileManager"])).toEqual([]);
		expect(hits(["vault.process", "vault.create", "createFolder"], ["src/io.ts"])).toEqual([]);
		const io = src.find((s) => s.p === "src/io.ts")?.text ?? "";
		for (const w of ["vault.process", "vault.create", "createFolder"]) expect(io.includes(w)).toBe(true);
	});
	it("AC-24: フォルダ名と総括の見出しの文字は settings.ts と strings.ts だけ(D-6)", () => {
		expect(hits(["開発ログ", "この日の総括"], ["src/settings.ts", "src/strings.ts"])).toEqual([]);
	});
	it("後読みの正規表現・console.log が無く、各ファイルの先頭に責務のコメントがある", () => {
		const lookbehind = ["=", "!"].map((c) => "(?<" + c); // 文字のまま書くと eslint の後読みの検査に当たる
		expect(hits([...lookbehind, "console.log"])).toEqual([]);
		for (const { p, text } of src) expect(text.startsWith("// "), p).toBe(true);
	});
	it("core/ は obsidian を import しない(D-5)", () => {
		const core = src.filter(({ p }) => p.startsWith("src/core/") || p === "src/settings.ts" || p === "src/strings.ts");
		for (const { p, text } of core) expect(/from ["']obsidian["']/.test(text), p).toBe(false);
	});
});

describe("AC-25: manifest.json(§9.1)", () => {
	const m = JSON.parse(readFileSync("manifest.json", "utf8")) as Record<string, unknown>;
	it("id・description・isDesktopOnly", () => {
		expect(m.id).toBe("log-stamp");
		expect(String(m.id)).toMatch(/^[a-z-]+$/);
		expect(String(m.id)).not.toMatch(/obsidian|plugin$/);
		expect(m.description).toBe("Add timestamped entries to a daily dev log, through an inbox that only one device imports.");
		expect(String(m.description)).toMatch(/^[A-Za-z0-9 .,!?'"-]{1,250}$/);
		expect(m.isDesktopOnly).toBe(false);
		expect(m.author).toBe("takosasi-dev");
		expect(m.minAppVersion).toBe("1.14.4");
	});
});
