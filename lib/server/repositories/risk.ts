import type { ResearchResponse } from "../../research/contracts.ts";
import {
  defaultQueryRows,
  decodeJsonArray,
  errorResponse,
  finalStatus,
  findCurrentBatch,
  getRepositoryContext,
  initialState,
  isJsonObjectItem,
  response,
  type QueryRows,
  type RepositoryOptions,
} from "./repository-helpers.ts";

const REQUIRED_SIGNAL_CODES = ["breadth", "limit", "volume", "leader", "sentiment", "external"] as const;

export type RiskSnapshot = Record<string, unknown> & {
  id: number;
  score: number | null;
  riskCoefficientPct: number | null;
  killSwitchTriggered: boolean | number | null;
  timeline: unknown;
  killConditions: unknown;
};
export type RiskSignal = Record<string, unknown> & { id: number; signalCode: string };
export type RiskData = { snapshot: RiskSnapshot | null; signals: RiskSignal[] };

export const emptyRiskData = (): RiskData => ({ snapshot: null, signals: [] });

const SNAPSHOT_SQL = `SELECT
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

const SIGNALS_SQL = `SELECT
  risk_signal.id, risk_signal.signal_code AS signalCode, risk_signal.signal_label AS signalLabel,
  risk_signal.display_value AS displayValue, risk_signal.raw_numeric_value AS rawNumericValue,
  risk_signal.historical_percentile_pct AS historicalPercentilePct, risk_signal.threshold_text AS thresholdText,
  risk_signal.contribution_score AS contributionScore, risk_signal.signal_status AS signalStatus,
  risk_signal.explanation, risk_signal.sort_order AS sortOrder, risk_signal.source_name AS sourceName,
  risk_signal.source_url AS sourceUrl, risk_signal.source_published_at AS sourcePublishedAt, risk_signal.data_as_of AS dataAsOf
FROM risk_signal_result AS risk_signal
JOIN risk_snapshot AS snapshot ON snapshot.id = risk_signal.risk_snapshot_id
WHERE snapshot.research_batch_id = ?
ORDER BY risk_signal.sort_order, risk_signal.id`;

export async function getRiskResearch(
  query: QueryRows = defaultQueryRows,
  options: RepositoryOptions = {},
): Promise<ResearchResponse<RiskData>> {
  const empty = emptyRiskData();
  let serverDate = "";
  try {
    const context = getRepositoryContext(options);
    serverDate = context.system.serverDate;
    const batch = await findCurrentBatch(query, "risk", context.tradeDate);
    const early = initialState("risk", serverDate, batch, empty);
    if (early || !batch) return early!;

    const [snapshots, signals] = await Promise.all([
      query<RiskSnapshot>(SNAPSHOT_SQL, [batch.id]),
      query<RiskSignal>(SIGNALS_SQL, [batch.id]),
    ]);
    const rawSnapshot = snapshots[0] ?? null;
    const timeline = rawSnapshot ? decodeJsonArray(rawSnapshot.timeline) : null;
    const killConditions = rawSnapshot ? decodeJsonArray(rawSnapshot.killConditions) : null;
    const snapshot = rawSnapshot ? { ...rawSnapshot, timeline, killConditions } : null;
    const data: RiskData = { snapshot, signals };
    const signalCodes = signals.map((item) => typeof item.signalCode === "string" ? item.signalCode.trim() : "");
    const signalCodeSet = new Set(signalCodes);
    const invalidSignalIdentity = signals.length !== REQUIRED_SIGNAL_CODES.length ||
      signalCodeSet.size !== signals.length || signalCodes.some((code) => !code) ||
      signalCodes.some((code) => !REQUIRED_SIGNAL_CODES.includes(code as typeof REQUIRED_SIGNAL_CODES[number]));
    const missingFields = [
      ...(data.snapshot ? [] : ["risk.snapshot"]),
      ...(snapshot && timeline?.length !== 4 ? ["risk.snapshot.timeline"] : []),
      ...(snapshot && killConditions?.length !== 3 ? ["risk.snapshot.killConditions"] : []),
      ...(timeline ?? []).flatMap((item, index) =>
        isJsonObjectItem(item) ? [] : [`risk.snapshot.timeline.${index}`]),
      ...(killConditions ?? []).flatMap((item, index) =>
        isJsonObjectItem(item) ? [] : [`risk.snapshot.killConditions.${index}`]),
      ...(signals.length === REQUIRED_SIGNAL_CODES.length ? [] : ["risk.signals"]),
      ...(invalidSignalIdentity ? ["risk.signals.signalCode"] : []),
      ...REQUIRED_SIGNAL_CODES.filter((code) => !signalCodeSet.has(code)).map((code) => `risk.signals.${code}`),
    ];
    return response(serverDate, finalStatus(batch, missingFields), data, missingFields, batch);
  } catch (error) {
    if (!serverDate) serverDate = getRepositoryContext({ now: options.now }).system.serverDate;
    return errorResponse("risk", serverDate, empty, error);
  }
}
