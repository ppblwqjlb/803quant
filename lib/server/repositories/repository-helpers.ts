import type { ResearchResponse, ResearchStatus } from "../../research/contracts.ts";
import { getSystemContext } from "../system-context.ts";

export type QueryRows = <T>(sql: string, params?: readonly unknown[]) => Promise<T[]>;

export type RepositoryOptions = {
  tradeDate?: string;
  now?: Date;
};

export type ResearchModule = "today" | "risk" | "strategy" | "ipo";

export type BatchRow = {
  id: number;
  batchId: string;
  module: ResearchModule;
  tradeDate: string | Date;
  batchStatus: "pending" | "running" | "success" | "partial" | "failed";
  dataAsOf: string | Date | null;
};

const BATCH_SQL = `SELECT
  id,
  batch_code AS batchId,
  module,
  trade_date AS tradeDate,
  status AS batchStatus,
  data_as_of AS dataAsOf
FROM research_batch
WHERE module = ? AND trade_date = ?
ORDER BY created_at DESC, id DESC
LIMIT 1`;

export async function defaultQueryRows<T>(sql: string, params: readonly unknown[] = []): Promise<T[]> {
  const database = await import("../query.ts");
  return database.queryRows<T>(sql, params as never[]);
}

export function isValidTradeDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/u.test(value)) return false;
  const [year, month, day] = value.split("-").map(Number);
  const parsed = new Date(Date.UTC(year, month - 1, day));
  return parsed.getUTCFullYear() === year && parsed.getUTCMonth() === month - 1 && parsed.getUTCDate() === day;
}

export function getRepositoryContext(options: RepositoryOptions = {}) {
  const system = getSystemContext(options.now);
  const tradeDate = options.tradeDate ?? system.serverDate;
  if (!isValidTradeDate(tradeDate)) throw new Error("Invalid trade date");
  return { system, tradeDate };
}

export function requestedDateBounds(tradeDate: string) {
  if (!isValidTradeDate(tradeDate)) throw new Error("Invalid trade date");
  const [year, month, day] = tradeDate.split("-").map(Number);
  const nextDay = new Date(Date.UTC(year, month - 1, day + 1)).toISOString().slice(0, 10);
  const monthStart = `${String(year).padStart(4, "0")}-${String(month).padStart(2, "0")}-01`;
  const nextMonth = new Date(Date.UTC(year, month, 1)).toISOString().slice(0, 10);
  return {
    dayStart: `${tradeDate} 00:00:00.000`,
    dayEnd: `${nextDay} 00:00:00.000`,
    monthStart,
    monthEnd: nextMonth,
  };
}

function decodeJson(value: unknown): unknown {
  if (typeof value !== "string") return value;
  try {
    return JSON.parse(value);
  } catch {
    return undefined;
  }
}

export function decodeJsonArray(value: unknown): unknown[] | null {
  const decoded = decodeJson(value);
  return Array.isArray(decoded) ? decoded : null;
}

export function decodeJsonObject(value: unknown): Record<string, unknown> | null {
  const decoded = decodeJson(value);
  return decoded !== null && typeof decoded === "object" && !Array.isArray(decoded)
    ? decoded as Record<string, unknown>
    : null;
}

