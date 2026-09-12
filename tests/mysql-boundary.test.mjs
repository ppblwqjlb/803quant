import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { readFile } from "node:fs/promises";
import test from "node:test";

import {
  ApprovedBaseTableMissingError,
  analyzeReadOnlySql,
  assertReadOnlySql,
  verifyReadTargets,
} from "../lib/server/sql-guard.ts";
import { executeVerifiedRead } from "../lib/server/query-executor.ts";

test("read-only guard accepts supported query forms", () => {
  const queries = [
    "SELECT * FROM information_schema.TABLES",
    "SHOW TABLES",
    "DESCRIBE daily",
    "EXPLAIN SELECT * FROM daily",
    "WITH recent AS (SELECT * FROM daily) SELECT * FROM recent",
    "SELECT 'DELETE is text, not SQL' AS example",
    "SELECT COUNT(*), COALESCE(MAX(close), 0) FROM daily",
    "SHOW CREATE TABLE daily",
    "SHOW TABLE STATUS",
    "SHOW TABLES FROM A_stock",
    "SHOW TABLES IN A_stock LIKE 'daily'",
    "SHOW TABLE STATUS LIKE 'daily'",
    "WITH latest(batch_id) AS (SELECT batch_id FROM research_batch) SELECT batch_id FROM latest",
    "SELECT t.update FROM daily AS t",
    "SELECT * FROM daily WHERE ts_code IN (SELECT ts_code FROM daily_basic)",
    "SELECT derived.ts_code FROM (SELECT ts_code FROM daily) AS derived",
    "SELECT TRIM(BOTH 'x' FROM ts_code) FROM daily",
    "SELECT * FROM (WITH nested AS (SELECT * FROM daily) SELECT * FROM nested) AS derived",
  ];

  for (const sql of queries) {
    assert.doesNotThrow(() => assertReadOnlySql(sql), sql);
  }
});

test("read-only guard rejects mutation statements", () => {
  const mutations = [
    "CREATE TABLE forbidden(id int)",
    "UPDATE daily SET close = 0",
    "DELETE FROM daily",
    "INSERT INTO daily(ts_code) VALUES ('x')",
    "DROP TABLE daily",
    "CALL refresh_daily()",
  ];

  for (const sql of mutations) {
    assert.throws(() => assertReadOnlySql(sql), /read-only/i, sql);
  }
});

test("read-only guard rejects stacked statements and comments", () => {
  const bypasses = [
    "SELECT 1; DELETE FROM daily",
    "SELECT 1;",
    "SELECT 1 -- comment",
    "SELECT 1 # comment",
    "SELECT 1 /* comment */",
    "SELECT 1 /*!50000 INTO OUTFILE '/tmp/leak' */",
  ];

  for (const sql of bypasses) {
    assert.throws(() => assertReadOnlySql(sql), /read-only/i, sql);
  }
});

test("read-only guard rejects CTE mutation and write-capable SELECT forms", () => {
  const bypasses = [
    "WITH rows AS (SELECT * FROM daily) UPDATE daily SET close = 0",
    "WITH rows AS (DELETE FROM daily RETURNING *) SELECT * FROM rows",
    "SELECT * FROM daily INTO OUTFILE '/tmp/daily.csv'",
    "SELECT * FROM daily INTO DUMPFILE '/tmp/daily.bin'",
    "SELECT * FROM daily FOR UPDATE",
    "SELECT * FROM daily FOR SHARE",
  ];

  for (const sql of bypasses) {
    assert.throws(() => assertReadOnlySql(sql), /read-only/i, sql);
  }
});

test("read-only guard rejects non-allowlisted and session-state functions", () => {
  const functions = [
    "SELECT mutating_stored_function()",
    "SELECT GET_LOCK('audit', 3600)",
    "SELECT RELEASE_LOCK('audit')",
    "WITH rows AS (SELECT * FROM daily) SELECT mutating_stored_function() FROM rows",
    "SELECT mutating_stored_function ()",
    "SELECT mutating_function1()",
    "SELECT mutating$function()",
    "SELECT 变更函数()",
    "SELECT `mutating_function`()",
    "SELECT app.mutating_function()",
    "SELECT app.in()",
    "SELECT ABS ()",
    "SELECT COUNT (*) FROM daily",
  ];

  for (const sql of functions) {
    assert.throws(() => assertReadOnlySql(sql), /read-only/i, sql);
  }
});

