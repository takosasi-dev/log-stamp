// 取り込み済みの受け箱ファイルとログの照合(FR-16)。読むだけ。画面は modal.ts の VerifyModal、入れ直しは Importer。
// ログに無い物・2回以上ある物と、形式外の受け箱ファイル(§10)を集める。
import type { App } from "obsidian";
import { parseInbox, type InboxItem } from "./core/inbox";
import { countEntry } from "./core/insert";
import { fileAt, folderAt, mdFilesIn, readFile } from "./io";
import type { Settings } from "./settings";

export interface VerifyRow {
	path: string;
	item: InboxItem;
	count: number;
}

export interface VerifyResult {
	missing: VerifyRow[];
	multiple: VerifyRow[];
	invalid: string[];
}

export async function collectVerify(app: App, st: Settings, logPath: (date: string) => string): Promise<VerifyResult> {
	const r: VerifyResult = { missing: [], multiple: [], invalid: [] };
	const folder = folderAt(app, st.inboxFolder);
	if (!folder) return r;
	for (const f of mdFilesIn(folder).sort((a, b) => (a.path < b.path ? -1 : 1))) {
		const item = parseInbox(await readFile(app, f));
		if (!item) {
			r.invalid.push(f.path);
			continue;
		}
		if (!item.imported) continue;
		const log = fileAt(app, logPath(item.date));
		const count = log ? countEntry(await readFile(app, log), item) : 0;
		if (count === 0) r.missing.push({ path: f.path, item, count });
		else if (count >= 2) r.multiple.push({ path: f.path, item, count });
	}
	return r;
}
