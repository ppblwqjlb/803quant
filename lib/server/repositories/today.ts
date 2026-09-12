import type { ResearchResponse } from "../../research/contracts.ts";
import type { RiskSnapshot } from "./risk.ts";
import type { StrategyCandidate, StrategyRun } from "./strategy.ts";
import {
  defaultQueryRows,
  decodeJsonArray,
  errorResponse,
  finalStatus,
  findCurrentBatch,
  getRepositoryContext,
  initialState,
  isJsonObjectItem,
  requestedDateBounds,
  response,
  type QueryRows,
  type RepositoryOptions,
} from "./repository-helpers.ts";

export type TodaySnapshot = {
  id: number;
  marketStage: string | null;
  headline: string | null;
  summary: string | null;
  actionText: string | null;
  summaryPoints: unknown;
  sourceName?: string | null;
  sourceUrl?: string | null;
  sourcePublishedAt?: string | Date | null;
  dataAsOf: string | Date;
};

export type IntelItem = Record<string, unknown> & { id: number; title: string };
export type MarketEvent = Record<string, unknown> & { id: number; title: string };
export type TodayData = {
  snapshot: TodaySnapshot | null;
  riskSnapshot: RiskSnapshot | null;
  strategyRun: StrategyRun | null;
  strategyCandidates: StrategyCandidate[];
  intelItems: IntelItem[];
  events: MarketEvent[];
};

export const emptyTodayData = (): TodayData => ({
  snapshot: null,
  riskSnapshot: null,
  strategyRun: null,
  strategyCandidates: [],
  intelItems: [],
  events: [],
});

const SNAPSHOT_SQL = `SELECT
  id,
  market_stage AS marketStage,
  headline,
  summary,
  action_text AS actionText,
  summary_points_json AS summaryPoints,
  source_name AS sourceName,
  source_url AS sourceUrl,
  source_published_at AS sourcePublishedAt,
  data_as_of AS dataAsOf
FROM daily_decision_snapshot
WHERE research_batch_id = ?
LIMIT 1`;

const INTEL_SQL = `SELECT
  id, author_name AS authorName, content_kind AS contentKind, attention_action AS attentionAction,
  sector, title, body_summary AS bodySummary, change_summary AS changeSummary, importance,
  published_at AS publishedAt, source_name AS sourceName, source_url AS sourceUrl,
  source_published_at AS sourcePublishedAt, data_as_of AS dataAsOf
FROM intel_item
WHERE published_at >= ? AND published_at < ? AND data_as_of <= ?
ORDER BY published_at DESC, id DESC
LIMIT 100`;

const EVENTS_SQL = `SELECT
  id, event_code AS eventCode, event_date AS eventDate, starts_at AS startsAt, ends_at AS endsAt,
  category, title, summary, event_status AS eventStatus, related_sector AS relatedSector,
  related_symbol AS relatedSymbol, importance, sort_order AS sortOrder, source_name AS sourceName,
  source_url AS sourceUrl, source_published_at AS sourcePublishedAt, data_as_of AS dataAsOf
FROM market_event
WHERE event_date >= ? AND event_date < ? AND data_as_of <= ?
ORDER BY event_date, sort_order, id
LIMIT 100`;

const RISK_PREVIEW_SQL = `SELECT
  id, risk_score AS score, stage_code AS stageCode, stage_label AS stageLabel,
  risk_coefficient_pct AS riskCoefficientPct, exposure_constraint_pct AS exposureConstraintPct,
  current_data_layer AS currentDataLayer, summary, action_text AS actionText,
  kill_condition_hit_count AS killConditionHitCount, kill_condition_total_count AS killConditionTotalCount,
  kill_switch_triggered AS killSwitchTriggered, timeline_json AS timeline,
  kill_conditions_json AS killConditions, source_name AS sourceName, source_url AS sourceUrl,
  source_published_at AS sourcePublishedAt, data_as_of AS dataAsOf
FROM risk_snapshot
WHERE research_batch_id = ?
LIMIT 1`;

const STRATEGY_RUN_PREVIEW_SQL = `SELECT
  id, strategy_definition_id AS strategyDefinitionId, trade_date AS tradeDate, run_status AS runStatus,
  market_sample_count AS marketSampleCount, official_candidate_count AS officialCandidateCount,
  near_candidate_count AS nearCandidateCount, runtime_ms AS runtimeMs, started_at AS startedAt,
  completed_at AS completedAt, source_name AS sourceName, source_url AS sourceUrl,
  source_published_at AS sourcePublishedAt, data_as_of AS dataAsOf
FROM strategy_run
WHERE research_batch_id = ?
LIMIT 1`;

