import { createResearchGet } from "../route-helpers.ts";
import { emptyTodayData, getTodayResearch, type TodayData } from "../../../../lib/server/repositories/today.ts";
import type { RepositoryOptions } from "../../../../lib/server/repositories/repository-helpers.ts";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Loader = (options: RepositoryOptions) => ReturnType<typeof getTodayResearch>;

export function createGet(loader: Loader = (options) => getTodayResearch(undefined, options)) {
  return createResearchGet<TodayData>("today", emptyTodayData, loader);
}

export const GET = createGet();
