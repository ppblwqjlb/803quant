import type { ResearchResponse } from "../../research/contracts.ts";
import {
  compactDateOrNull,
  dataResponse,
  dataStatus,
  decodeJsonArray,
  defaultQueryRows,
  getRepositoryContext,
  integerOrZero,
  isJsonObjectItem,
  marketBatch,
  numberOrNull,
  textOrNull,
  type QueryRows,
  type RepositoryOptions,
} from "./repository-helpers.ts";

export type StrategyStage = {
  order: number;
  code: string;
  name: string;
  stockCount: number;
};

export type StrategySignal = {
  label: string | null;
  value: string | null;
};

export type StrategyEvidence = {
  label: string | null;
  value: string | null;
  status: string | null;
};

export type StrategyCandidate = {
  tsCode: string;
  name: string | null;
  board: string | null;
  industry: string | null;
  evaluationDate: string;
  signalDate: string;
  close: number | null;
  pctChg: number | null;
  summary: string | null;
  signals: StrategySignal[];
  evidence: StrategyEvidence[];
};

export type StrategyRun = {
  runId: number;
  strategyCode: string;
  strategyName: string | null;
  evaluationDate: string;
  paramsVersion: string | null;
  status: string;
  startedAt: string | null;
  completedAt: string | null;
  runtimeMs: number | null;
  universeCount: number;
  resultCount: number;
};

export type FailureStage = {
  stage: string;
  label: string;
  count: number;
};

export type SignalHistoryItem = {
  tsCode: string;
  name: string | null;
  board: string | null;
  industry: string | null;
  confirmationDate: string;
  firstPublishedAt: string | null;
  close: number | null;
  pctChg: number | null;
  summary: string | null;
};

export type StrategyData = {
  run: StrategyRun | null;
  funnel: StrategyStage[];
  candidates: StrategyCandidate[];
  failureStages: FailureStage[];
  history: SignalHistoryItem[];
};

export const emptyStrategyData = (): StrategyData => ({
  run: null,
  funnel: [],
  candidates: [],
  failureStages: [],
  history: [],
});

const STAGE_LABELS: Record<string, string> = {
  universe: "全市场样本",
  low_structure: "低位结构",
  trial_confirm: "试盘确认",
  gap_volume: "跳空放量",
  three_bullish: "三连阳",
  volume_rise: "放量上涨",
  confirmation_date: "确认日期",
};

const RUN_SQL = `SELECT
  id,
  strategy_code AS strategyCode,
  strategy_name AS strategyName,
  evaluation_date AS evaluationDate,
  params_version AS paramsVersion,
  status,
  started_at AS startedAt,
  completed_at AS completedAt,
  universe_count AS universeCount,
  result_count AS resultCount
FROM risk_strategy_run
WHERE status = 'success' AND evaluation_date <= ?
ORDER BY evaluation_date DESC, id DESC
LIMIT 1`;

const FUNNEL_SQL = `SELECT
  stage_order AS stageOrder,
  stage_code AS stageCode,
  stage_name AS stageName,
  stock_count AS stockCount
FROM risk_strategy_funnel
WHERE run_id = ?
ORDER BY stage_order`;

const CANDIDATE_SQL = `SELECT
  ts_code AS tsCode,
  name, board, industry,
  evaluation_date AS evaluationDate,
  signal_date AS signalDate,
  close,
  pct_chg AS pctChg,
  summary,
  signals_json AS signals,
  evidence_json AS evidence
FROM risk_strategy_result
WHERE run_id = ?
ORDER BY pct_chg DESC, ts_code ASC`;

const FAILURE_SQL = `SELECT
  failure_stage AS failureStage,
  COUNT(*) AS stockCount
FROM risk_strategy_stock_stage
WHERE run_id = ? AND failure_stage IS NOT NULL
GROUP BY failure_stage
ORDER BY stockCount DESC`;

const HISTORY_SQL = `SELECT
  ts_code AS tsCode,
  name, board, industry,
  confirmation_date AS confirmationDate,
  first_published_at AS firstPublishedAt,
  close,
  pct_chg AS pctChg,
  summary
FROM risk_strategy_signal_history
WHERE confirmation_date <= ?
ORDER BY confirmation_date DESC, id DESC
LIMIT 20`;

function asText(value: unknown): string | null {
  if (value === null || value === undefined) return null;
  const text = String(value).trim();
  return text ? text : null;
}

function toSignalList(value: unknown): StrategySignal[] {
  return (decodeJsonArray(value) ?? []).flatMap((item) =>
    isJsonObjectItem(item)
      ? [{ label: asText(item.label), value: asText(item.value) }]
      : [],
  );
}