const STRATEGY_CANDIDATE_PREVIEW_SQL = `SELECT
  candidate.id, candidate.candidate_type AS candidateType, candidate.rank_no AS rankNo,
  candidate.match_score AS matchScore, candidate.close_price AS closePrice,
  candidate.change_rate_pct AS changeRatePct, candidate.gap_rate_pct AS gapRatePct,
  candidate.volume_ratio AS volumeRatio, candidate.setup_label AS setupLabel,
  candidate.reason_text AS reasonText, candidate.evidence_json AS evidence,
  stock.ts_code AS tsCode, stock.name, stock.market, stock.board, stock.industry,
  candidate.source_name AS sourceName, candidate.source_url AS sourceUrl,
  candidate.source_published_at AS sourcePublishedAt, candidate.data_as_of AS dataAsOf
FROM strategy_candidate AS candidate
JOIN strategy_run AS run ON run.id = candidate.strategy_run_id
JOIN strategy_definition AS definition ON definition.id = run.strategy_definition_id
JOIN stock_basic AS stock ON stock.id = candidate.stock_id
WHERE run.research_batch_id = ? AND definition.strategy_code = ?
ORDER BY candidate.candidate_type, candidate.rank_no, candidate.match_score DESC, candidate.id
LIMIT 20`;

function isDisplayableBatch(status: string | undefined): boolean {
  return status === "success" || status === "partial";
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
    const batch = await findCurrentBatch(query, "today", context.tradeDate);
    const early = initialState("today", serverDate, batch, empty);
    if (early || !batch) return early!;

    const cutoff = batch.dataAsOf;
    const bounds = requestedDateBounds(context.tradeDate);
    const [riskBatch, strategyBatch] = await Promise.all([
      findCurrentBatch(query, "risk", context.tradeDate),
      findCurrentBatch(query, "strategy", context.tradeDate),
    ]);
    const [snapshots, riskSnapshots, strategyRuns, strategyCandidates, intelItems, events] = await Promise.all([
      query<TodaySnapshot>(SNAPSHOT_SQL, [batch.id]),
      isDisplayableBatch(riskBatch?.batchStatus)
        ? query<RiskSnapshot>(RISK_PREVIEW_SQL, [riskBatch!.id])
        : Promise.resolve([]),
      isDisplayableBatch(strategyBatch?.batchStatus)
        ? query<StrategyRun>(STRATEGY_RUN_PREVIEW_SQL, [strategyBatch!.id])
        : Promise.resolve([]),
      isDisplayableBatch(strategyBatch?.batchStatus)
        ? query<StrategyCandidate>(STRATEGY_CANDIDATE_PREVIEW_SQL, [strategyBatch!.id, "momentum-gap-volume"])
        : Promise.resolve([]),
      cutoff ? query<IntelItem>(INTEL_SQL, [bounds.dayStart, bounds.dayEnd, cutoff]) : Promise.resolve([]),
      cutoff ? query<MarketEvent>(EVENTS_SQL, [bounds.monthStart, bounds.monthEnd, cutoff]) : Promise.resolve([]),
    ]);
    const strategyRun = strategyRuns[0] ?? null;
    const rawSnapshot = snapshots[0] ?? null;
    const summaryPoints = rawSnapshot ? decodeJsonArray(rawSnapshot.summaryPoints) : null;
    const data: TodayData = {
      snapshot: rawSnapshot ? { ...rawSnapshot, summaryPoints } : null,
      riskSnapshot: riskSnapshots[0] ?? null,
      strategyRun,
      strategyCandidates,
      intelItems,
      events,
    };
    const expectedPreviewCandidates = Math.min(
      (strategyRun?.officialCandidateCount ?? 0) + (strategyRun?.nearCandidateCount ?? 0),
      20,
    );
    const missingFields = [
      ...(data.snapshot ? [] : ["today.snapshot"]),
      ...(data.snapshot && summaryPoints?.length !== 3 ? ["today.snapshot.summaryPoints"] : []),
      ...(summaryPoints ?? []).flatMap((item, index) =>
        isJsonObjectItem(item) ? [] : [`today.snapshot.summaryPoints.${index}`]),
      ...(data.riskSnapshot ? [] : ["today.riskSnapshot"]),
      ...(data.strategyRun ? [] : ["today.strategyRun"]),
      ...(strategyCandidates.length >= expectedPreviewCandidates ? [] : ["today.strategyCandidates"]),
      ...(intelItems.length ? [] : ["today.intelItems"]),
      ...(events.length ? [] : ["today.events"]),
      ...(cutoff ? [] : ["today.dataAsOf"]),
    ];
    return response(serverDate, finalStatus(batch, missingFields), data, missingFields, batch);
  } catch (error) {
    if (!serverDate) serverDate = getRepositoryContext({ now: options.now }).system.serverDate;
    return errorResponse("today", serverDate, empty, error);
  }
}
