// Vault の書き込み系(create・createFolder・process)を呼ぶ唯一のファイル(AC-5)。読むのもここを通す。
// 既存のファイルへの書き込みは process だけで、渡す関数は core の純関数(行を足すだけ。INV-1・INV-5)。
import { normalizePath, TFile, TFolder, type App } from "obsidian";

export const np = (p: string): string => normalizePath(p);

export function fileAt(app: App, path: string): TFile | null {
	return app.vault.getFileByPath(np(path));
}

export function folderAt(app: App, path: string): TFolder | null {
	return app.vault.getFolderByPath(np(path));
}

export function exists(app: App, path: string): boolean {
	return app.vault.getAbstractFileByPath(np(path)) !== null;
}

export function readFile(app: App, file: TFile): Promise<string> {
	return app.vault.read(file);
}

/** フォルダが無ければ作る。作れなければ false */
export async function ensureFolder(app: App, path: string): Promise<boolean> {
	if (folderAt(app, path)) return true;
	try {
		await app.vault.createFolder(np(path));
	} catch {
		// 同時に作られた場合も含め、下で有無を見る
	}
	return folderAt(app, path) !== null;
}

/** 新しいファイルを作る(既にあれば例外) */
export function createFile(app: App, path: string, data: string): Promise<TFile> {
	return app.vault.create(np(path), data);
}

/** 既存のファイルを fn(本文 → 新しい本文)で書き換える */
export function processFile(app: App, file: TFile, fn: (data: string) => string): Promise<string> {
	return app.vault.process(file, fn);
}

/** フォルダ直下の .md ファイル */
export function mdFilesIn(folder: TFolder): TFile[] {
	return folder.children.filter((f): f is TFile => f instanceof TFile && f.extension === "md");
}
