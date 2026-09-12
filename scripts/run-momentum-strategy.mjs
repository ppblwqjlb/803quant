import { pathToFileURL } from "node:url";

import { evaluateMomentumUniverse, validateMomentumRules } from "../lib/strategy/momentum-gap-volume.mjs";

const STRATEGY_CODE = "momentum-gap-volume";
const MISSING_TABLE = "APPROVED_BASE_TABLE_MISSING";

const LATEST_COMMON_DATE_SQL = `SELECT daily.trade_date AS tradeDate
FROM daily AS daily
WHERE daily.trade_date IN (SELECT trade_date FROM daily_basic)
  AND daily.trade_date IN (SELECT trade_date FROM adj_factor)
ORDER BY daily.trade_date DESC
LIMIT 1`;

const DEFINITION_SQL = `SELECT strategy_code AS strategyCode, rules_json AS rulesJson
FROM strategy_definition
WHERE strategy_code = ?
LIMIT 1`;

const AUCTION_SQL = `SELECT ts_code AS tsCode, trade_date AS tradeDate
FROM call_auction
WHERE trade_date = ?
LIMIT 1`;

const RAW_HISTORY_SQL = `SELECT
  daily.ts_code AS tsCode,
  daily.trade_date AS tradeDate,
  daily.open AS open,
  daily.high AS high,
  daily.low AS low,
  daily.close AS close,
  daily.pre_close AS preClose,
  daily.pct_chg AS changePct,
  daily.vol AS volume,
  basic.volume_ratio AS volumeRatio,
  factor.adj_factor AS adjFactor,
  stock.name AS name,
  stock.market AS market,
  stock.industry AS industry,
  stock.list_date AS listDate
FROM daily AS daily
JOIN daily_basic AS basic
  ON basic.ts_code = daily.ts_code AND basic.trade_date = daily.trade_date
JOIN adj_factor AS factor
  ON factor.ts_code = daily.ts_code AND factor.trade_date = daily.trade_date
JOIN stock_basic AS stock
  ON stock.ts_code = daily.ts_code
WHERE daily.trade_date >= ? AND daily.trade_date <= ?
ORDER BY daily.ts_code ASC, daily.trade_date ASC`;

export const MOMENTUM_READ_SQL = Object.freeze({
  latestCommonDate: LATEST_COMMON_DATE_SQL,
  definition: DEFINITION_SQL,
  auction: AUCTION_SQL,
  rawHistory: RAW_HISTORY_SQL,
});

function isMissingBaseTable(error) {
  return Boolean(error && typeof error === "object" && "code" in error && error.code === MISSING_TABLE);
}

function emptyEvaluation() {
  return { funnel: [], official: [], near: [] };
}

function result(plan, {
  status,
  latestCommonTradeDate = null,
  missingFields = [],
  auction = { status: "not-requested", rowCount: 0 },
  ...evaluation
}) {
  return {
    ...plan,
    status,
    strategyCode: STRATEGY_CODE,
    latestCommonTradeDate,
    missingFields,
    auction,
    ...emptyEvaluation(),
    ...evaluation,
  };
}

function parseRules(value) {
  if (value && typeof value === "object" && !Array.isArray(value)) return value;
  if (typeof value !== "string" || value.trim() === "") throw new TypeError("strategy definition rules must be JSON");
  const parsed = JSON.parse(value);
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new TypeError("strategy definition rules must be an object");
  }
  return parsed;
}

function calendarDateParts(value) {
  if (value instanceof Date) {
    if (Number.isNaN(value.valueOf())) return null;
    const parts = new Intl.DateTimeFormat("en-CA", {
      timeZone: "Asia/Shanghai", year: "numeric", month: "2-digit", day: "2-digit",
    }).formatToParts(value);
    const values = Object.fromEntries(parts
      .filter(({ type }) => ["year", "month", "day"].includes(type))
      .map(({ type, value: partValue }) => [type, partValue]));
    return [values.year, values.month, values.day];
  }
  if (typeof value !== "string") return null;
  const match = /^(?:(\d{4})(\d{2})(\d{2})|(\d{4})-(\d{2})-(\d{2}))$/.exec(value);
  return match ? [match[1] ?? match[4], match[2] ?? match[5], match[3] ?? match[6]] : null;
}

function canonicalDate(value) {
  const parts = calendarDateParts(value);
  if (!parts) return null;
  const [yearText, monthText, dayText] = parts;
  const year = Number(yearText);
  const month = Number(monthText);
  const day = Number(dayText);
  const date = new Date(Date.UTC(year, month - 1, day));
  if (
    date.getUTCFullYear() !== year
    || date.getUTCMonth() + 1 !== month
    || date.getUTCDate() !== day
  ) return null;
  return `${yearText}-${monthText}-${dayText}`;
}

function dateToUtc(value) {
  const canonical = canonicalDate(value);
  if (!canonical) return null;
  return new Date(`${canonical}T00:00:00.000Z`);
}

