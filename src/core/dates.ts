// 日付と時刻の形(端末の現地時刻のまま。タイムゾーンの変換はしない。FR-2・D-14)。
// 実在する日付か・00:00〜23:59 かの判定もここ。obsidian を import しない。

const pad2 = (n: number): string => String(n).padStart(2, "0");

/** YYYY-MM-DD(現地時刻の暦日。0:00 からは翌日) */
export function formatDate(d: Date): string {
	return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
}

/** HH:MM(24時間・0埋め) */
export function formatTime(d: Date): string {
	return `${pad2(d.getHours())}:${pad2(d.getMinutes())}`;
}

/** HHmmss(受け箱ファイルの名前) */
export function formatHms(d: Date): string {
	return `${pad2(d.getHours())}${pad2(d.getMinutes())}${pad2(d.getSeconds())}`;
}

/** 2026-09-26T09:31:12+09:00(現地時刻と UTC からの差) */
export function isoWithOffset(d: Date): string {
	const off = -d.getTimezoneOffset();
	const sign = off >= 0 ? "+" : "-";
	const a = Math.abs(off);
	return `${formatDate(d)}T${pad2(d.getHours())}:${pad2(d.getMinutes())}:${pad2(d.getSeconds())}${sign}${pad2(Math.floor(a / 60))}:${pad2(a % 60)}`;
}

export function isValidDate(s: string): boolean {
	const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s);
	if (!m) return false;
	const y = Number(m[1]), mo = Number(m[2]), d = Number(m[3]);
	const t = new Date(y, mo - 1, d);
	return t.getFullYear() === y && t.getMonth() === mo - 1 && t.getDate() === d;
}

export function isValidTime(s: string): boolean {
	return /^([01]\d|2[0-3]):[0-5]\d$/.test(s);
}
