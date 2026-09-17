import type { ResearchResponse } from "../../research/contracts.ts";
import {
  compactDateOrNull,
  dataResponse,
  dataStatus,
  defaultQueryRows,
  findLatestTradeDate,
  findPreviousTradeDate,
  getRepositoryContext,
  integerOrZero,
  marketBatch,
  numberOrNull,
  placeholdersFor,
  textOrNull,
  toIsoDate,
  type QueryRows,
  type RepositoryOptions,
} from "./repository-helpers.ts";

export type IndexQuote = {
  tsCode: string;
  name: string | null;
  close: number | null;
  pctChg: number | null;
  amountK: number | null;
};

export type BreadthStat = {
  total: number;
  up: number;
  down: number;
  flat: number;
  avgPctChg: number | null;
  amountK: number | null;
  limitUp: number;
  up5Pct: number;
  up0Pct: number;
  down0Pct: number;
  down5Pct: number;
  limitDown: number;
};

export type LimitStat = {
  tradeDate: string;
  limitUp: number;
  limitDown: number;
  upCount: number;
  downCount: number;
  upDownRatio: number | null;
  upRate: number | null;
  upRateChg2d: number | null;
  upRateChg3d: number | null;
  upRateChg5d: number | null;
};

export type IndustryMove = {
  industry: string;
  stockCount: number;
  avgPctChg: number | null;
};

export type SegmentMove = {
  segment: string;
  stockCount: number;
  avgPctChg: number | null;
  amountK: number | null;
};

export type MarginStat = {
  tradeDate: string;
  marketTurnover: number | null;
  shTurnover: number | null;
  szTurnover: number | null;
  totalMarginBalance: number | null;
  marginNetBuy: number | null;
  marginBuy: number | null;
  marginTurnoverRatio: number | null;
  totalTurnoverRatio: number | null;
};

export type GlobalIndex = {
  indexCode: string;
  indexName: string | null;
  close: number | null;
  changePct: number | null;
};

export type CommodityStat = {
  tradeDate: string;
  gold: number | null;
  silver: number | null;
  wti: number | null;
  brent: number | null;
  goldSilverRatio: number | null;
};

export type FxStat = {
  tradeDate: string;
  usd: number | null;
  eur: number | null;
  jpy: number | null;
  hkd: number | null;
};

export type AuctionStat = {
  tradeDate: string;
  stockCount: number;
  avgPctChg: number | null;
  gapUpCount: number;
  gapDownCount: number;
};

export type ValuationStat = {
  peSampleCount: number;
  peTtmAvg: number | null;
  pbAvg: number | null;
  totalMvSum: number | null;
  turnoverAvg: number | null;
};

export type FunnelStep = {
  order: number;
  code: string;
  name: string;
  stockCount: number;
};

export type StrategyHit = {
  tsCode: string;
  name: string | null;
  board: string | null;
  industry: string | null;
  close: number | null;
  pctChg: number | null;
  summary: string | null;
};

export type StrategySummary = {
  runId: number;
  strategyName: string | null;
  evaluationDate: string;
  universeCount: number;
  resultCount: number;
  funnel: FunnelStep[];
  hits: StrategyHit[];
};

export type TodayData = {
  tradeDate: string | null;
  previousTradeDate: string | null;
  indices: IndexQuote[];
  breadth: BreadthStat | null;
  limit: LimitStat | null;
  previousLimit: LimitStat | null;
  industries: IndustryMove[];
  segments: SegmentMove[];
  margin: MarginStat | null;
  globalIndices: GlobalIndex[];
  commodity: CommodityStat | null;
  fx: FxStat | null;
  auction: AuctionStat | null;
  valuation: ValuationStat | null;
  strategy: StrategySummary | null;
};

export const emptyTodayData = (): TodayData => ({
  tradeDate: null,
  previousTradeDate: null,
  indices: [],
  breadth: null,
  limit: null,
  previousLimit: null,
  industries: [],
  segments: [],
  margin: null,
  globalIndices: [],
  commodity: null,
  fx: null,
  auction: null,
  valuation: null,
  strategy: null,
});

const MAIN_INDEX_CODES = [
  "000001.SH",
  "399001.SZ",
  "399006.SZ",
  "000300.SH",
  "000905.SH",
  "000852.SH",
  "000688.SH",
  "000016.SH",
] as const;

const GLOBAL_INDEX_CODES = [
  "hkHSI",
  "hkHSCEI",
  "us.DJI",
  "us.INX",
  "us.IXIC",
  "日经225",
  "德国DAX30",
  "富时100",
  "KOSPI",
] as const;

