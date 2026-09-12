import { createResearchGet } from "../route-helpers.ts";
import { emptyIpoData, getIpoResearch, type IpoData } from "../../../../lib/server/repositories/ipo.ts";
import type { RepositoryOptions } from "../../../../lib/server/repositories/repository-helpers.ts";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Loader = (options: RepositoryOptions) => ReturnType<typeof getIpoResearch>;

export function createGet(loader: Loader = (options) => getIpoResearch(undefined, options)) {
  return createResearchGet<IpoData>("ipo", emptyIpoData, loader);
}

export const GET = createGet();
