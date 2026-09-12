import { NextResponse } from "next/server";

import type { ResearchResponse } from "../../../lib/research/contracts.ts";
import type { RepositoryOptions, ResearchModule } from "../../../lib/server/repositories/repository-helpers.ts";
import { getSystemContext } from "../../../lib/server/system-context.ts";

type Loader<T> = (options: RepositoryOptions) => Promise<ResearchResponse<T>>;

const NO_STORE_HEADERS = { "Cache-Control": "no-store, max-age=0" };

function tradeDateFrom(request: Request): string | undefined | null {
  const value = new URL(request.url).searchParams.get("tradeDate");
  if (value === null) return undefined;
  if (!/^\d{4}-\d{2}-\d{2}$/u.test(value)) return null;
  const [year, month, day] = value.split("-").map(Number);
  const parsed = new Date(Date.UTC(year, month - 1, day));
  return parsed.getUTCFullYear() === year && parsed.getUTCMonth() === month - 1 && parsed.getUTCDate() === day
    ? value
    : null;
}

export function createResearchGet<T>(
  module: ResearchModule,
  emptyData: () => T,
  loader: Loader<T>,
) {
  return async function GET(request: Request): Promise<NextResponse> {
    const tradeDate = tradeDateFrom(request);
    if (tradeDate === null) {
      return NextResponse.json({ error: "Invalid tradeDate" }, { status: 400, headers: NO_STORE_HEADERS });
    }

    try {
      const result = await loader(tradeDate ? { tradeDate } : {});
      return NextResponse.json(result, {
        status: result.status === "failed" ? 503 : 200,
        headers: NO_STORE_HEADERS,
      });
    } catch {
      const system = getSystemContext();
      return NextResponse.json({
        serverDate: system.serverDate,
        timezone: system.timezone,
        status: "failed",
        batchId: null,
        dataAsOf: null,
        missingFields: [`${module}.query`],
        data: emptyData(),
      }, { status: 503, headers: NO_STORE_HEADERS });
    }
  };
}
