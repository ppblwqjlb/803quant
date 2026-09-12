import assert from "node:assert/strict";
import test from "node:test";

import { getIpoResearch } from "../lib/server/repositories/ipo.ts";
import { getRiskResearch } from "../lib/server/repositories/risk.ts";
import { getStrategyResearch } from "../lib/server/repositories/strategy.ts";
import { getTodayResearch } from "../lib/server/repositories/today.ts";
import { assertReadOnlySql } from "../lib/server/sql-guard.ts";
import { verifyReadTargets } from "../lib/server/sql-guard.ts";
import { executeVerifiedRead } from "../lib/server/query-executor.ts";

const NOW = new Date("2026-08-17T04:00:00.000Z");

function batch(module, overrides = {}) {
  return {
    id: 7,
    batchId: `${module}-20260817-01`,
    module,
    tradeDate: "2026-08-17",
    batchStatus: "success",
    dataAsOf: "2026-08-17 16:10:00.000",
    ...overrides,
  };
}

function guardedQuery(handler) {
  return async (sql, params) => {
    assertReadOnlySql(sql);
    return handler(sql, params);
  };
}

test("strategy repository returns a stable missing response when no current-date batch exists", async () => {
  const seenParams = [];
  const result = await getStrategyResearch(async (_sql, params) => {
    seenParams.push(params);
    return [];
  }, { now: NOW });

  assert.equal(result.serverDate, "2026-08-17");
  assert.equal(result.status, "missing");
  assert.equal(result.batchId, null);
  assert.deepEqual(result.data.candidates, []);
  assert.ok(result.missingFields.includes("strategy.batch"));
  assert.deepEqual(seenParams[0], ["strategy", "2026-08-17"]);
});

test("an explicit trade date is queried exactly and is never replaced by an older batch", async () => {
  const seenParams = [];
  const result = await getTodayResearch(async (_sql, params) => {
    seenParams.push(params);
    return [];
  }, { now: NOW, tradeDate: "2026-08-15" });

  assert.equal(result.serverDate, "2026-08-17");
  assert.equal(result.status, "missing");
  assert.deepEqual(seenParams[0], ["today", "2026-08-15"]);
});

test("a discoverable running batch returns pending without querying child tables", async () => {
  let calls = 0;
  const result = await getTodayResearch(async () => {
    calls += 1;
    return [batch("today", { batchStatus: "running", dataAsOf: null })];
  }, { now: NOW });

  assert.equal(calls, 1);
  assert.equal(result.status, "pending");
  assert.equal(result.batchId, "today-20260817-01");
  assert.equal(result.dataAsOf, null);
});

test("zero values survive a partial risk batch", async () => {
  const query = guardedQuery(async (sql) => {
    if (sql.includes("FROM research_batch")) return [batch("risk")];
    if (sql.includes("FROM risk_snapshot")) {
      return [{
        id: 11,
        score: 0,
        stageCode: "watch",
        stageLabel: "Watch",
        riskCoefficientPct: 0,
        exposureConstraintPct: 0,
        currentDataLayer: "close",
        summary: "fixture",
        actionText: "fixture",
        killConditionHitCount: 0,
        killConditionTotalCount: 3,
        killSwitchTriggered: 0,
        timeline: [],
        killConditions: [],
        sourceName: "fixture",
        sourceUrl: null,
        sourcePublishedAt: null,
        dataAsOf: "2026-08-17 16:10:00.000",
      }];
    }
    if (sql.includes("FROM risk_signal_result")) {
      assert.doesNotMatch(sql, /\bAS\s+signal\b/iu);
      return [];
    }
    throw new Error(`Unexpected fixture query: ${sql}`);
  });

  const result = await getRiskResearch(query, { now: NOW });

  assert.equal(result.data.snapshot.score, 0);
  assert.equal(result.data.snapshot.riskCoefficientPct, 0);
  assert.equal(result.data.snapshot.killSwitchTriggered, 0);
  assert.equal(result.status, "partial");
  assert.ok(result.missingFields.includes("risk.signals"));
});

test("a missing proposal table maps to missing without exposing the driver error", async () => {
  const driverError = Object.assign(new Error("host=secret password=secret"), { code: "ER_NO_SUCH_TABLE" });
  const result = await getIpoResearch(async () => {
    throw driverError;
  }, { now: NOW });

  assert.equal(result.status, "missing");
  assert.ok(result.missingFields.includes("ipo.table"));
  assert.doesNotMatch(JSON.stringify(result), /host|password|secret|ER_NO_SUCH_TABLE/i);
});

