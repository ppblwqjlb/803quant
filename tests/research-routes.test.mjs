import assert from "node:assert/strict";
import test from "node:test";

import { createGet as createIpoGet, dynamic as ipoDynamic, runtime as ipoRuntime } from "../app/api/research/ipo/route.ts";
import { createGet as createRiskGet, dynamic as riskDynamic, runtime as riskRuntime } from "../app/api/research/risk/route.ts";
import { createGet as createStrategyGet, dynamic as strategyDynamic, runtime as strategyRuntime } from "../app/api/research/strategy/route.ts";
import { createGet as createTodayGet, dynamic as todayDynamic, runtime as todayRuntime } from "../app/api/research/today/route.ts";
import { getRiskResearch } from "../lib/server/repositories/risk.ts";
import { executeVerifiedRead } from "../lib/server/query-executor.ts";
import { verifyReadTargets } from "../lib/server/sql-guard.ts";

function response(status, data = {}) {
  return {
    serverDate: "2026-08-17",
    timezone: "Asia/Shanghai",
    status,
    batchId: null,
    dataAsOf: null,
    missingFields: [],
    data,
  };
}

test("research routes use the Node runtime, stay dynamic, and disable caching", async () => {
  const factories = [createTodayGet, createRiskGet, createStrategyGet, createIpoGet];

  for (const value of [todayRuntime, riskRuntime, strategyRuntime, ipoRuntime]) assert.equal(value, "nodejs");
  for (const value of [todayDynamic, riskDynamic, strategyDynamic, ipoDynamic]) assert.equal(value, "force-dynamic");
  for (const factory of factories) {
    const route = factory(async () => response("missing"));
    const result = await route(new Request("http://localhost/api/research/module"));
    assert.equal(result.status, 200);
    assert.equal(result.headers.get("Cache-Control"), "no-store, max-age=0");
    assert.equal((await result.json()).status, "missing");
  }
});

test("failed repository results return 503 and do not leak sensitive errors", async () => {
  const route = createRiskGet(async () => response("failed", { snapshot: null, signals: [] }));
  const result = await route(new Request("http://localhost/api/research/risk"));
  const body = await result.text();

  assert.equal(result.status, 503);
  assert.doesNotMatch(body, /MYSQL_|password|host|raw driver/i);
});

test("route forwards an explicit valid tradeDate to its repository", async () => {
  let received;
  const route = createTodayGet(async (options) => {
    received = options;
    return response("ready", { snapshot: null, intelItems: [], events: [] });
  });
  const result = await route(new Request("http://localhost/api/research/today?tradeDate=2026-08-15"));

  assert.equal(result.status, 200);
  assert.deepEqual(received, { tradeDate: "2026-08-15" });
});

test("route rejects malformed tradeDate without calling the repository", async () => {
  let called = false;
  const route = createStrategyGet(async () => {
    called = true;
    return response("ready");
  });
  const result = await route(new Request("http://localhost/api/research/strategy?tradeDate=not-a-date"));

  assert.equal(result.status, 400);
  assert.equal(called, false);
  assert.equal(result.headers.get("Cache-Control"), "no-store, max-age=0");
  assert.deepEqual(await result.json(), { error: "Invalid tradeDate" });
});

test("pending and partial repository results remain successful HTTP responses", async () => {
  for (const status of ["pending", "partial", "ready"]) {
    const route = createIpoGet(async () => response(status));
    const result = await route(new Request("http://localhost/api/research/ipo"));
    assert.equal(result.status, 200);
  }
});

test("an approved table missing at verification reaches the route as missing HTTP 200", async () => {
  let executed = false;
  const boundaryQuery = (sql, params = []) => executeVerifiedRead(sql, params, {
    verify: (targets) => verifyReadTargets(targets, "A_stock", async () => undefined),
    execute: async () => {
      executed = true;
      return [];
    },
  });
  const route = createRiskGet((options) => getRiskResearch(boundaryQuery, options));
  const result = await route(new Request("http://localhost/api/research/risk?tradeDate=2026-08-17"));
  const body = await result.json();

  assert.equal(executed, false);
  assert.equal(result.status, 200);
  assert.equal(body.status, "missing");
  assert.doesNotMatch(JSON.stringify(body), /research_batch|A_stock|host|password/i);
});