function formatDatabaseDate(reference, date) {
  const normalized = date.toISOString().slice(0, 10);
  return typeof reference === "string" && /^\d{8}$/.test(reference) ? normalized.replace(/-/g, "") : normalized;
}

function historyStartDate(tradeDate) {
  const selected = dateToUtc(tradeDate);
  if (!selected) throw new TypeError("latest common trade date is invalid");
  selected.setUTCDate(selected.getUTCDate() - 180);
  return formatDatabaseDate(tradeDate, selected);
}

function rawNumber(row, key) {
  const raw = row[key];
  let value;
  if (typeof raw === "number") value = raw;
  else if (typeof raw === "string" && /^[+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:e[+-]?\d+)?$/i.test(raw.trim())) value = Number(raw);
  else throw new TypeError(`raw ${key} must be a finite number`);
  if (!Number.isFinite(value)) throw new TypeError(`raw ${key} must be finite`);
  return value;
}

function rawText(row, key, { required = false } = {}) {
  const value = row[key];
  if (typeof value === "string" && value.trim() !== "") return value.trim();
  if (required) throw new TypeError(`raw ${key} is required`);
  return "XX";
}

function rawDate(row, key) {
  const value = canonicalDate(row[key]);
  if (!value) throw new TypeError(`raw ${key} must be a valid date`);
  return value;
}

function adjustedHistoryPercentile(history, latest) {
  const closes = history.map((item) => item.close * item.adjFactor);
  const low = Math.min(...closes);
  const high = Math.max(...closes);
  return high === low ? 0 : ((latest.close * latest.adjFactor - low) / (high - low)) * 100;
}

function consolidationMetrics(history) {
  const beforeLatest = history.slice(0, -1);
  const latestLimitTest = beforeLatest.reduce((last, item, index) => item.changePct >= 9.5 ? index : last, -1);
  const consolidation = beforeLatest.slice(latestLimitTest + 1);
  if (consolidation.length === 0) return { consolidationDays: 0, consolidationRangePct: 0, hadLimitUpTest: latestLimitTest >= 0 };
  const highs = consolidation.map((item) => item.high);
  const lows = consolidation.map((item) => item.low);
  const low = Math.min(...lows);
  if (low <= 0) throw new TypeError("raw consolidation low must be positive");
  return {
    consolidationDays: consolidation.length,
    consolidationRangePct: ((Math.max(...highs) - low) / low) * 100,
    hadLimitUpTest: latestLimitTest >= 0,
  };
}

function deriveMomentumRows(rawRows, selectedTradeDate) {
  if (!Array.isArray(rawRows)) throw new TypeError("raw universe must be an array");
  const selected = canonicalDate(selectedTradeDate);
  if (!selected) throw new TypeError("selected trade date is invalid");
  const groups = new Map();

  for (const source of rawRows) {
    const tsCode = rawText(source, "tsCode", { required: true });
    const tradeDate = rawDate(source, "tradeDate");
    const row = {
      tsCode, tradeDate,
      open: rawNumber(source, "open"), high: rawNumber(source, "high"), low: rawNumber(source, "low"),
      close: rawNumber(source, "close"), preClose: rawNumber(source, "preClose"), changePct: rawNumber(source, "changePct"),
      volume: rawNumber(source, "volume"), volumeRatio: rawNumber(source, "volumeRatio"), adjFactor: rawNumber(source, "adjFactor"),
      name: rawText(source, "name", { required: true }), market: rawText(source, "market"), industry: rawText(source, "industry"),
      listDate: rawDate(source, "listDate"),
    };
    if (
      row.low <= 0 || row.high < row.low
      || row.open < row.low || row.open > row.high
      || row.close < row.low || row.close > row.high
      || row.preClose <= 0 || row.volume < 0 || row.adjFactor <= 0
    ) {
      throw new TypeError(`raw price relationship is invalid for ${tsCode}`);
    }
    const history = groups.get(tsCode) ?? [];
    history.push(row);
    groups.set(tsCode, history);
  }

  const derived = [];
  for (const [tsCode, history] of groups) {
    history.sort((left, right) => left.tradeDate.localeCompare(right.tradeDate));
    const latest = history.at(-1);
    if (!latest || latest.tradeDate !== selected) continue;
    const listedOn = dateToUtc(latest.listDate);
    const tradeOn = dateToUtc(latest.tradeDate);
    if (!listedOn || !tradeOn || listedOn > tradeOn) throw new TypeError(`raw listDate is invalid for ${tsCode}`);
    const { consolidationDays, consolidationRangePct, hadLimitUpTest } = consolidationMetrics(history);
    derived.push({
      tsCode, name: latest.name, tradeDate: latest.tradeDate, market: latest.market, board: latest.market, industry: latest.industry,
      isTradable: latest.volume > 0 && latest.close > 0,
      isSt: /\*?st/i.test(latest.name),
      listedDays: Math.floor((tradeOn.valueOf() - listedOn.valueOf()) / 86_400_000),
      adjustedHistoryPercentile: adjustedHistoryPercentile(history, latest),
      hadLimitUpTest, consolidationDays, consolidationRangePct,
      gapPct: ((latest.open - latest.preClose) / latest.preClose) * 100,
      volumeRatio: latest.volumeRatio, close: latest.close, high: latest.high, changePct: latest.changePct,
      setupLabel: "raw-derived",
    });
  }
  return derived;
}