const INDEX_QUOTE_SQL = `SELECT
  quote.ts_code AS tsCode,
  info.name AS name,
  quote.close AS close,
  quote.pct_chg AS pctChg,
  quote.amount AS amountK
FROM index_daily AS quote
LEFT JOIN index_basic AS info ON info.ts_code = quote.ts_code
WHERE quote.trade_date = ? AND quote.ts_code IN (${placeholdersFor(MAIN_INDEX_CODES)})`;

const BREADTH_SQL = `SELECT
  COUNT(*) AS total,
  SUM(CASE WHEN pct_chg > 0 THEN 1 ELSE 0 END) AS up,
  SUM(CASE WHEN pct_chg < 0 THEN 1 ELSE 0 END) AS down,
  SUM(CASE WHEN pct_chg = 0 THEN 1 ELSE 0 END) AS flat,
  AVG(pct_chg) AS avgPctChg,
  SUM(amount) AS amountK,
  SUM(CASE WHEN pct_chg >= 9.8 THEN 1 ELSE 0 END) AS limitUp,
  SUM(CASE WHEN pct_chg >= 5 AND pct_chg < 9.8 THEN 1 ELSE 0 END) AS up5Pct,
  SUM(CASE WHEN pct_chg > 0 AND pct_chg < 5 THEN 1 ELSE 0 END) AS up0Pct,
  SUM(CASE WHEN pct_chg < 0 AND pct_chg > -5 THEN 1 ELSE 0 END) AS down0Pct,
  SUM(CASE WHEN pct_chg <= -5 AND pct_chg > -9.8 THEN 1 ELSE 0 END) AS down5Pct,
  SUM(CASE WHEN pct_chg <= -9.8 THEN 1 ELSE 0 END) AS limitDown
FROM daily
WHERE trade_date = ?`;

const LIMIT_SQL = `SELECT
  trade_date AS tradeDate,
  limit_up AS limitUp,
  limit_down AS limitDown,
  up_count AS upCount,
  down_count AS downCount,
  up_down_ratio AS upDownRatio,
  up_rate AS upRate,
  up_rate_chg_2d AS upRateChg2d,
  up_rate_chg_3d AS upRateChg3d,
  up_rate_chg_5d AS upRateChg5d
FROM limit_updown
WHERE trade_date <= ?
ORDER BY trade_date DESC
LIMIT 2`;

const INDUSTRY_SQL = `SELECT
  info.industry AS industry,
  COUNT(*) AS stockCount,
  AVG(quote.pct_chg) AS avgPctChg
FROM daily AS quote
JOIN stock_basic AS info ON info.ts_code = quote.ts_code
WHERE quote.trade_date = ? AND info.list_status = 'L' AND info.industry IS NOT NULL
GROUP BY info.industry
HAVING COUNT(*) >= 3
ORDER BY avgPctChg DESC`;

const SEGMENT_SQL = `SELECT
  info.market AS segment,
  COUNT(*) AS stockCount,
  AVG(quote.pct_chg) AS avgPctChg,
  SUM(quote.amount) AS amountK
FROM daily AS quote
JOIN stock_basic AS info ON info.ts_code = quote.ts_code
WHERE quote.trade_date = ? AND info.list_status = 'L' AND info.market IS NOT NULL
GROUP BY info.market
ORDER BY avgPctChg DESC`;

const MARGIN_SQL = `SELECT
  trade_date AS tradeDate,
  market_turnover AS marketTurnover,
  sh_turnover AS shTurnover,
  sz_turnover AS szTurnover,
  total_margin_balance AS totalMarginBalance,
  margin_net_buy AS marginNetBuy,
  margin_buy AS marginBuy,
  margin_turnover_ratio AS marginTurnoverRatio,
  total_turnover_ratio AS totalTurnoverRatio
FROM margin_daily
WHERE trade_date <= ?
ORDER BY trade_date DESC
LIMIT 1`;

const GLOBAL_LATEST_SQL = `SELECT MAX(trade_date) AS latestDate
FROM foreign_index
WHERE trade_date <= ?`;

const GLOBAL_INDEX_SQL = `SELECT
  index_code AS indexCode,
  index_name AS indexName,
  close AS close,
  change_pct AS changePct
FROM foreign_index
WHERE trade_date = ? AND index_code IN (${placeholdersFor(GLOBAL_INDEX_CODES)})`;

