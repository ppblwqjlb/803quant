export function formatNumber(value: number | null | undefined, digits = 2): string {
  if (value === null || value === undefined || !Number.isFinite(value)) return "XX";
  return value.toLocaleString("zh-CN", { minimumFractionDigits: digits, maximumFractionDigits: digits });
}

export function formatSigned(value: number | null | undefined, digits = 2): string {
  if (value === null || value === undefined || !Number.isFinite(value)) return "XX";
  return `${value > 0 ? "+" : ""}${formatNumber(value, digits)}`;
}

export function formatPct(value: number | null | undefined, digits = 2): string {
  if (value === null || value === undefined || !Number.isFinite(value)) return "XX";
  return `${formatSigned(value, digits)}%`;
}

/** `daily.amount` and `index_daily.amount` are stored in thousands of yuan. */
export function thousandsToYi(value: number | null | undefined): number | null {
  if (value === null || value === undefined || !Number.isFinite(value)) return null;
  return value / 100_000;
}

/** `daily_basic.total_mv` is stored in ten-thousand yuan. */
export function wanToWanYi(value: number | null | undefined): number | null {
  if (value === null || value === undefined || !Number.isFinite(value)) return null;
  return value / 100_000_000;
}

export function formatCount(value: number | null | undefined): string {
  if (value === null || value === undefined || !Number.isFinite(value)) return "XX";
  return Math.round(value).toLocaleString("zh-CN");
}

export function trendTone(value: number | null | undefined): "up" | "down" | "flat" {
  if (value === null || value === undefined || !Number.isFinite(value) || value === 0) return "flat";
  return value > 0 ? "up" : "down";
}

/** `YYYYMMDD` from the database, rendered as `YYYY-MM-DD`. */
export function compactToIso(value: unknown): string {
  if (typeof value !== "string" || !/^\d{8}$/u.test(value)) return "XX";
  return `${value.slice(0, 4)}-${value.slice(4, 6)}-${value.slice(6, 8)}`;
}

export function showDate(value: unknown): string {
  if (typeof value !== "string" || !value.trim()) return "XX";
  return value.trim();
}

export function formatRuntime(milliseconds: number | null | undefined): string {
  if (milliseconds === null || milliseconds === undefined || !Number.isFinite(milliseconds) || milliseconds < 0) return "XX";
  const totalSeconds = Math.round(milliseconds / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return minutes > 0 ? `${minutes} 分 ${seconds} 秒` : `${seconds} 秒`;
}

export function barWidth(value: number | null | undefined, total: number | null | undefined): string {
  if (value === null || value === undefined || total === null || total === undefined) return "0%";
  if (!Number.isFinite(value) || !Number.isFinite(total) || total <= 0) return "0%";
  return `${Math.max(0, Math.min(100, (value / total) * 100))}%`;
}