test("analyzer extracts every physical FROM and JOIN target but not CTE aliases", () => {
  const targets = analyzeReadOnlySql(
    `WITH latest(batch_id) AS (
       SELECT batch_id FROM research_batch
     )
     SELECT latest.batch_id
     FROM latest
     JOIN strategy_candidate AS candidate ON candidate.batch_id = latest.batch_id,
          daily AS prices`,
  );

  assert.deepEqual(
    targets.map(({ schema, table }) => [schema, table]),
    [
      [undefined, "research_batch"],
      [undefined, "strategy_candidate"],
      [undefined, "daily"],
    ],
  );
});

test("analyzer rejects unapproved physical targets", () => {
  const bypasses = [
    "SELECT * FROM side_effect_view",
    "SELECT * FROM daily STRAIGHT_JOIN side_effect_view ON 1 = 1",
    "SELECT * FROM daily AS `where` JOIN side_effect_view ON 1 = 1",
    "SELECT * FROM daily JOIN daily_basic ON 'where' = 'where' JOIN side_effect_view ON 1 = 1",
    "SELECT * FROM Daily",
    "SELECT * FROM `Daily`",
  ];

  for (const sql of bypasses) {
    assert.throws(() => analyzeReadOnlySql(sql), /read-only/i, sql);
  }
});

test("analyzer rejects unsupported parenthesized table-reference groups", () => {
  assert.throws(
    () => analyzeReadOnlySql("SELECT * FROM (side_effect_view JOIN daily ON 1 = 1)"),
    /read-only/i,
  );
});

test("analyzer rejects TABLE query blocks in every supported set-operation context", () => {
  const bypasses = [
    "SELECT 1 UNION TABLE side_effect_view",
    "SELECT 1 INTERSECT TABLE `side_effect_view`",
    "SELECT 1 EXCEPT TABLE archive.side_effect_view",
    "SELECT 1 UNION TABLE Daily",
    "SELECT 1 UNION TABLE `Daily`",
    "SELECT 1 UNION TABLE daily",
    "WITH seed AS (SELECT 1) SELECT * FROM seed UNION TABLE daily",
  ];

  for (const sql of bypasses) {
    assert.throws(() => analyzeReadOnlySql(sql), /read-only/i, sql);
  }
});

test("analyzer rejects SHOW expressions and TABLE query-block subqueries", () => {
  const bypasses = [
    "SHOW TABLES WHERE EXISTS (TABLE side_effect_view)",
    "SHOW TABLES WHERE EXISTS (TABLE `side_effect_view`)",
    "SHOW TABLES WHERE EXISTS (TABLE archive.side_effect_view)",
    "SHOW TABLES WHERE EXISTS ((TABLE side_effect_view))",
    "SHOW TABLES WHERE EXISTS (TABLE Daily)",
    "SHOW TABLE STATUS WHERE TABLE_NAME = 'daily'",
    "SHOW COLUMNS FROM daily",
    "SHOW CREATE VIEW side_effect_view",
  ];

  for (const sql of bypasses) {
    assert.throws(() => analyzeReadOnlySql(sql), /read-only/i, sql);
  }
});

test("SHOW CREATE TABLE emits an application base-table verification target", () => {
  assert.deepEqual(analyzeReadOnlySql("SHOW CREATE TABLE daily"), [
    { schema: undefined, table: "daily", metadata: false },
  ]);
});

test("base-table verification rejects views and unknown objects", async () => {
  const target = analyzeReadOnlySql("SELECT * FROM daily");

  await assert.rejects(
    verifyReadTargets(target, "A_stock", async () => "VIEW"),
    /read-only/i,
  );
  await assert.rejects(
    verifyReadTargets(target, "A_stock", async () => undefined),
    /read-only/i,
  );
});

test("base-table verification accepts only the configured application schema", async () => {
  const qualified = analyzeReadOnlySql("SELECT * FROM A_stock.daily");
  const otherSchema = analyzeReadOnlySql("SELECT * FROM archive.daily");

  await assert.doesNotReject(
    verifyReadTargets(qualified, "A_stock", async () => "BASE TABLE"),
  );
  await assert.rejects(
    verifyReadTargets(otherSchema, "A_stock", async () => "BASE TABLE"),
    /read-only/i,
  );
});

