import type { ResearchResponse } from "../../research/contracts.ts";
import {
  defaultQueryRows,
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

export type IpoCompany = Record<string, unknown> & { id: number; companyCode: string; name: string };
export type IpoStage = Record<string, unknown> & { id: number; ipoCompanyId: number; stageCode: string; sortOrder: number };
export type IpoMetric = Record<string, unknown> & { id: number; ipoCompanyId: number; snapshotKind: string; metrics: unknown };
export type IpoSubscription = Record<string, unknown> & { id: number; ipoCompanyId: number; analysisType: string };
export type IpoValuation = Record<string, unknown> & { id: number; ipoCompanyId: number; scenarioCode: string };
export type IpoData = {
  companies: IpoCompany[];
  stages: IpoStage[];
  metrics: IpoMetric[];
  subscriptions: IpoSubscription[];
  valuations: IpoValuation[];
};

export const emptyIpoData = (): IpoData => ({ companies: [], stages: [], metrics: [], subscriptions: [], valuations: [] });

function hasIdentityComponent(value: unknown): boolean {
  if (value === null || value === undefined) return false;
  if (typeof value === "string") return value.trim().length > 0;
  if (typeof value === "number") return Number.isFinite(value);
  return typeof value === "bigint";
}

function hasDuplicates(values: readonly unknown[]): boolean {
  const normalized = values.map((value) => String(value).trim());
  return new Set(normalized).size !== normalized.length;
}

function rowMarker(row: Record<string, unknown>, index: number): string {
  return hasIdentityComponent(row.id) ? String(row.id) : String(index);
}

const COMPANIES_SQL = `SELECT
  id, company_code AS companyCode, name, full_name AS fullName, exchange, board, industry, ts_code AS tsCode,
  current_status AS currentStatus, summary, core_product AS coreProduct, research_focus AS researchFocus,
  demand_drivers AS demandDrivers, source_name AS sourceName, source_url AS sourceUrl,
  source_published_at AS sourcePublishedAt, data_as_of AS dataAsOf
FROM ipo_company
WHERE data_as_of <= ?
ORDER BY id`;

const STAGES_SQL = `SELECT
  event.id, event.ipo_company_id AS ipoCompanyId, event.stage_code AS stageCode,
  event.stage_name AS stageName, event.event_date AS eventDate, event.event_at AS eventAt,
  event.completion_status AS completionStatus, event.description, event.sort_order AS sortOrder,
  event.source_name AS sourceName, event.source_url AS sourceUrl,
  event.source_published_at AS sourcePublishedAt, event.data_as_of AS dataAsOf
FROM ipo_stage_event AS event
JOIN ipo_company AS company ON company.id = event.ipo_company_id
WHERE event.data_as_of <= ?
ORDER BY company.id, event.sort_order, event.id`;

const METRICS_SQL = `SELECT
  id, ipo_company_id AS ipoCompanyId, snapshot_kind AS snapshotKind, metrics_json AS metrics,
  source_name AS sourceName, source_url AS sourceUrl, source_published_at AS sourcePublishedAt,
  data_as_of AS dataAsOf
FROM ipo_metric_snapshot
WHERE research_batch_id = ?
ORDER BY ipo_company_id, snapshot_kind, id`;

const SUBSCRIPTIONS_SQL = `SELECT
  id, ipo_company_id AS ipoCompanyId, analysis_type AS analysisType, currency, issue_shares AS issueShares,
  fundraising_amount AS fundraisingAmount, issue_price AS issuePrice, single_lot_shares AS singleLotShares,
  single_lot_funds AS singleLotFunds, top_subscription_shares AS topSubscriptionShares,
  required_market_cap AS requiredMarketCap, allocation_number_count AS allocationNumberCount,
  winning_rate_pct AS winningRatePct, at_least_one_win_probability_pct AS atLeastOneWinProbabilityPct,
  calculation_basis AS calculationBasis, source_name AS sourceName, source_url AS sourceUrl,
  source_published_at AS sourcePublishedAt, data_as_of AS dataAsOf
FROM ipo_subscription_analysis
WHERE research_batch_id = ?
ORDER BY ipo_company_id, analysis_type, id`;

const VALUATIONS_SQL = `SELECT
  id, ipo_company_id AS ipoCompanyId, scenario_code AS scenarioCode, scenario_label AS scenarioLabel,
  currency, scenario_price AS scenarioPrice, floating_shares AS floatingShares, total_shares AS totalShares,
  floating_market_cap AS floatingMarketCap, total_market_cap AS totalMarketCap, is_official AS isOfficial,
  calculation_basis AS calculationBasis, source_name AS sourceName, source_url AS sourceUrl,
  source_published_at AS sourcePublishedAt, data_as_of AS dataAsOf
FROM ipo_valuation_scenario
WHERE research_batch_id = ?
ORDER BY ipo_company_id, scenario_price, floating_shares, id`;

export async function getIpoResearch(
  query: QueryRows = defaultQueryRows,
  options: RepositoryOptions = {},
): Promise<ResearchResponse<IpoData>> {
  const empty = emptyIpoData();
  let serverDate = "";
  try {
    const context = getRepositoryContext(options);
    serverDate = context.system.serverDate;
    const batch = await findCurrentBatch(query, "ipo", context.tradeDate);
    const early = initialState("ipo", serverDate, batch, empty);
    if (early || !batch) return early!;

    if (!batch.dataAsOf) {
      return response(serverDate, "partial", empty, ["ipo.dataAsOf"], batch);
    }
    const [companies, stages, metrics, subscriptions, valuations] = await Promise.all([
      query<IpoCompany>(COMPANIES_SQL, [batch.dataAsOf]),
      query<IpoStage>(STAGES_SQL, [batch.dataAsOf]),
      query<IpoMetric>(METRICS_SQL, [batch.id]),
      query<IpoSubscription>(SUBSCRIPTIONS_SQL, [batch.id]),
      query<IpoValuation>(VALUATIONS_SQL, [batch.id]),
    ]);
    const normalizedMetrics = metrics.map((metric) => ({ ...metric, metrics: decodeJsonObject(metric.metrics) }));
    const data: IpoData = { companies, stages, metrics: normalizedMetrics, subscriptions, valuations };
    const missingFields = (Object.entries(data) as [keyof IpoData, unknown[]][])
      .filter(([, rows]) => rows.length === 0)
      .map(([key]) => `ipo.${key}`);
    const companyIds = new Set(companies
      .filter((company) => hasIdentityComponent(company.id))
      .map((company) => String(company.id)));
    const validateComponents = <T extends Record<string, unknown>>(
      name: keyof IpoData,
      rows: readonly T[],
      components: readonly string[],
    ) => {
      rows.forEach((row, index) => {
        for (const component of components) {
          if (!hasIdentityComponent(row[component])) {
            missingFields.push(`ipo.${name}.${rowMarker(row, index)}.${component}`);
          }
        }
      });
    };
    validateComponents("companies", companies, ["id", "companyCode"]);
    validateComponents("stages", stages, ["ipoCompanyId", "stageCode", "sortOrder"]);
    validateComponents("metrics", normalizedMetrics, ["ipoCompanyId", "snapshotKind"]);
    validateComponents("subscriptions", subscriptions, ["ipoCompanyId", "analysisType"]);
    validateComponents("valuations", valuations, ["ipoCompanyId", "scenarioCode"]);

    const validCompanyIds = companies.filter((company) => hasIdentityComponent(company.id)).map((company) => company.id);
    const validCompanyCodes = companies
      .filter((company) => hasIdentityComponent(company.companyCode))
      .map((company) => company.companyCode);
    if (hasDuplicates(validCompanyIds)) missingFields.push("ipo.companies.id");
    if (hasDuplicates(validCompanyCodes)) missingFields.push("ipo.companies.companyCode");

    const validStages = stages.filter((stage) =>
      hasIdentityComponent(stage.ipoCompanyId) && hasIdentityComponent(stage.stageCode) &&
      hasIdentityComponent(stage.sortOrder));
    if (hasDuplicates(validStages.map((stage) => `${stage.ipoCompanyId}:${stage.stageCode}:${stage.sortOrder}`))) {
      missingFields.push("ipo.stages.identity");
    }
    const validMetrics = normalizedMetrics.filter((metric) =>
      hasIdentityComponent(metric.ipoCompanyId) && hasIdentityComponent(metric.snapshotKind));
    if (hasDuplicates(validMetrics.map((metric) => `${metric.ipoCompanyId}:${metric.snapshotKind}`))) {
      missingFields.push("ipo.metrics.identity");
    }
    const validSubscriptions = subscriptions.filter((item) =>
      hasIdentityComponent(item.ipoCompanyId) && hasIdentityComponent(item.analysisType));
    if (hasDuplicates(validSubscriptions.map((item) => `${item.ipoCompanyId}:${item.analysisType}`))) {
      missingFields.push("ipo.subscriptions.identity");
    }
    const validValuations = valuations.filter((item) =>
      hasIdentityComponent(item.ipoCompanyId) && hasIdentityComponent(item.scenarioCode));
    if (hasDuplicates(validValuations.map((item) => `${item.ipoCompanyId}:${item.scenarioCode}`))) {
      missingFields.push("ipo.valuations.identity");
    }
    for (const [name, rows] of [
      ["stages", stages],
      ["metrics", normalizedMetrics],
      ["subscriptions", subscriptions],
      ["valuations", valuations],
    ] as const) {
      if (rows.some((row) => hasIdentityComponent(row.ipoCompanyId) &&
        !companyIds.has(String(row.ipoCompanyId)))) missingFields.push(`ipo.${name}.company`);
    }
    const companyIdsWithStages = new Set(stages.map((stage) => String(stage.ipoCompanyId)));
    missingFields.push(...companies
      .filter((company) => !companyIdsWithStages.has(String(company.id)))
      .map((company) => `ipo.companies.${company.id}.stages`));
    missingFields.push(...normalizedMetrics
      .filter((metric) => !metric.metrics)
      .map((metric) => `ipo.metrics.${metric.id}.metrics`));
    return response(serverDate, finalStatus(batch, missingFields), data, missingFields, batch);
  } catch (error) {
    if (!serverDate) serverDate = getRepositoryContext({ now: options.now }).system.serverDate;
    return errorResponse("ipo", serverDate, empty, error);
  }
}