test("an approved table absent at the real verifier boundary maps to missing", async () => {
  let applicationQueryExecuted = false;
  const boundaryQuery = (sql, params = []) => executeVerifiedRead(sql, params, {
    verify: (targets) => verifyReadTargets(targets, "A_stock", async () => undefined),
    execute: async () => {
      applicationQueryExecuted = true;
      return [];
    },
  });

  const result = await getRiskResearch(boundaryQuery, { now: NOW });

  assert.equal(applicationQueryExecuted, false);
  assert.equal(result.status, "missing");
  assert.ok(result.missingFields.includes("risk.table"));
  assert.doesNotMatch(JSON.stringify(result), /research_batch|A_stock|host|password/i);
});

test("unexpected query errors map to a sanitized failed response", async () => {
  const result = await getRiskResearch(async () => {
    throw new Error("simulated sensitive-field host=127.0.0.1 raw driver failure");
  }, { now: NOW });

  assert.equal(result.status, "failed");
  assert.deepEqual(result.data, { snapshot: null, signals: [] });
  assert.doesNotMatch(JSON.stringify(result), /MYSQL|password|127\.0\.0\.1|driver/i);
});

test("strategy returns ready data from strategy 01 only", async () => {
  const query = guardedQuery(async (sql, params) => {
    if (sql.includes("FROM research_batch")) return [batch("strategy")];
    if (sql.includes("FROM strategy_run")) return [{
      id: 20,
      strategyDefinitionId: 30,
      tradeDate: "2026-08-17",
      runStatus: "success",
      marketSampleCount: 0,
      officialCandidateCount: 1,
      nearCandidateCount: 0,
      runtimeMs: 0,
      dataAsOf: "2026-08-17 16:10:00.000",
    }];
    if (sql.includes("FROM strategy_definition")) {
      assert.deepEqual(params, [30, "momentum-gap-volume"]);
      return [{ id: 30, strategyCode: "momentum-gap-volume", version: "1", name: "Momentum", description: null, isEnabled: 1, rules: { steps: [] }, dataAsOf: "2026-08-17 15:00:00.000" }];
    }
    if (sql.includes("FROM strategy_funnel_result")) return Array.from({ length: 5 }, (_, index) => ({ stepCode: `step-${index + 1}`, stepName: `Step ${index + 1}`, passedCount: 0, sortOrder: index + 1, dataAsOf: "2026-08-17 16:10:00.000" }));
    if (sql.includes("FROM strategy_candidate")) return [{ id: 40, candidateType: "official", rankNo: 1, matchScore: 0, tsCode: "000001.SZ", name: "Fixture", evidence: [] }];
    throw new Error(`Unexpected fixture query: ${sql}`);
  });

  const result = await getStrategyResearch(query, { now: NOW });

  assert.equal(result.status, "ready");
  assert.equal(result.data.definition.strategyCode, "momentum-gap-volume");
  assert.equal(result.data.run.marketSampleCount, 0);
  assert.equal(result.data.funnel[0].passedCount, 0);
  assert.equal(result.data.candidates[0].matchScore, 0);
});

test("today and IPO repositories expose stable ready shapes", async () => {
  const today = await getTodayResearch(guardedQuery(async (sql, params) => {
    if (sql.includes("FROM research_batch")) return [batch(params[0], { tradeDate: params[1], dataAsOf: "2026-08-15 18:00:00.000" })];
    if (sql.includes("FROM daily_decision_snapshot")) return [{ id: 1, marketStage: "watch", headline: "fixture", summary: "fixture", actionText: "fixture", summaryPoints: [{}, {}, {}], dataAsOf: "2026-08-17 16:10:00.000" }];
    if (sql.includes("FROM intel_item")) {
      assert.deepEqual(params, ["2026-08-15 00:00:00.000", "2026-08-16 00:00:00.000", "2026-08-15 18:00:00.000"]);
      return [{ id: 1, title: "fixture" }];
    }
    if (sql.includes("FROM market_event")) {
      assert.deepEqual(params, ["2026-08-01", "2026-09-01", "2026-08-15 18:00:00.000"]);
      return [{ id: 1, title: "fixture" }];
    }
    if (sql.includes("FROM risk_snapshot")) return [{ id: 2, score: 0 }];
    if (sql.includes("FROM strategy_run")) return [{ id: 3, officialCandidateCount: 21, nearCandidateCount: 0 }];
    if (sql.includes("FROM strategy_candidate")) {
      return Array.from({ length: 20 }, (_, index) => ({
        id: 4 + index,
        candidateType: "official",
        tsCode: `${String(index + 1).padStart(6, "0")}.SZ`,
      }));
    }
    throw new Error(`Unexpected fixture query: ${sql}`);
  }), { now: NOW, tradeDate: "2026-08-15" });

  const ipo = await getIpoResearch(guardedQuery(async (sql) => {
    if (sql.includes("FROM research_batch")) return [batch("ipo")];
    if (sql.includes("FROM ipo_company")) return [{ id: 1, companyCode: "fixture", name: "Fixture" }];
    if (sql.includes("FROM ipo_stage_event")) return [{ id: 2, ipoCompanyId: 1, stageCode: "accepted", sortOrder: 1 }];
    if (sql.includes("FROM ipo_metric_snapshot")) return [{ id: 3, ipoCompanyId: 1, snapshotKind: "overview", metrics: {} }];
    if (sql.includes("FROM ipo_subscription_analysis")) return [{ id: 4, ipoCompanyId: 1, analysisType: "actual", winningRatePct: 0 }];
    if (sql.includes("FROM ipo_valuation_scenario")) return [{ id: 5, ipoCompanyId: 1, scenarioCode: "base", scenarioPrice: 0 }];
    throw new Error(`Unexpected fixture query: ${sql}`);
  }), { now: NOW });

  assert.equal(today.status, "ready");
  assert.deepEqual(Object.keys(today.data), ["snapshot", "riskSnapshot", "strategyRun", "strategyCandidates", "intelItems", "events"]);
  assert.equal(today.data.riskSnapshot.score, 0);
  assert.equal(ipo.status, "ready");
  assert.equal(ipo.data.subscriptions[0].winningRatePct, 0);
  assert.equal(ipo.data.valuations[0].scenarioPrice, 0);
});

