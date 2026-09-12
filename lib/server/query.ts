import "server-only";

import type { ExecuteValues, RowDataPacket } from "mysql2";

import { executeVerifiedRead } from "./query-executor.ts";
import { getMysqlDatabaseName, getReadPool } from "./mysql.ts";
import { verifyReadTargets, type ReadTarget } from "./sql-guard.ts";

export { assertReadOnlySql } from "./sql-guard.ts";

const TABLE_TYPE_QUERY = `SELECT TABLE_TYPE
  FROM information_schema.TABLES
  WHERE TABLE_SCHEMA = ? AND TABLE_NAME = ?
  LIMIT 1`;

const objectTypeCache = new Map<string, Promise<string | undefined>>();

async function lookupObjectType(schema: string, table: string): Promise<string | undefined> {
  const key = `${schema.toLowerCase()}.${table.toLowerCase()}`;
  let lookup = objectTypeCache.get(key);
  if (!lookup) {
    lookup = getReadPool()
      .execute<(RowDataPacket & { TABLE_TYPE: string })[]>(TABLE_TYPE_QUERY, [schema, table])
      .then(([rows]) => rows[0]?.TABLE_TYPE);
    objectTypeCache.set(key, lookup);
  }
  return lookup;
}

async function verifyTargets(targets: readonly ReadTarget[]): Promise<void> {
  await verifyReadTargets(targets, getMysqlDatabaseName(), lookupObjectType);
}

export async function queryRows<T>(sql: string, params: readonly ExecuteValues[] = []): Promise<T[]> {
  return executeVerifiedRead<T>(sql, params, {
    verify: verifyTargets,
    execute: async (verifiedSql, verifiedParams) => {
      const [rows] = await getReadPool().execute(verifiedSql, [...verifiedParams] as ExecuteValues[]);
      return rows as unknown as T[];
    },
  });
}