function toEvidenceList(value: unknown): StrategyEvidence[] {
  return (decodeJsonArray(value) ?? []).flatMap((item) =>
    isJsonObjectItem(item)
      ? [{ label: asText(item.label), value: asText(item.value), status: asText(item.status) }]
      : [],
  );
}

function runtimeMilliseconds(startedAt: unknown, completedAt: unknown): number | null {
  const start = typeof startedAt === "string" ? Date.parse(startedAt.replace(" ", "T")) : Number.NaN;
  const end = typeof completedAt === "string" ? Date.parse(completedAt.replace(" ", "T")) : Number.NaN;
  if (!Number.isFinite(start) || !Number.isFinite(end) || end < start) return null;
  return Math.round(end - start);
}

export async function getStrategyResearch(
  query: QueryRows = defaultQueryRows,
  options: RepositoryOptions = {},
): Promise<ResearchResponse<StrategyData>> {
  const empty = emptyStrategyData();
  let serverDate = "";
  try {
    const context = getRepositoryContext(options);
    serverDate = context.system.serverDate;
    const requestedCompact = context.tradeDate.replaceAll("-", "");

    const runRows = await query<Record<string, unknown>>(RUN_SQL, [requestedCompact]);
    const runRow = runRows[0];
    const runId = Number(runRow?.id);
    if (!runRow || !Number.isSafeInteger(runId) || runId <= 0) {
      return dataResponse(serverDate, "missing", empty, ["strategy.run"]);
    }

    const evaluationDate = compactDateOrNull(runRow.evaluationDate) ?? requestedCompact;
    const [funnelRows, candidateRows, failureRows, historyRows] = await Promise.all([
      query<Record<string, unknown>>(FUNNEL_SQL, [runId]),
      query<Record<string, unknown>>(CANDIDATE_SQL, [runId]),
      query<Record<string, unknown>>(FAILURE_SQL, [runId]),
      query<Record<string, unknown>>(HISTORY_SQL, [evaluationDate]),
    ]);

    const funnel: StrategyStage[] = funnelRows.map((row) => ({
      order: integerOrZero(row.stageOrder),
      code: String(row.stageCode ?? ""),
      name: String(row.stageName ?? "XX"),
      stockCount: integerOrZero(row.stockCount),
    }));

    const candidates: StrategyCandidate[] = candidateRows.map((row) => ({
      tsCode: String(row.tsCode ?? "XX"),
      name: textOrNull(row.name),
      board: textOrNull(row.board),
      industry: textOrNull(row.industry),
      evaluationDate: String(row.evaluationDate ?? "XX"),
      signalDate: String(row.signalDate ?? "XX"),
      close: numberOrNull(row.close),
      pctChg: numberOrNull(row.pctChg),
      summary: textOrNull(row.summary),
      signals: toSignalList(row.signals),
      evidence: toEvidenceList(row.evidence),
    }));

    const failureStages: FailureStage[] = failureRows.map((row) => {
      const stage = String(row.failureStage ?? "");
      return { stage, label: STAGE_LABELS[stage] ?? stage, count: integerOrZero(row.stockCount) };
    });

    const history: SignalHistoryItem[] = historyRows.map((row) => ({
      tsCode: String(row.tsCode ?? "XX"),
      name: textOrNull(row.name),
      board: textOrNull(row.board),
      industry: textOrNull(row.industry),
      confirmationDate: String(row.confirmationDate ?? "XX"),
      firstPublishedAt: textOrNull(row.firstPublishedAt),
      close: numberOrNull(row.close),
      pctChg: numberOrNull(row.pctChg),
      summary: textOrNull(row.summary),
    }));

    const run: StrategyRun = {
      runId,
      strategyCode: String(runRow.strategyCode ?? "XX"),
      strategyName: textOrNull(runRow.strategyName),
      evaluationDate,
      paramsVersion: textOrNull(runRow.paramsVersion),
      status: String(runRow.status ?? ""),
      startedAt: textOrNull(runRow.startedAt),
      completedAt: textOrNull(runRow.completedAt),
      runtimeMs: runtimeMilliseconds(runRow.startedAt, runRow.completedAt),
      universeCount: integerOrZero(runRow.universeCount),
      resultCount: integerOrZero(runRow.resultCount),
    };

    const missingFields = [
      ...(funnel.length ? [] : ["strategy.funnel"]),
      ...(candidates.length || run.resultCount === 0 ? [] : ["strategy.candidates"]),
      ...(history.length ? [] : ["strategy.history"]),
    ];

    return dataResponse(
      serverDate,
      dataStatus(missingFields),
      { run, funnel, candidates, failureStages, history },
      missingFields,
      marketBatch(evaluationDate),
    );
  } catch {
    if (!serverDate) serverDate = getRepositoryContext({ now: options.now }).system.serverDate;
    return dataResponse(serverDate, "failed", empty, ["strategy.query"]);
  }
}