test("risk requires the six frontend signal identities and named JSON container shapes", async () => {
  const signalCodes = ["breadth", "limit", "volume", "leader", "sentiment", "external"];
  const query = guardedQuery(async (sql) => {
    if (sql.includes("FROM research_batch")) return [batch("risk")];
    if (sql.includes("FROM risk_snapshot")) return [{
      id: 11,
      score: 0,
      timeline: JSON.stringify([{}, {}, {}, {}]),
      killConditions: [{}, {}, {}],
    }];
    if (sql.includes("FROM risk_signal_result")) {
      return signalCodes.map((signalCode, index) => ({ id: index + 1, signalCode, sortOrder: index + 1 }));
    }
    throw new Error(`Unexpected fixture query: ${sql}`);
  });

  const ready = await getRiskResearch(query, { now: NOW });
  assert.equal(ready.status, "ready");
  assert.ok(Array.isArray(ready.data.snapshot.timeline));

  const malformed = await getRiskResearch(guardedQuery(async (sql) => {
    if (sql.includes("FROM research_batch")) return [batch("risk")];
    if (sql.includes("FROM risk_snapshot")) return [{
      id: 11,
      score: 0,
      timeline: [{}, null, undefined, {}],
      killConditions: [{}, false, null],
    }];
    if (sql.includes("FROM risk_signal_result")) {
      return ["breadth", "limit", "volume", "leader", "sentiment", "sentiment"].map((signalCode, index) => ({ id: index + 1, signalCode, sortOrder: index + 1 }));
    }
    throw new Error(`Unexpected fixture query: ${sql}`);
  }), { now: NOW });

  assert.equal(malformed.status, "partial");
  assert.ok(malformed.missingFields.includes("risk.snapshot.timeline.1"));
  assert.ok(malformed.missingFields.includes("risk.snapshot.timeline.2"));
  assert.ok(malformed.missingFields.includes("risk.snapshot.killConditions.1"));
  assert.ok(malformed.missingFields.includes("risk.snapshot.killConditions.2"));
  assert.ok(malformed.missingFields.includes("risk.signals.signalCode"));
  assert.ok(malformed.missingFields.includes("risk.signals.external"));
});

test("Today marks malformed three-point summary JSON with its precise field path", async () => {
  const result = await getTodayResearch(guardedQuery(async (sql, params) => {
    if (sql.includes("FROM research_batch")) return params[0] === "today" ? [batch("today")] : [];
    if (sql.includes("FROM daily_decision_snapshot")) return [{ id: 1, summaryPoints: [{}, null, undefined] }];
    if (sql.includes("FROM intel_item")) return [{ id: 2, title: "fixture" }];
    if (sql.includes("FROM market_event")) return [{ id: 3, title: "fixture" }];
    throw new Error(`Unexpected fixture query: ${sql}`);
  }), { now: NOW });

  assert.equal(result.status, "partial");
  assert.ok(result.missingFields.includes("today.snapshot.summaryPoints.1"));
  assert.ok(result.missingFields.includes("today.snapshot.summaryPoints.2"));
  assert.ok(Array.isArray(result.data.snapshot.summaryPoints));
});

