import type { ResearchResponse } from "../../research/contracts.ts";
import {
  defaultQueryRows,
  decodeJsonArray,
  decodeJsonObject,
  errorResponse,
  finalStatus,
  findCurrentBatch,
  getRepositoryContext,
  initialState,
  response,
  type QueryRows,
  type RepositoryOptions,
} from "./repository-helpers.ts";

export type StrategyDefinition = Record<string, unknown> & {
  id: number;
  strategyCode: "momentum-gap-volume";
  rules: unknown;
};
export type StrategyRun = Record<string, unknown> & {
  id: number;
  strategyDefinitionId: number;
  officialCandidateCount: number | null;
  nearCandidateCount: number | null;
};
export type StrategyFunnel = Record<string, unknown> & {
  stepCode: string;
  passedCount: number;
  sortOrder: number;
};
export type StrategyCandidate = Record<string, unknown> & {
  id: number;
  candidateType: "official" | "near";
  tsCode: string | null;
  evidence: unknown;
};
export type StrategyData = {
  definition: StrategyDefinition | null;
  run: StrategyRun | null;
  funnel: StrategyFunnel[];
  candidates: StrategyCandidate[];
};

export const emptyStrategyData = (): StrategyData => ({ definition: null, run: null, funnel: [], candidates: [] });

const RUN_SQL = `SELECT
  id, strategy_definition_id AS strategyDefinitionId, trade_date AS tradeDate, run_status AS runStatus,
  market_sample_count AS marketSampleCount, official_candidate_count AS officialCandidateCount,
  near_candidate_count AS nearCandidateCount, runtime_ms AS runtimeMs, started_at AS startedAt,
  completed_at AS completedAt, source_name AS sourceName, source_url AS sourceUrl,
  source_published_at AS sourcePublishedAt, data_as_of AS dataAsOf
FROM strategy_run
WHERE research_batch_id = ?
LIMIT 1`;

const DEFINITION_SQL = `SELECT
  id, strategy_code AS strategyCode, version, name, description, is_enabled AS isEnabled,
  rules_json AS rules, effective_from AS effectiveFrom, effective_to AS effectiveTo,
  source_name AS sourceName, source_url AS sourceUrl, source_published_at AS sourcePublishedAt,
  data_as_of AS dataAsOf
FROM strategy_definition
WHERE id = ? AND strategy_code = ?
LIMIT 1`;

const FUNNEL_SQL = `SELECT
  step_code AS stepCode, step_name AS stepName, passed_count AS passedCount, sort_order AS sortOrder,
  source_name AS sourceName, source_url AS sourceUrl, source_published_at AS sourcePublishedAt,
  data_as_of AS dataAsOf
FROM strategy_funnel_result
WHERE strategy_run_id = ?
ORDER BY sort_order, id`;

const CANDIDATES_SQL = `SELECT
  candidate.id, candidate.candidate_type AS candidateType, candidate.rank_no AS rankNo,
  candidate.match_score AS matchScore, candidate.close_price AS closePrice,
  candidate.change_rate_pct AS changeRatePct, candidate.gap_rate_pct AS gapRatePct,
  candidate.volume_ratio AS volumeRatio, candidate.setup_label AS setupLabel,
  candidate.reason_text AS reasonText, candidate.evidence_json AS evidence,
  stock.ts_code AS tsCode, stock.name, stock.market, stock.board, stock.industry,
  candidate.source_name AS sourceName, candidate.source_url AS sourceUrl,
  candidate.source_published_at AS sourcePublishedAt, candidate.data_as_of AS dataAsOf
FROM strategy_candidate AS candidate
JOIN stock_basic AS stock ON stock.id = candidate.stock_id
WHERE candidate.strategy_run_id = ?
ORDER BY candidate.candidate_type, candidate.rank_no, candidate.match_score DESC, candidate.id`;

export async function getStrategyResearch(
  query: QueryRows = defaultQueryRows,
  options: RepositoryOptions = {},
): Promise<ResearchResponse<StrategyData>> {
  const empty = emptyStrategyData();
  let serverDate = "";
  try {
    const context = getRepositoryContext(options);
    serverDate = context.system.serverDate;
    const batch = await findCurrentBatch(query, "strategy", context.tradeDate);
    const early = initialState("strategy", serverDate, batch, empty);
    if (early || !batch) return early!;

    const run = (await query<StrategyRun>(RUN_SQL, [batch.id]))[0] ?? null;
    if (!run) {
      const missingFields = ["strategy.run"];
      return response(serverDate, "partial", empty, missingFields, batch);
    }

    const [definitions, funnel, candidates] = await Promise.all([
      query<StrategyDefinition>(DEFINITION_SQL, [run.strategyDefinitionId, "momentum-gap-volume"]),
      query<StrategyFunnel>(FUNNEL_SQL, [run.id]),
      query<StrategyCandidate>(CANDIDATES_SQL, [run.id]),
    ]);
    const rawDefinition = definitions[0] ?? null;
    const rules = rawDefinition ? decodeJsonObject(rawDefinition.rules) : null;
    const definition = rawDefinition ? { ...rawDefinition, rules } : null;
    const normalizedCandidates = candidates.map((candidate) => ({
      ...candidate,
      evidence: decodeJsonArray(candidate.evidence),
    }));
    const data: StrategyData = { definition, run, funnel, candidates: normalizedCandidates };
    const expectedCandidates = (run.officialCandidateCount ?? 0) + (run.nearCandidateCount ?? 0);
    const funnelCodes = funnel.map((step) => typeof step.stepCode === "string" ? step.stepCode.trim() : "");
    const funnelOrders = funnel.map((step) => String(step.sortOrder ?? ""));
    const candidateIds = normalizedCandidates.map((candidate) => String(candidate.id ?? ""));
    const candidateCodes = normalizedCandidates.map((candidate) => String(candidate.tsCode ?? "").trim());
    const missingFields = [
      ...(data.definition ? [] : ["strategy.definition"]),
      ...(definition && !rules ? ["strategy.definition.rules"] : []),
      ...(funnel.length >= 5 ? [] : ["strategy.funnel.positions"]),
      ...(funnelCodes.some((code) => !code) || new Set(funnelCodes).size !== funnelCodes.length
        ? ["strategy.funnel.stepCode"] : []),
      ...(funnelOrders.some((order) => !order) || new Set(funnelOrders).size !== funnelOrders.length
        ? ["strategy.funnel.sortOrder"] : []),
      ...(normalizedCandidates.length >= expectedCandidates ? [] : ["strategy.candidates"]),
      ...(new Set(candidateIds).size !== candidateIds.length || candidateCodes.some((code) => !code) ||
        new Set(candidateCodes).size !== candidateCodes.length ? ["strategy.candidates.identity"] : []),
      ...normalizedCandidates
        .filter((candidate) => !candidate.evidence)
        .map((candidate) => `strategy.candidates.${candidate.id}.evidence`),
    ];
    return response(serverDate, finalStatus(batch, missingFields), data, missingFields, batch);
  } catch (error) {
    if (!serverDate) serverDate = getRepositoryContext({ now: options.now }).system.serverDate;
    return errorResponse("strategy", serverDate, empty, error);
  }
}
