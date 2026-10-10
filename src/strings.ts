// 画面の文言(§9.3 の文をそのまま)。ここと settings.ts のほかに、ログのフォルダ名と総括の見出しの文字を書かない(D-6・AC-24)。
// obsidian を import しない(core から使う)。

export const S = {
	// コマンド(§9.3)
	cmdAddEntry: "開発ログに項目を追加",
	cmdOpenToday: "今日の開発ログを開く",
	cmdImportInbox: "受け箱を取り込む",
	cmdVerifyInbox: "取り込んだ項目を照合",
	cmdCopySkeleton: "総括の骨組みをコピー",

	// 検証(FR-3。この順で調べる)
	errHeadingEmpty: "見出しを入れてください",
	errHeadingNewline: "見出しは1行にしてください",
	errDate: "日付は YYYY-MM-DD の実在する日にしてください",
	errTime: "時刻は 00:00〜23:59 の HH:MM にしてください",
	errBodyLine: (n: number): string => `本文の ${n} 行目は見出しか区切り線になるので入れられません`,
	errBodyFence: "本文のコードブロックが閉じていません",

	// 記録(FR-6・FR-8)
	recorded: "受け箱に記録しました",
	inserted: (logPath: string): string => `${logPath} に入れました`,
	recordedImportFailed: (reason: string): string => `受け箱に記録しました。取り込みに失敗: ${reason}`,
	recordFailed: (reason: string): string => `受け箱に記録できませんでした: ${reason}`,
	nameTaken: "同じ名前のファイルがあり、名前を作り直しても空きませんでした",
	makeInboxFolder: (name: string): string => `受け箱フォルダ ${name} を作ってください`,

	// 取り込み(FR-9)
	importOff: "この端末では取り込みが OFF です",
	importResult: (ins: number, existed: number, invalid: number): string =>
		`取り込み: 入れた ${ins}・既にあった ${existed}・形式外 ${invalid}`,
	importBusy: "取り込み中です",
	importFailed: (path: string, reason: string): string => `取り込みに失敗: ${path}: ${reason}`,
	invalidInbox: "受け箱ファイルの形が違います(形式外)",
	noLogFolder: (name: string): string => `フォルダ ${name} がありません`,

	// FR-12
	rejected: (path: string): string => `既存の行が変わるため書き込みを止めました: ${path}`,

	// §10 の H1
	warnNoH1: "H1 がありません",
	warnH1Date: "H1 の日付が違います",

	// FR-15
	noTodayLog: "今日の開発ログはまだありません(この端末では作りません)",

	// FR-16
	verifyTitle: "取り込んだ項目の照合",
	verifyMissing: "ログに無い物",
	verifyMultiple: "2回以上ある物",
	verifyInvalid: "形式外の受け箱ファイル",
	verifyNone: "なし",
	verifyReinsert: "入れ直す",
	verifyCount: (n: number): string => `${n} 回`,

	// FR-17
	skeletonCopied: (n: number): string => `総括の骨組みをコピーしました(見出し ${n} 件)`,
	skeletonNoLog: (path: string): string => `${path} がありません`,
	clipboardFailed: "クリップボードに書けませんでした",

	// 入力モーダル(FR-1)
	modalTitle: "開発ログに項目を追加",
	fieldDate: "日付",
	fieldTime: "時刻",
	fieldHeading: "見出し",
	fieldBody: "本文",
	submit: "記録",

	// 設定(§9.2)
	setImportHere: "この端末で取り込む",
	setImportHereDesc: "ON の端末だけが開発ログに書き込みます。値はこの端末だけに残り、data.json には入りません。ON にするのは1台だけにしてください。",
	setLogFolder: "開発ログのフォルダ",
	setTitleFormat: "新しいログの1行目",
	setTitleFormatDesc: "{date} は YYYY-MM-DD になります。",
	setSummaryHeading: "総括の見出し",
	setSummaryHeadingDesc: "この行の直前に項目を入れます。無い日は末尾に入れます。",
	setInboxFolder: "受け箱のフォルダ",
	setBulletize: "本文の行を箇条書きにする",
	setBulletizeDesc: "- や * や 数字. で始まらない行の先頭に - を付けます。",
	setSkeletonTail: "総括の骨組みの最後の行",
	setSkeletonTailDesc: "1行に1つ。",
	errInboxInsideLog: "受け箱は開発ログフォルダの外にしてください",
	settingsBroken: "LogStamp: data.json が読めないため既定の設定で動きます(data.json は書き換えていません)",
} as const;
