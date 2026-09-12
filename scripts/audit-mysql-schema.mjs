import { getReadPool } from "../lib/server/mysql.ts";
import { queryRows } from "../lib/server/query.ts";

const SYSTEM_SCHEMAS = ["information_schema", "mysql", "performance_schema", "sys"];
const placeholders = SYSTEM_SCHEMAS.map(() => "?").join(", ");

const pool = getReadPool();
let auditFailed = false;

try {
  const tables = await queryRows(
    `SELECT TABLE_SCHEMA, TABLE_NAME, TABLE_TYPE, ENGINE, TABLE_ROWS
     FROM information_schema.TABLES
     WHERE TABLE_SCHEMA NOT IN (${placeholders})
     ORDER BY TABLE_SCHEMA, TABLE_NAME`,
    SYSTEM_SCHEMAS,
  );

  const columns = await queryRows(
    `SELECT TABLE_SCHEMA, TABLE_NAME, ORDINAL_POSITION, COLUMN_NAME, COLUMN_TYPE, IS_NULLABLE, COLUMN_KEY
     FROM information_schema.COLUMNS
     WHERE TABLE_SCHEMA NOT IN (${placeholders})
     ORDER BY TABLE_SCHEMA, TABLE_NAME, ORDINAL_POSITION`,
    SYSTEM_SCHEMAS,
  );

  const indexes = await queryRows(
    `SELECT TABLE_SCHEMA, TABLE_NAME, INDEX_NAME, NON_UNIQUE, SEQ_IN_INDEX, COLUMN_NAME
     FROM information_schema.STATISTICS
     WHERE TABLE_SCHEMA NOT IN (${placeholders})
     ORDER BY TABLE_SCHEMA, TABLE_NAME, INDEX_NAME, SEQ_IN_INDEX`,
    SYSTEM_SCHEMAS,
  );

  console.log("Read-only MySQL schema inventory");
  console.table(tables);
  console.log("Columns");
  console.table(columns);
  console.log("Indexes");
  console.table(indexes);
  console.log(
    "Reuse recommendation: retain compatible market-data tables and indexes; add application-owned research tables only through a separately reviewed migration.",
  );
} catch (error) {
  auditFailed = true;
  throw error;
} finally {
  try {
    await pool.end();
  } catch (error) {
    if (!auditFailed) throw error;
  }
}
