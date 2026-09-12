import { analyzeReadOnlySql, type ReadTarget } from "./sql-guard.ts";

type QueryDependencies<T> = {
  verify: (targets: readonly ReadTarget[]) => Promise<void>;
  execute: (sql: string, params: readonly unknown[]) => Promise<T[]>;
};

export async function executeVerifiedRead<T>(
  sql: string,
  params: readonly unknown[],
  dependencies: QueryDependencies<T>,
): Promise<T[]> {
  const targets = analyzeReadOnlySql(sql);
  await dependencies.verify(targets);
  return dependencies.execute(sql, params);
}
