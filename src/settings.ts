// data.json の型と既定値(§9.2・D-6)。読み込み時の補いと、受け箱が開発ログフォルダの中かの判定(INV-3)。
// 2つのフォルダの既定は空(未設定)。入れた人が最初に設定する。未設定かの判定(isUnset)もここ。
// 「この端末で取り込む」は data.json に入れない(端末ごとの localStorage。INV-9)。obsidian を import しない。

export interface Settings {
	schemaVersion: 1;
	logFolder: string;
	titleFormat: string;
	summaryHeading: string;
	inboxFolder: string;
	bulletize: boolean;
	skeletonTail: string[];
}

export const DEFAULTS: Settings = {
	schemaVersion: 1,
	logFolder: "", // 未設定。vault ごとに違うので既定を持たない
	titleFormat: "# {date} 開発ログ",
	summaryHeading: "## この日の総括",
	inboxFolder: "", // 同上
	bulletize: true,
	skeletonTail: ["- **学び**: "],
};

const copyDefaults = (): Settings => ({ ...DEFAULTS, skeletonTail: [...DEFAULTS.skeletonTail] });

/**
 * 欠けた項目は既定値で埋める。schemaVersion が違う・形が壊れているときは既定値で動かし broken を返す
 * (呼び出し側は Notice を出し、data.json を書き換えない)。初回(null)は broken にしない。
 */
export function loadSettings(raw: unknown): { settings: Settings; broken: boolean } {
	const s = copyDefaults();
	if (raw === null || raw === undefined) return { settings: s, broken: false };
	if (typeof raw !== "object" || Array.isArray(raw)) return { settings: s, broken: true };
	const r = raw as Record<string, unknown>;
	if (r.schemaVersion !== undefined && r.schemaVersion !== 1) return { settings: s, broken: true };
	for (const k of ["logFolder", "titleFormat", "summaryHeading", "inboxFolder"] as const) {
		const v = r[k];
		if (typeof v === "string") s[k] = v;
	}
	if (typeof r.bulletize === "boolean") s.bulletize = r.bulletize;
	if (Array.isArray(r.skeletonTail) && r.skeletonTail.every((x) => typeof x === "string")) s.skeletonTail = [...r.skeletonTail];
	if (isSameOrInside(s.inboxFolder, s.logFolder)) return { settings: copyDefaults(), broken: true };
	return { settings: s, broken: false };
}

const trimSlashes = (p: string): string => p.replace(/^\/+|\/+$/g, "").toLowerCase();

/** フォルダが未設定か。空・空白だけ・"/"(normalizePath("") の戻り)は vault の直下ではなく未設定として扱う */
export function isUnset(folder: string): boolean {
	return trimSlashes(folder.trim()) === "";
}

/** child が parent と同じか、その配下か(パスは normalizePath 済みで渡す)。どちらかが未設定なら false(INV-3 は両方が設定されているときの決まり) */
export function isSameOrInside(child: string, parent: string): boolean {
	if (isUnset(child) || isUnset(parent)) return false;
	const c = trimSlashes(child), p = trimSlashes(parent);
	return c === p || c.startsWith(p + "/");
}

/** <manifest の id>:import-here(§9.2) */
export const importHereKey = (id: string): string => `${id}:import-here`;
