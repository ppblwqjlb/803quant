import "server-only";

import mysql, { type Pool, type PoolOptions } from "mysql2/promise";

let readPool: Pool | undefined;

function requireEnv(name: string, preserveWhitespace = false): string {
  const rawValue = process.env[name];
  if (!rawValue?.trim()) {
    throw new Error(`Missing required database environment variable: ${name}`);
  }
  return preserveWhitespace ? rawValue : rawValue.trim();
}

function boundedIntegerEnv(name: string, fallback: number, maximum: number): number {
  const rawValue = process.env[name]?.trim();
  const value = rawValue ? Number(rawValue) : fallback;
  if (!Number.isSafeInteger(value) || value < 1 || value > maximum) {
    throw new Error(`${name} must be an integer from 1 to ${maximum}`);
  }
  return value;
}

export function getMysqlDatabaseName(): string {
  return requireEnv("MYSQL_DATABASE");
}

export function getReadPool(): Pool {
  if (readPool) {
    return readPool;
  }

  const options: PoolOptions = {
    host: requireEnv("MYSQL_HOST"),
    port: boundedIntegerEnv("MYSQL_PORT", 3306, 65_535),
    database: getMysqlDatabaseName(),
    user: requireEnv("MYSQL_USER"),
    password: requireEnv("MYSQL_PASSWORD", true),
    connectionLimit: boundedIntegerEnv("MYSQL_CONNECTION_LIMIT", 5, 20),
    decimalNumbers: true,
    dateStrings: true,
    timezone: "+08:00",
    multipleStatements: false,
    enableKeepAlive: true,
  };

  readPool = mysql.createPool(options);
  return readPool;
}
