export type ResearchStatus = "ready" | "pending" | "partial" | "missing" | "failed";

export type ResearchResponse<T> = {
  serverDate: string;
  timezone: "Asia/Shanghai";
  status: ResearchStatus;
  batchId: string | null;
  dataAsOf: string | null;
  missingFields: string[];
  data: T;
};

export function displayValue(value: unknown): string {
  return value === null || value === undefined || value === "" ? "XX" : String(value);
}