export function isJsonObjectItem(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

export async function findCurrentBatch(
  query: QueryRows,
  module: ResearchModule,
  tradeDate: string,
): Promise<BatchRow | null> {
  const rows = await query<BatchRow>(BATCH_SQL, [module, tradeDate]);
  return rows[0] ?? null;
}

export function normalizedDateTime(value: string | Date | null | undefined): string | null {
  if (value === null || value === undefined) return null;
  if (value instanceof Date) return Number.isNaN(value.getTime()) ? null : value.toISOString();
  const trimmed = String(value).trim();
  return trimmed || null;
}

export function batchStatus(batch: BatchRow): ResearchStatus {
  if (batch.batchStatus === "pending" || batch.batchStatus === "running") return "pending";
  if (batch.batchStatus === "partial") return "partial";
  if (batch.batchStatus === "success") return "ready";
  return "failed";
}

export function response<T>(
  serverDate: string,
  status: ResearchStatus,
  data: T,
  missingFields: string[],
  batch: BatchRow | null = null,
): ResearchResponse<T> {
  return {
    serverDate,
    timezone: "Asia/Shanghai",
    status,
    batchId: batch?.batchId ?? null,
    dataAsOf: normalizedDateTime(batch?.dataAsOf),
    missingFields: [...new Set(missingFields)],
    data,
  };
}

export function isMissingTableError(error: unknown): boolean {
  if (!error || typeof error !== "object") return false;
  return "code" in error && (
    error.code === "ER_NO_SUCH_TABLE" || error.code === "APPROVED_BASE_TABLE_MISSING"
  );
}

export function errorResponse<T>(
  module: ResearchModule,
  serverDate: string,
  data: T,
  error: unknown,
): ResearchResponse<T> {
  const missingTable = isMissingTableError(error);
  return response(
    serverDate,
    missingTable ? "missing" : "failed",
    data,
    [`${module}.${missingTable ? "table" : "query"}`],
  );
}

export function initialState<T>(
  module: ResearchModule,
  serverDate: string,
  batch: BatchRow | null,
  data: T,
): ResearchResponse<T> | null {
  if (!batch) return response(serverDate, "missing", data, [`${module}.batch`]);
  const status = batchStatus(batch);
  if (status === "pending") return response(serverDate, status, data, [`${module}.data`], batch);
  if (status === "failed") return response(serverDate, status, data, [`${module}.batch`], batch);
  return null;
}

export function finalStatus(batch: BatchRow, missingFields: string[]): ResearchStatus {
  return batch.batchStatus === "partial" || missingFields.length > 0 ? "partial" : "ready";
}

/*
 * Data-derived batch.
 *
 * The research pages read the approved raw market tables directly instead of a pre-computed
 * `research_batch` row. The trade date is therefore resolved from `daily`, which carries every
 * trading session, and the batch identity is derived from that resolved date.
 */
export type DataBatch = {
  batchId: string;
  compactTradeDate: string;
  isoTradeDate: string;
};

export function isValidCompactDate(value: unknown): value is string {
  return typeof value === "string" && /^\d{8}$/u.test(value);
}

export function toCompactDate(isoDate: string): string {
  if (!isValidTradeDate(isoDate)) throw new Error("Invalid trade date");
  return isoDate.replaceAll("-", "");
}

export function toIsoDate(value: unknown): string {
  return isValidCompactDate(value)
    ? `${value.slice(0, 4)}-${value.slice(4, 6)}-${value.slice(6, 8)}`
    : "XX";
}

export function compactDateOrNull(value: unknown): string | null {
  return isValidCompactDate(value) ? value : null;
}

export function numberOrNull(value: unknown): number | null {
  if (value === null || value === undefined) return null;
  const parsed = typeof value === "number" ? value : Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

export function integerOrZero(value: unknown): number {
  const parsed = numberOrNull(value);
  return parsed === null ? 0 : Math.round(parsed);
}

export function textOrNull(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed ? trimmed : null;
}

const LATEST_TRADE_DATE_SQL = `SELECT MAX(trade_date) AS latestTradeDate
FROM daily
WHERE trade_date <= ?`;

const PREVIOUS_TRADE_DATE_SQL = `SELECT MAX(trade_date) AS previousTradeDate
FROM daily
WHERE trade_date < ?`;

export async function findLatestTradeDate(query: QueryRows, requestedDate: string): Promise<string | null> {
  const rows = await query<{ latestTradeDate: string | null }>(LATEST_TRADE_DATE_SQL, [toCompactDate(requestedDate)]);
  return compactDateOrNull(rows[0]?.latestTradeDate);
}

export async function findPreviousTradeDate(query: QueryRows, compactTradeDate: string): Promise<string | null> {
  const rows = await query<{ previousTradeDate: string | null }>(PREVIOUS_TRADE_DATE_SQL, [compactTradeDate]);
  return compactDateOrNull(rows[0]?.previousTradeDate);
}

export function marketBatch(compactTradeDate: string): DataBatch {
  return {
    batchId: `market-${compactTradeDate}`,
    compactTradeDate,
    isoTradeDate: toIsoDate(compactTradeDate),
  };
}

export function dataResponse<T>(
  serverDate: string,
  status: ResearchStatus,
  data: T,
  missingFields: string[],
  batch: DataBatch | null = null,
): ResearchResponse<T> {
  return {
    serverDate,
    timezone: "Asia/Shanghai",
    status,
    batchId: batch?.batchId ?? null,
    dataAsOf: batch?.isoTradeDate ?? null,
    missingFields: [...new Set(missingFields)],
    data,
  };
}

export function dataStatus(missingFields: string[]): ResearchStatus {
  return missingFields.length > 0 ? "partial" : "ready";
}

export function placeholdersFor(items: readonly unknown[]): string {
  return items.map(() => "?").join(", ");
}