test("strategy and IPO validate discoverable positions, identities, and JSON containers", async () => {
  const strategy = await getStrategyResearch(guardedQuery(async (sql) => {
    if (sql.includes("FROM research_batch")) return [batch("strategy")];
    if (sql.includes("FROM strategy_run")) return [{ id: 20, strategyDefinitionId: 30, officialCandidateCount: 1, nearCandidateCount: 0 }];
    if (sql.includes("FROM strategy_definition")) return [{ id: 30, strategyCode: "momentum-gap-volume", rules: [] }];
    if (sql.includes("FROM strategy_funnel_result")) return [
      { stepCode: "one", sortOrder: 1 },
      { stepCode: "two", sortOrder: 2 },
      { stepCode: "two", sortOrder: 3 },
      { stepCode: "four", sortOrder: 4 },
      { stepCode: "five", sortOrder: 5 },
    ];
    if (sql.includes("FROM strategy_candidate")) return [{ id: 40, candidateType: "official", tsCode: "000001.SZ", evidence: {} }];
    throw new Error(`Unexpected fixture query: ${sql}`);
  }), { now: NOW });

  assert.equal(strategy.status, "partial");
  assert.ok(strategy.missingFields.includes("strategy.definition.rules"));
  assert.ok(strategy.missingFields.includes("strategy.funnel.stepCode"));
  assert.ok(strategy.missingFields.includes("strategy.candidates.40.evidence"));

  const ipo = await getIpoResearch(guardedQuery(async (sql) => {
    if (sql.includes("FROM research_batch")) return [batch("ipo")];
    if (sql.includes("FROM ipo_company")) return [
      { id: 1, companyCode: "fixture", name: "Fixture" },
      { id: 2, companyCode: "no-stage", name: "No Stage" },
    ];
    if (sql.includes("FROM ipo_stage_event")) return [{ id: 2, ipoCompanyId: 1, stageCode: "accepted", sortOrder: 1 }];
    if (sql.includes("FROM ipo_metric_snapshot")) return [{ id: 3, ipoCompanyId: 1, snapshotKind: "overview", metrics: [] }];
    if (sql.includes("FROM ipo_subscription_analysis")) return [
      { id: 4, ipoCompanyId: 1, analysisType: "actual" },
      { id: 5, ipoCompanyId: 1, analysisType: "actual" },
    ];
    if (sql.includes("FROM ipo_valuation_scenario")) return [{ id: 6, ipoCompanyId: 999, scenarioCode: "base" }];
    throw new Error(`Unexpected fixture query: ${sql}`);
  }), { now: NOW });

  assert.equal(ipo.status, "partial");
  assert.ok(ipo.missingFields.includes("ipo.metrics.3.metrics"));
  assert.ok(ipo.missingFields.includes("ipo.subscriptions.identity"));
  assert.ok(ipo.missingFields.includes("ipo.valuations.company"));
  assert.ok(ipo.missingFields.includes("ipo.companies.2.stages"));
});

test("IPO validates every identity component before composite uniqueness", async () => {
  const result = await getIpoResearch(guardedQuery(async (sql) => {
    if (sql.includes("FROM research_batch")) return [batch("ipo")];
    if (sql.includes("FROM ipo_company")) return [
      { id: 1, companyCode: "alpha", name: "Alpha" },
      { id: 1, companyCode: "beta", name: "Duplicate id" },
      { id: 2, companyCode: "alpha", name: "Duplicate code" },
      { id: 3, companyCode: " ", name: "Blank code" },
    ];
    if (sql.includes("FROM ipo_stage_event")) return [
      { id: 10, ipoCompanyId: 1, stageCode: undefined, sortOrder: undefined },
      { id: 11, ipoCompanyId: 2, stageCode: "accepted", sortOrder: 0 },
      { id: 12, ipoCompanyId: undefined, stageCode: "accepted", sortOrder: 1 },
    ];
    if (sql.includes("FROM ipo_metric_snapshot")) return [{ id: 20, ipoCompanyId: undefined, snapshotKind: " ", metrics: {} }];
    if (sql.includes("FROM ipo_subscription_analysis")) return [{ id: 30, ipoCompanyId: null, analysisType: "" }];
    if (sql.includes("FROM ipo_valuation_scenario")) return [{ id: 40, ipoCompanyId: 1, scenarioCode: undefined }];
    throw new Error(`Unexpected fixture query: ${sql}`);
  }), { now: NOW });

  assert.equal(result.status, "partial");
  for (const field of [
    "ipo.companies.id",
    "ipo.companies.companyCode",
    "ipo.companies.3.companyCode",
    "ipo.stages.10.stageCode",
    "ipo.stages.10.sortOrder",
    "ipo.stages.12.ipoCompanyId",
    "ipo.metrics.20.ipoCompanyId",
    "ipo.metrics.20.snapshotKind",
    "ipo.subscriptions.30.ipoCompanyId",
    "ipo.subscriptions.30.analysisType",
    "ipo.valuations.40.scenarioCode",
  ]) assert.ok(result.missingFields.includes(field), field);
  assert.equal(result.missingFields.includes("ipo.stages.11.sortOrder"), false, "numeric zero is valid");
});