const COMMODITY_SQL = `SELECT
  trade_date AS tradeDate,
  gold, silver, wti, brent,
  gold_silver_ratio AS goldSilverRatio
FROM gold_oil
WHERE trade_date <= ?
ORDER BY trade_date DESC
LIMIT 1`;

const FX_SQL = `SELECT
  trade_date AS tradeDate,
  usd, eur, jpy, hkd
FROM exchange_rate
WHERE trade_date <= ?
ORDER BY trade_date DESC
LIMIT 1`;

const AUCTION_SQL = `SELECT
  COUNT(*) AS stockCount,
  AVG(pct_chg) AS avgPctChg,
  SUM(CASE WHEN pct_chg > 0 THEN 1 ELSE 0 END) AS gapUpCount,
  SUM(CASE WHEN pct_chg < 0 THEN 1 ELSE 0 END) AS gapDownCount
FROM call_auction
WHERE trade_date = ?`;

const VALUATION_SQL = `SELECT
  SUM(CASE WHEN pe_ttm > 0 AND pe_ttm < 500 THEN 1 ELSE 0 END) AS peSampleCount,
  AVG(CASE WHEN pe_ttm > 0 AND pe_ttm < 500 THEN pe_ttm END) AS peTtmAvg,
  AVG(CASE WHEN pb > 0 AND pb < 50 THEN pb END) AS pbAvg,
  SUM(total_mv) AS totalMvSum,
  AVG(turnover_rate) AS turnoverAvg
FROM daily_basic
WHERE trade_date = ?`;

const STRATEGY_RUN_SQL = `SELECT
  id, strategy_name AS strategyName, evaluation_date AS evaluationDate,
  universe_count AS universeCount, result_count AS resultCount
FROM risk_strategy_run
WHERE status = 'success' AND evaluation_date <= ?
ORDER BY evaluation_date DESC, id DESC
LIMIT 1`;

const STRATEGY_FUNNEL_SQL = `SELECT
  stage_order AS stageOrder,
  stage_code AS stageCode,
  stage_name AS stageName,
  stock_count AS stockCount
FROM risk_strategy_funnel
WHERE run_id = ?
ORDER BY stage_order`;

const STRATEGY_HIT_SQL = `SELECT
  ts_code AS tsCode,
  name, board, industry, close,
  pct_chg AS pctChg,
  summary
FROM risk_strategy_result
WHERE run_id = ?
ORDER BY pct_chg DESC, ts_code ASC
LIMIT 10`;

const INDEX_ORDER = new Map<string, number>(MAIN_INDEX_CODES.map((code, index) => [code, index]));
const GLOBAL_ORDER = new Map<string, number>(GLOBAL_INDEX_CODES.map((code, index) => [code, index]));

function toLimitStat(row: Record<string, unknown>): LimitStat | null {
  const tradeDate = compactDateOrNull(row.tradeDate);
  if (!tradeDate) return null;
  return {
    tradeDate,
    limitUp: integerOrZero(row.limitUp),
    limitDown: integerOrZero(row.limitDown),
    upCount: integerOrZero(row.upCount),
    downCount: integerOrZero(row.downCount),
    upDownRatio: numberOrNull(row.upDownRatio),
    upRate: numberOrNull(row.upRate),
    upRateChg2d: numberOrNull(row.upRateChg2d),
    upRateChg3d: numberOrNull(row.upRateChg3d),
    upRateChg5d: numberOrNull(row.upRateChg5d),
  };
}