async function loadQueryRows(options) {
  if (typeof options.queryRows === "function") return options.queryRows;
  const { queryRows } = await import("../lib/server/query.ts");
  return queryRows;
}

export function resolveRequestedMode(argv = [], env = {}) {
  const requestedWrite = argv.includes("--write");
  const environmentAllowsWrite = env.ALLOW_DB_WRITES === "true";
  if (requestedWrite !== environmentAllowsWrite) {
    throw new Error("Refusing write mode: both --write and ALLOW_DB_WRITES=true are required");
  }
  return requestedWrite ? "write" : "dry-run";
}

export function buildRunPlan({ argv = [], env = {}, schemaAuthorized = false } = {}) {
  const mode = resolveRequestedMode(argv, env);
  if (mode === "write" && !schemaAuthorized) throw new Error("Schema is not authorized; refusing write mode");
  return { mode, mutationStatements: [] };
}

export async function runMomentumStrategy(options = {}) {
  const plan = buildRunPlan(options);
  if (plan.mode === "write") throw new Error("Write execution is unavailable until the schema is explicitly authorized");

  let queryRows;
  try {
    queryRows = await loadQueryRows(options);
  } catch {
    return result(plan, { status: "failed", missingFields: ["strategy.read"] });
  }

  let definition;
  try {
    [definition] = await queryRows(DEFINITION_SQL, [STRATEGY_CODE]);
  } catch (error) {
    return result(plan, { status: isMissingBaseTable(error) ? "missing" : "failed", missingFields: [isMissingBaseTable(error) ? "strategy.definition" : "strategy.read"] });
  }
  if (!definition) return result(plan, { status: "missing", missingFields: ["strategy.definition"] });

  let rules;
  try {
    rules = parseRules(definition.rulesJson);
    validateMomentumRules(rules);
  } catch {
    return result(plan, { status: "failed", missingFields: ["strategy.definition.rules"] });
  }

  let latestCommonTradeDate;
  try {
    [latestCommonTradeDate] = await queryRows(LATEST_COMMON_DATE_SQL);
  } catch (error) {
    return result(plan, { status: isMissingBaseTable(error) ? "missing" : "failed", missingFields: [isMissingBaseTable(error) ? "strategy.raw-inputs" : "strategy.read"] });
  }
  const selectedDatabaseTradeDate = latestCommonTradeDate?.tradeDate;
  const selectedTradeDate = canonicalDate(selectedDatabaseTradeDate);
  if (!selectedTradeDate || selectedDatabaseTradeDate === undefined || selectedDatabaseTradeDate === null) {
    return result(plan, { status: "missing", missingFields: ["strategy.raw-inputs"] });
  }

  let auction = { status: "unavailable", rowCount: 0 };
  try {
    const auctionRows = await queryRows(AUCTION_SQL, [formatDatabaseDate(selectedDatabaseTradeDate, dateToUtc(selectedTradeDate))]);
    auction = { status: auctionRows.length > 0 ? "available" : "unavailable", rowCount: auctionRows.length };
  } catch {
    // Auction is enrichment only. Its availability must not invalidate required market inputs.
  }

  let rawRows;
  try {
    rawRows = await queryRows(RAW_HISTORY_SQL, [historyStartDate(selectedDatabaseTradeDate), formatDatabaseDate(selectedDatabaseTradeDate, dateToUtc(selectedTradeDate))]);
  } catch (error) {
    return result(plan, {
      status: isMissingBaseTable(error) ? "missing" : "failed", latestCommonTradeDate: selectedTradeDate, auction,
      missingFields: [isMissingBaseTable(error) ? "strategy.universe" : "strategy.read"],
    });
  }

  try {
    const rows = deriveMomentumRows(rawRows, selectedTradeDate);
    if (rows.length === 0) {
      return result(plan, { status: "partial", latestCommonTradeDate: selectedTradeDate, auction, missingFields: ["strategy.universe"] });
    }
    return result(plan, {
      status: "ready", latestCommonTradeDate: selectedTradeDate, auction, missingFields: [],
      ...evaluateMomentumUniverse(rows, rules),
    });
  } catch {
    return result(plan, { status: "failed", latestCommonTradeDate: selectedTradeDate, auction, missingFields: ["strategy.raw-inputs"] });
  }
}

const isMainModule = Boolean(process.argv[1]) && pathToFileURL(process.argv[1]).href === import.meta.url;

if (isMainModule) {
  runMomentumStrategy({ argv: process.argv.slice(2), env: process.env })
    .then((summary) => console.log(JSON.stringify(summary, null, 2)))
    .catch((error) => {
      console.error(error instanceof Error ? error.message : "Strategy runner failed");
      process.exitCode = 1;
    });
}