test("metadata exceptions bypass base-table lookup and remain narrowly scoped", async () => {
  const targets = analyzeReadOnlySql(
    "SELECT * FROM information_schema.TABLES JOIN information_schema.COLUMNS USING (TABLE_SCHEMA, TABLE_NAME)",
  );
  let lookups = 0;

  await verifyReadTargets(targets, "A_stock", async () => {
    lookups += 1;
    return "VIEW";
  });

  assert.equal(lookups, 0);
  assert.throws(
    () => analyzeReadOnlySql("SELECT * FROM information_schema.VIEWS"),
    /read-only/i,
  );
});

test("verified execution checks object type before running the application query", async () => {
  let executed = false;

  await assert.rejects(
    executeVerifiedRead("SELECT * FROM daily", [], {
      verify: async () => {
        throw new Error("SQL rejected by read-only base-table guard");
      },
      execute: async () => {
        executed = true;
        return [];
      },
    }),
    /read-only/i,
  );

  assert.equal(executed, false);
});

test("verified execution reports an approved but absent base table with a sanitized typed error", async () => {
  let executed = false;
  const operation = executeVerifiedRead("SELECT * FROM research_batch", [], {
    verify: (targets) => verifyReadTargets(targets, "A_stock", async () => undefined),
    execute: async () => {
      executed = true;
      return [];
    },
  });

  await assert.rejects(operation, (error) => {
    assert.ok(error instanceof ApprovedBaseTableMissingError);
    assert.equal(error.code, "APPROVED_BASE_TABLE_MISSING");
    assert.match(error.message, /read-only/i);
    assert.doesNotMatch(error.message, /research_batch|A_stock|host|password/i);
    return true;
  });
  assert.equal(executed, false);
});

test("views remain rejected and are not classified as missing approved tables", async () => {
  await assert.rejects(
    verifyReadTargets(
      analyzeReadOnlySql("SELECT * FROM research_batch"),
      "A_stock",
      async () => "VIEW",
    ),
    (error) => {
      assert.equal(error instanceof ApprovedBaseTableMissingError, false);
      assert.match(error.message, /read-only/i);
      return true;
    },
  );
});

test("read-only guard rejects session variable assignment", () => {
  assert.throws(() => assertReadOnlySql("SELECT @session_state := 1"), /read-only/i);
});

test("read-only guard fails closed on empty and unsupported input", () => {
  const unsupported = ["", "   ", "SET @x = 1", "EXPLAIN UPDATE daily SET close = 0"];

  for (const sql of unsupported) {
    assert.throws(() => assertReadOnlySql(sql), /read-only/i, sql);
  }
});

test("database modules enforce the server-only import boundary", () => {
  const result = spawnSync(
    process.execPath,
    ["--input-type=module", "--eval", "await import('./lib/server/mysql.ts')"],
    { cwd: process.cwd(), encoding: "utf8" },
  );

  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /Client Component module/i);
});

test("database configuration rejects out-of-range ports and pool sizes", () => {
  const baseEnv = {
    ...process.env,
    MYSQL_HOST: "127.0.0.1",
    MYSQL_DATABASE: "test_schema",
    MYSQL_USER: "read_user",
    MYSQL_PASSWORD: "test-only-placeholder",
  };
  const cases = [
    { name: "MYSQL_PORT", value: "65536", pattern: /1 to 65535/ },
    { name: "MYSQL_CONNECTION_LIMIT", value: "21", pattern: /1 to 20/ },
  ];

  for (const invalid of cases) {
    const result = spawnSync(
      process.execPath,
      [
        "--conditions=react-server",
        "--input-type=module",
        "--eval",
        "const { getReadPool } = await import('./lib/server/mysql.ts'); getReadPool();",
      ],
      { cwd: process.cwd(), encoding: "utf8", env: { ...baseEnv, [invalid.name]: invalid.value } },
    );

    assert.notEqual(result.status, 0, invalid.name);
    assert.match(result.stderr, invalid.pattern, invalid.name);
  }
});

test("MySQL driver returns DATE values as strings to preserve their database calendar day", async () => {
  const source = await readFile(new URL("../lib/server/mysql.ts", import.meta.url), "utf8");
  assert.match(source, /dateStrings:\s*true/);
});
