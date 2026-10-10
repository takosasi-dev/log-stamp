// 設定画面(getSettingDefinitions。minAppVersion 1.14.4 なので宣言型。D-8)。
// 「この端末で取り込む」だけは data.json でなく端末の localStorage に読み書きする(FR-7・INV-9)。
import { PluginSettingTab, type App, type SettingDefinitionItem } from "obsidian";
import { np } from "./io";
import type LogStampPlugin from "./main";
import { isSameOrInside } from "./settings";
import { S } from "./strings";

export class LogStampSettingTab extends PluginSettingTab {
	constructor(app: App, private readonly owner: LogStampPlugin) {
		super(app, owner);
	}

	getSettingDefinitions(): SettingDefinitionItem[] {
		const st = (): LogStampPlugin["settings"] => this.owner.settings;
		return [
			{ type: "group", items: [
				{ name: S.setImportHere, desc: S.setImportHereDesc, control: { type: "toggle", key: "importHere" } },
				{ name: S.setLogFolder, control: { type: "text", key: "logFolder",
					validate: (v: string) => (isSameOrInside(np(st().inboxFolder), np(v)) ? S.errInboxInsideLog : undefined) } },
				{ name: S.setInboxFolder, control: { type: "text", key: "inboxFolder",
					validate: (v: string) => (isSameOrInside(np(v), np(st().logFolder)) ? S.errInboxInsideLog : undefined) } },
				{ name: S.setTitleFormat, desc: S.setTitleFormatDesc, control: { type: "text", key: "titleFormat" } },
				{ name: S.setSummaryHeading, desc: S.setSummaryHeadingDesc, control: { type: "text", key: "summaryHeading" } },
				{ name: S.setBulletize, desc: S.setBulletizeDesc, control: { type: "toggle", key: "bulletize" } },
				{ name: S.setSkeletonTail, desc: S.setSkeletonTailDesc, control: { type: "textarea", key: "skeletonTail", rows: 3 } },
			] },
		];
	}

	getControlValue(key: string): unknown {
		const s = this.owner.settings;
		switch (key) {
			case "importHere": return this.owner.isImportOn();
			case "skeletonTail": return s.skeletonTail.join("\n");
			case "logFolder": return s.logFolder;
			case "inboxFolder": return s.inboxFolder;
			case "titleFormat": return s.titleFormat;
			case "summaryHeading": return s.summaryHeading;
			case "bulletize": return s.bulletize;
			default: return undefined;
		}
	}

	async setControlValue(key: string, value: unknown): Promise<void> {
		const s = this.owner.settings;
		const str = typeof value === "string" ? value : "";
		switch (key) {
			case "importHere":
				this.owner.setImportOn(value === true); // data.json には書かない
				return;
			case "skeletonTail": s.skeletonTail = str.split(/\r?\n/).filter((x) => x.trim() !== ""); break; // 行末の空白は残す
			case "logFolder": s.logFolder = np(str); break;
			case "inboxFolder": s.inboxFolder = np(str); break;
			case "titleFormat": s.titleFormat = str; break;
			case "summaryHeading": s.summaryHeading = str; break;
			case "bulletize": s.bulletize = value === true; break;
			default: return;
		}
		await this.owner.saveSettings();
	}
}