export async function getTodayResearch(
  query: QueryRows = defaultQueryRows,
  options: RepositoryOptions = {},
): Promise<ResearchResponse<TodayData>> {
  const empty = emptyTodayData();
  let serverDate = "";
  try {
    const context = getRepositoryContext(options);
    serverDate = context.system.serverDate;
    const tradeDate = await findLatestTradeDate(query, context.tradeDate);
    if (!tradeDate) {
      return dataResponse(serverDate, "missing", empty, ["today.tradeDate"]);
    }

    const [previousTradeDate, indexRows, breadthRows, limitRows, industryRows, segmentRows, marginRows, globalDateRows, commodityRows, fxRows, auctionRows, valuationRows, strategyRunRows] = await Promise.all([
      findPreviousTradeDate(query, tradeDate),
      query<Record<string, unknown>>(INDEX_QUOTE_SQL, [tradeDate, ...MAIN_INDEX_CODES]),
      query<Record<string, unknown>>(BREADTH_SQL, [tradeDate]),
      query<Record<string, unknown>>(LIMIT_SQL, [tradeDate]),
      query<Record<string, unknown>>(INDUSTRY_SQL, [tradeDate]),
      query<Record<string, unknown>>(SEGMENT_SQL, [tradeDate]),
      query<Record<string, unknown>>(MARGIN_SQL, [tradeDate]),
      query<Record<string, unknown>>(GLOBAL_LATEST_SQL, [tradeDate]),
      query<Record<string, unknown>>(COMMODITY_SQL, [tradeDate]),
      query<Record<string, unknown>>(FX_SQL, [tradeDate]),
      query<Record<string, unknown>>(AUCTION_SQL, [tradeDate]),
      query<Record<string, unknown>>(VALUATION_SQL, [tradeDate]),
      query<Record<string, unknown>>(STRATEGY_RUN_SQL, [tradeDate]),
    ]);

    const globalDate = compactDateOrNull(globalDateRows[0]?.latestDate);
    const globalRows = globalDate
      ? await query<Record<string, unknown>>(GLOBAL_INDEX_SQL, [globalDate, ...GLOBAL_INDEX_CODES])
      : [];

    const runId = Number(strategyRunRows[0]?.id);
    const hasRun = Number.isSafeInteger(runId) && runId > 0;
    const funnelRows = hasRun ? await query<Record<string, unknown>>(STRATEGY_FUNNEL_SQL, [runId]) : [];
    const hitRows = hasRun ? await query<Record<string, unknown>>(STRATEGY_HIT_SQL, [runId]) : [];

    const indices: IndexQuote[] = indexRows
      .map((row) => ({
        tsCode: String(row.tsCode ?? ""),
        name: textOrNull(row.name),
        close: numberOrNull(row.close),
        pctChg: numberOrNull(row.pctChg),
        amountK: numberOrNull(row.amountK),
      }))
      .sort((left, right) => (INDEX_ORDER.get(left.tsCode) ?? 99) - (INDEX_ORDER.get(right.tsCode) ?? 99));

    const breadthRow = breadthRows[0];
    const breadth: BreadthStat | null = breadthRow
      ? {
          total: integerOrZero(breadthRow.total),
          up: integerOrZero(breadthRow.up),
          down: integerOrZero(breadthRow.down),
          flat: integerOrZero(breadthRow.flat),
          avgPctChg: numberOrNull(breadthRow.avgPctChg),
          amountK: numberOrNull(breadthRow.amountK),
          limitUp: integerOrZero(breadthRow.limitUp),
          up5Pct: integerOrZero(breadthRow.up5Pct),
          up0Pct: integerOrZero(breadthRow.up0Pct),
          down0Pct: integerOrZero(breadthRow.down0Pct),
          down5Pct: integerOrZero(breadthRow.down5Pct),
          limitDown: integerOrZero(breadthRow.limitDown),
        }
      : null;

    const limit = limitRows[0] ? toLimitStat(limitRows[0]) : null;
    const previousLimit = limitRows[1] ? toLimitStat(limitRows[1]) : null;

    const industries: IndustryMove[] = industryRows.map((row) => ({
      industry: String(row.industry ?? "XX"),
      stockCount: integerOrZero(row.stockCount),
      avgPctChg: numberOrNull(row.avgPctChg),
    }));

    const segments: SegmentMove[] = segmentRows.map((row) => ({
      segment: String(row.segment ?? "XX"),
      stockCount: integerOrZero(row.stockCount),
      avgPctChg: numberOrNull(row.avgPctChg),
      amountK: numberOrNull(row.amountK),
    }));

    const marginRow = marginRows[0];
    const margin: MarginStat | null = marginRow && compactDateOrNull(marginRow.tradeDate)
      ? {
          tradeDate: String(marginRow.tradeDate),
          marketTurnover: numberOrNull(marginRow.marketTurnover),
          shTurnover: numberOrNull(marginRow.shTurnover),
          szTurnover: numberOrNull(marginRow.szTurnover),
          totalMarginBalance: numberOrNull(marginRow.totalMarginBalance),
          marginNetBuy: numberOrNull(marginRow.marginNetBuy),
          marginBuy: numberOrNull(marginRow.marginBuy),
          marginTurnoverRatio: numberOrNull(marginRow.marginTurnoverRatio),
          totalTurnoverRatio: numberOrNull(marginRow.totalTurnoverRatio),
        }
      : null;

    const globalIndices: GlobalIndex[] = globalRows
      .map((row) => ({
        indexCode: String(row.indexCode ?? ""),
        indexName: textOrNull(row.indexName),
        close: numberOrNull(row.close),
        changePct: numberOrNull(row.changePct),
      }))
      .sort((left, right) => (GLOBAL_ORDER.get(left.indexCode) ?? 99) - (GLOBAL_ORDER.get(right.indexCode) ?? 99));

    const commodityRow = commodityRows[0];
    const commodity: CommodityStat | null = commodityRow && compactDateOrNull(commodityRow.tradeDate)
      ? {
          tradeDate: String(commodityRow.tradeDate),
          gold: numberOrNull(commodityRow.gold),
          silver: numberOrNull(commodityRow.silver),
          wti: numberOrNull(commodityRow.wti),
          brent: numberOrNull(commodityRow.brent),
          goldSilverRatio: numberOrNull(commodityRow.goldSilverRatio),
        }
      : null;

    const fxRow = fxRows[0];
    const fx: FxStat | null = fxRow && compactDateOrNull(fxRow.tradeDate)
      ? {
          tradeDate: String(fxRow.tradeDate),
          usd: numberOrNull(fxRow.usd),
          eur: numberOrNull(fxRow.eur),
          jpy: numberOrNull(fxRow.jpy),
          hkd: numberOrNull(fxRow.hkd),
        }
      : null;

    const auctionRow = auctionRows[0];
    const auction: AuctionStat | null = auctionRow && integerOrZero(auctionRow.stockCount) > 0
      ? {
          tradeDate,
          stockCount: integerOrZero(auctionRow.stockCount),
          avgPctChg: numberOrNull(auctionRow.avgPctChg),
          gapUpCount: integerOrZero(auctionRow.gapUpCount),
          gapDownCount: integerOrZero(auctionRow.gapDownCount),
        }
      : null;

    const valuationRow = valuationRows[0];
    const valuation: ValuationStat | null = valuationRow
      ? {
          peSampleCount: integerOrZero(valuationRow.peSampleCount),
          peTtmAvg: numberOrNull(valuationRow.peTtmAvg),
          pbAvg: numberOrNull(valuationRow.pbAvg),
          totalMvSum: numberOrNull(valuationRow.totalMvSum),
          turnoverAvg: numberOrNull(valuationRow.turnoverAvg),
        }
      : null;

    const strategyRunRow = strategyRunRows[0];
    const strategy: StrategySummary | null = strategyRunRow
      ? {
          runId,
          strategyName: textOrNull(strategyRunRow.strategyName),
          evaluationDate: String(strategyRunRow.evaluationDate ?? "XX"),
          universeCount: integerOrZero(strategyRunRow.universeCount),
          resultCount: integerOrZero(strategyRunRow.resultCount),
          funnel: funnelRows.map((row) => ({
            order: integerOrZero(row.stageOrder),
            code: String(row.stageCode ?? ""),
            name: String(row.stageName ?? "XX"),
            stockCount: integerOrZero(row.stockCount),
          })),
          hits: hitRows.map((row) => ({
            tsCode: String(row.tsCode ?? "XX"),
            name: textOrNull(row.name),
            board: textOrNull(row.board),
            industry: textOrNull(row.industry),
            close: numberOrNull(row.close),
            pctChg: numberOrNull(row.pctChg),
            summary: textOrNull(row.summary),
          })),
        }
      : null;

    const data: TodayData = {
      tradeDate,
      previousTradeDate,
      indices,
      breadth,
      limit,
      previousLimit,
      industries,
      segments,
      margin,
      globalIndices,
      commodity,
      fx,
      auction,
      valuation,
      strategy,
    };

    const missingFields = [
      ...(indices.length ? [] : ["today.indices"]),
      ...(breadth && breadth.total > 0 ? [] : ["today.breadth"]),
      ...(limit ? [] : ["today.limit"]),
      ...(industries.length ? [] : ["today.industries"]),
      ...(segments.length ? [] : ["today.segments"]),
      ...(globalIndices.length ? [] : ["today.globalIndices"]),
      ...(commodity ? [] : ["today.commodity"]),
      ...(fx ? [] : ["today.fx"]),
      ...(auction ? [] : ["today.auction"]),
      ...(valuation && valuation.peSampleCount > 0 ? [] : ["today.valuation"]),
      ...(strategy ? [] : ["today.strategy"]),
    ];

    return dataResponse(serverDate, dataStatus(missingFields), data, missingFields, marketBatch(tradeDate));
  } catch {
    if (!serverDate) serverDate = getRepositoryContext({ now: options.now }).system.serverDate;
    return dataResponse(serverDate, "failed", empty, ["today.query"]);
  }
}

export const todayBatchLabel = (data: TodayData): string => (data.tradeDate ? toIsoDate(data.tradeDate) : "XX");
