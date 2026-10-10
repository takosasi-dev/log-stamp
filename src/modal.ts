// 画面: 入力モーダル(FR-1。日付・時刻は開いた瞬間の端末の現地時刻で埋め、書き換えられる)と照合の一覧(FR-16)。
// 確定の処理は呼び出し側に任せ、検証の文言はモーダルに出す。記録に失敗したら閉じずに入力を残す。
import { Modal, Setting, TextAreaComponent, type App } from "obsidian";
import { formatDate, formatTime } from "./core/dates";
import type { EntryInput } from "./core/format";
import { S } from "./strings";
import type { VerifyResult, VerifyRow } from "./verify";

export type SubmitResult = { close: boolean; error?: string };

export class EntryModal extends Modal {
	private readonly input: EntryInput;
	private errEl: HTMLElement | null = null;
	private sending = false;
	private headingEl: HTMLInputElement | null = null;

	constructor(app: App, private readonly onSubmit: (input: EntryInput) => Promise<SubmitResult>) {
		super(app);
		const now = new Date(); // 開いた瞬間の値(§10: 23:59 に開いて 0:01 に確定しても欄の値で記録する)
		this.input = { date: formatDate(now), time: formatTime(now), heading: "", body: "" };
	}

	onOpen(): void {
		this.setTitle(S.modalTitle);
		const el = this.contentEl;
		new Setting(el).setName(S.fieldDate).addText((t) => t.setValue(this.input.date).onChange((v) => { this.input.date = v; }));
		new Setting(el).setName(S.fieldTime).addText((t) => t.setValue(this.input.time).onChange((v) => { this.input.time = v; }));
		new Setting(el).setName(S.fieldHeading).addText((t) => {
			this.headingEl = t.inputEl;
			t.inputEl.addClass("log-stamp-heading");
			t.onChange((v) => { this.input.heading = v; });
		});
		el.createDiv({ text: S.fieldBody, cls: "log-stamp-label" });
		const body = new TextAreaComponent(el);
		body.inputEl.addClass("log-stamp-body");
		body.inputEl.rows = 8;
		body.onChange((v) => { this.input.body = v; });
		this.errEl = el.createDiv({ cls: "log-stamp-error" });
		new Setting(el).addButton((b) => b.setButtonText(S.submit).setCta().onClick(() => void this.submit()));
		this.headingEl?.focus();
	}

	private async submit(): Promise<void> {
		if (this.sending) return;
		this.sending = true;
		try {
			const r = await this.onSubmit({ ...this.input });
			this.errEl?.setText(r.error ?? "");
			if (r.close) this.close();
		} finally {
			this.sending = false;
		}
	}

	onClose(): void {
		this.contentEl.empty();
	}
}

/** FR-16 の一覧。reinsert が null(取り込み OFF の端末)なら「入れ直す」を出さない */
export class VerifyModal extends Modal {
	constructor(
		app: App,
		private readonly loadResult: () => Promise<VerifyResult>,
		private readonly reinsert: ((rows: VerifyRow[]) => Promise<void>) | null,
	) {
		super(app);
	}

	onOpen(): void {
		this.setTitle(S.verifyTitle);
		void this.render();
	}

	private async render(): Promise<void> {
		const r = await this.loadResult();
		const el = this.contentEl;
		el.empty();
		this.section(S.verifyMissing, r.missing.map((x) => x.path));
		const reinsert = this.reinsert;
		if (reinsert && r.missing.length) {
			new Setting(el).addButton((b) =>
				b.setButtonText(S.verifyReinsert).setCta().onClick(async () => {
					b.setDisabled(true);
					await reinsert(r.missing);
					await this.render();
				}));
		}
		this.section(S.verifyMultiple, r.multiple.map((x) => `${x.path}(${S.verifyCount(x.count)})`));
		this.section(S.verifyInvalid, r.invalid);
	}

	private section(title: string, items: string[]): void {
		this.contentEl.createEl("h4", { text: `${title}(${items.length})` });
		if (!items.length) {
			this.contentEl.createEl("p", { text: S.verifyNone, cls: "log-stamp-none" });
			return;
		}
		const ul = this.contentEl.createEl("ul");
		for (const t of items) ul.createEl("li", { text: t });
	}

	onClose(): void {
		this.contentEl.empty();
	}
}
