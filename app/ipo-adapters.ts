import { displayValue } from "../lib/research/contracts";

export type IpoRow = Record<string, unknown>;
export type IpoResearchData = {
  companies: IpoRow[];
  stages: IpoRow[];
  metrics: IpoRow[];
  subscriptions: IpoRow[];
  valuations: IpoRow[];
};

export const emptyIpoResearchData = (): IpoResearchData => ({ companies: [], stages: [], metrics: [], subscriptions: [], valuations: [] });
export const ipoRecord = (item: unknown): IpoRow => item && typeof item === "object" && !Array.isArray(item) ? item as IpoRow : {};
export const ipoValue = (item: IpoRow | undefined, key: string) => displayValue(item?.[key]);
export const researchDisplayState = (status: string, count: number) => status === "ready" && count === 0 ? "empty" : status;
export const keepsAvailableResearchRows = (status: string) => status === "ready" || status === "partial";

const matchesCompany = (item: IpoRow, company: IpoRow) => String(item.ipoCompanyId) === String(company.id);
const metricValues = (item: IpoRow) => ipoRecord(item.metrics);

function isCommercialSpace(company: IpoRow, metrics: IpoRow[]) {
  const related = metrics.filter((item) => matchesCompany(item, company)).map(metricValues);
  return [company.industry, company.coreProduct, ...related.flatMap((item) => [item.category, item.industry, item.isCommercialSpace])]
    .some((item) => item === true || String(item ?? "").includes("航天"));
}

export function adaptIpoResearch(data: IpoResearchData) {
  const space = data.companies.filter((company) => isCommercialSpace(company, data.metrics));
  const nonSpace = data.companies.filter((company) => !space.includes(company));
  const primary = (nonSpace.length >= 2 ? nonSpace : data.companies).slice(0, 2);
  const commercialCompanies = space.length ? space : data.companies.filter((company) => !primary.includes(company));
  const stagesFor = (company: IpoRow) => data.stages.filter((item) => matchesCompany(item, company))
    .sort((left, right) => Number(left.sortOrder) - Number(right.sortOrder));
  const subscriptions = data.subscriptions.map((item) => ({ item, company: data.companies.find((company) => matchesCompany(item, company)) }));
  const valuationsFor = (company: IpoRow) => data.valuations.filter((item) => matchesCompany(item, company));
  const comparisonMetrics = data.metrics.filter((item) => String(item.snapshotKind).toLowerCase().includes("comparison"));
  const dimensions = [...new Set(comparisonMetrics.flatMap((item) => Object.keys(metricValues(item))))];
  const comparisonRows = dimensions.map((dimension) => [
    dimension,
    ...primary.map((company) => {
      const metric = comparisonMetrics.find((item) => matchesCompany(item, company));
      return displayValue(metricValues(metric ?? {})[dimension]);
    }),
  ]);
  return { primary, commercialCompanies, stagesFor, subscriptions, valuationsFor, comparisonRows };
}
