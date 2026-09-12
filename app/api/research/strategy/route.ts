import { createResearchGet } from "../route-helpers.ts";
import { emptyStrategyData, getStrategyResearch, type StrategyData } from "../../../../lib/server/repositories/strategy.ts";
import type { RepositoryOptions } from "../../../../lib/server/repositories/repository-helpers.ts";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Loader = (options: RepositoryOptions) => ReturnType<typeof getStrategyResearch>;

export function createGet(loader: Loader = (options) => getStrategyResearch(undefined, options)) {
  return createResearchGet<StrategyData>("strategy", emptyStrategyData, loader);
}

export const GET = createGet();
