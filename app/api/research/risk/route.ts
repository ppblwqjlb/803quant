import { createResearchGet } from "../route-helpers.ts";
import { emptyRiskData, getRiskResearch, type RiskData } from "../../../../lib/server/repositories/risk.ts";
import type { RepositoryOptions } from "../../../../lib/server/repositories/repository-helpers.ts";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Loader = (options: RepositoryOptions) => ReturnType<typeof getRiskResearch>;

export function createGet(loader: Loader = (options) => getRiskResearch(undefined, options)) {
  return createResearchGet<RiskData>("risk", emptyRiskData, loader);
}

export const GET = createGet();
