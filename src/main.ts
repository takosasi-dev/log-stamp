// Log Stamp の入口: 設定の読み込み・コマンド5つ(§9.3)・リボン(FR-18)・設定タブ。
// 「この端末で取り込む」は App の localStorage(この vault・この端末だけ)に持つ(FR-7・D-11)。
import { Notice, Plugin, TFile } from "obsidian";
import { formatDate } from "./core/dates";
import { submitEntry, type EntryInput } from "./core/format";
import { newLogText } from "./core/insert";
import { buildSkeleton } from "./core/skeleton";
import { Importer, notesOf, recordToInbox } from "./importer";
import { createFile, fileAt, folderAt, np, readFile } from "./io";
import { EntryModal, VerifyModal, type SubmitResult } from "./modal";
import { DEFAULTS, importHereKey, loadSettings, type Settings } from "./settings";
import { LogStampSettingTab } from "./settings-tab";
import { S } from "./strings";
import { collectVerify, type VerifyRow } from "./verify";

const LOG_NAME = /^\d{4}-\d{2}-\d{2}\.md$/;

export default class LogStampPlugin extends Plugin {
	settings: Settings = { ...DEFAULTS, skeletonTail: [...DEFAULTS.skeletonTail] };
	private importer!: Importer;

	async onload(): Promise<void> {
		let raw: unknown = null;
		let broken = false;
		try {
			raw = await this.loadData();
		} catch {
			broken = true;
		}
		const r = loadSettings(raw);
		this.settings = r.settings;
		if (broken || r.broken) new Notice(S.settingsBroken); // data.json は上書きしない

		this.importer = new Importer(this.app, () => this.settings, () => this.isImportOn());
		this.addSettingTab(new LogStampSettingTab(this.app, this));

		this.addCommand({ id: "add-entry", name: S.cmdAddEntry, callback: () => this.openEntryModal() });
		this.addCommand({ id: "open-today", name: S.cmdOpenToday, callback: () => void this.openToday() });
		this.addCommand({ id: "import-inbox", name: S.cmdImportInbox, callback: () => void this.importInbox() });
		this.addCommand({ id: "verify-inbox", name: S.cmdVerifyInbox, callback: () => this.openVerify() });
		this.addCommand({ id: "copy-summary-skeleton", name: S.cmdCopySkeleton, callback: () => void this.copySkeleton() });
		this.addRibbonIcon("clock", S.cmdAddEntry, () => this.openEntryModal());
	}

	async saveSettings(): Promise<void> {
		await this.saveData(this.settings);
	}

	isImportOn(): boolean {
		try {
			return this.app.loadLocalStorage(importHereKey(this.manifest.id)) === "1";
		} catch {
			return false; // 読めなければ OFF(§10)
		}
	}

	setImportOn(on: boolean): void {
		try {
			this.app.saveLocalStorage(importHereKey(this.manifest.id), on ? "1" : null);
		} catch {
			// 保存できなければ OFF のまま
		}
	}

	private openEntryModal(): void {
		new EntryModal(this.app, (input) => this.submit(input)).open();
	}

	/** FR-3 → FR-6 → (ON なら)FR-8 */
	private async submit(input: EntryInput): Promise<SubmitResult> {
		const now = new Date();
		const r = await submitEntry(input, this.settings.bulletize, (e) => recordToInbox(this.app, this.settings, e, now));
		if (!r.ok) return { close: false, error: r.message };
		if (!r.value.ok) {
			new Notice(r.value.message);
			return { close: false };
		}
		if (!this.isImportOn()) {
			new Notice(S.recorded);
			return { close: true };
		}
		const file = r.value.file;
		const o = await this.importer.run(() => this.importer.importFile(file));
		if (o === null) new Notice(S.recordedImportFailed(S.importBusy));
		else if (o.kind === "inserted" || o.kind === "existed") new Notice(S.inserted(o.logPath) + (o.warn ? `(${o.warn})` : ""));
		else if (o.kind === "rejected") new Notice(S.recordedImportFailed(S.rejected(o.logPath)));
		else if (o.kind === "invalid") new Notice(S.recordedImportFailed(S.invalidInbox));
		else new Notice(S.recordedImportFailed(o.reason));
		return { close: true };
	}

	/** FR-15 */
	private async openToday(): Promise<void> {
		const date = formatDate(new Date());
		const path = this.importer.logPath(date);
		let file = fileAt(this.app, path);
		if (!file) {
			if (!this.isImportOn()) {
				new Notice(S.noTodayLog);
				return;
			}
			if (!folderAt(this.app, this.settings.logFolder)) {
				new Notice(S.noLogFolder(this.settings.logFolder));
				return;
			}
			file = await createFile(this.app, path, newLogText(this.settings.titleFormat, date));
		}
		await this.app.workspace.getLeaf(false).openFile(file);
	}

	/** FR-9 */
	private async importInbox(): Promise<void> {
		if (!this.isImportOn()) {
			new Notice(S.importOff);
			return;
		}
		const r = await this.importer.run(() => this.importer.importAll());
		if (r === null) {
			new Notice(S.importBusy);
			return;
		}
		new Notice(S.importResult(r.inserted, r.existed, r.invalid));
		for (const n of r.notes) new Notice(n);
	}

	/** FR-16。取り込み OFF の端末では一覧だけ(入れ直しは出さない) */
	private openVerify(): void {
		const load = () => collectVerify(this.app, this.settings, (d) => this.importer.logPath(d));
		const reinsert = this.isImportOn()
			? async (rows: VerifyRow[]): Promise<void> => {
				const done = await this.importer.run(async () => {
					for (const row of rows) for (const n of notesOf(await this.importer.insertItem(row.item), row.path)) new Notice(n);
				});
				if (done === null) new Notice(S.importBusy);
			}
			: null;
		new VerifyModal(this.app, load, reinsert).open();
	}

	/** FR-17: 開いているログ、違えば今日のログの見出しから骨組みを作ってクリップボードへ(書き込みなし) */
	private async copySkeleton(): Promise<void> {
		const active = this.app.workspace.getActiveFile();
		const isLog = active instanceof TFile && LOG_NAME.test(active.name) && active.parent?.path === np(this.settings.logFolder);
		const path = isLog ? active.path : this.importer.logPath(formatDate(new Date()));
		const file = isLog ? active : fileAt(this.app, path);
		if (!file) {
			new Notice(S.skeletonNoLog(path));
			return;
		}
		const sk = buildSkeleton(await readFile(this.app, file), this.settings.summaryHeading, this.settings.skeletonTail);
		try {
			await navigator.clipboard.writeText(sk.text);
			new Notice(S.skeletonCopied(sk.count));
		} catch {
			new Notice(S.clipboardFailed);
		}
	}
}
