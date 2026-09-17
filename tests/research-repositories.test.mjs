import assert from "node:assert/strict";
import test from "node:test";

import { getIpoResearch } from "../lib/server/repositories/ipo.ts";
import { getRiskResearch } from "../lib/server/repositories/risk.ts";
import { getStrategyResearch } from "../lib/server/repositories/strategy.ts";
import { getTodayResearch } from "../lib/server/repositories/today.ts";
import { APPROVED_APPLICATION_TABLES, assertReadOnlySql, verifyReadTargets } from "../lib/server/sql-guard.ts";
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

test("the read-only allowlist covers every deployed market and research table", () => {
  for (const table of [
    "adj_factor", "call_auction", "ci_index_daily", "ci_index_member", "daily", "daily_basic",
    "exchange_rate", "foreign_index", "foreign_industry_index", "gold_oil", "index_basic",
    "index_daily", "limit_updown", "margin_daily", "risk_strategy_funnel", "risk_strategy_result",
    "risk_strategy_run", "risk_strategy_signal_history", "risk_strategy_stock_stage", "stock_basic",
  ]) {
    assert.ok(APPROVED_APPLICATION_TABLES.has(table), `${table} must stay readable`);
  }
});

test("today resolves the newest trade date at or before the request and reports it", async () => {
  const seen = [];
  const result = await getTodayResearch(guardedQuery(async (sql, params) => {
    seen.push({ sql, params });
    if (sql.includes("MAX(trade_date) AS latestTradeDate")) return [{ latestTradeDate: "20260817" }];
    if (sql.includes("MAX(trade_date) AS previousTradeDate")) return [{ previousTradeDate: "20260814" }];
    if (sql.includes("AS total,")) {
      return [{ total: 3, up: 2, down: 1, flat: 0, avgPctChg: 0, amountK: 0, limitUp: 0, up5Pct: 0, up0Pct: 2, down0Pct: 1, down5Pct: 0, limitDown: 0 }];
    }
    if (sql.includes("FROM index_daily")) {
      return [{ tsCode: "000001.SH", name: "Fixture", close: 0, pctChg: 0, amountK: 0 }];
    }
    if (sql.includes("FROM limit_updown")) {
      return [{ tradeDate: "20260817", limitUp: 0, limitDown: 0, upCount: 2, downCount: 1, upDownRatio: 0, upRate: 0, upRateChg2d: 0, upRateChg3d: 0, upRateChg5d: 0 }];
    }
    if (sql.includes("GROUP BY info.industry")) return [{ industry: "银行", stockCount: 3, avgPctChg: 0 }];
    if (sql.includes("info.market AS segment")) return [{ segment: "主板", stockCount: 3, avgPctChg: 0, amountK: 0 }];
    if (sql.includes("FROM margin_daily")) {
      return [{ tradeDate: "20260814", marketTurnover: 0, shTurnover: 0, szTurnover: 0, totalMarginBalance: 0, marginNetBuy: 0, marginBuy: 0, marginTurnoverRatio: 0, totalTurnoverRatio: 0 }];
    }
    if (sql.includes("MAX(trade_date) AS latestDate")) return [{ latestDate: "20260814" }];
    if (sql.includes("index_code AS indexCode")) return [{ indexCode: "hkHSI", indexName: "恒生指数", close: 0, changePct: 0 }];
    if (sql.includes("FROM gold_oil")) return [{ tradeDate: "20260817", gold: 0, silver: 0, wti: 0, brent: null, goldSilverRatio: 0 }];
    if (sql.includes("FROM exchange_rate")) return [{ tradeDate: "20260814", usd: 0, eur: 0, jpy: 0, hkd: 0 }];
    if (sql.includes("FROM call_auction")) return [{ stockCount: 3, avgPctChg: 0, gapUpCount: 2, gapDownCount: 1 }];
    if (sql.includes("FROM daily_basic")) return [{ peSampleCount: 2, peTtmAvg: 0, pbAvg: 0, totalMvSum: 0, turnoverAvg: 0 }];
    if (sql.includes("FROM risk_strategy_run")) return [{ id: 45, strategyName: "启动信号", evaluationDate: "20260817", universeCount: 3, resultCount: 1 }];
    if (sql.includes("FROM risk_strategy_funnel")) return [{ stageOrder: 1, stageCode: "universe", stageName: "全市场样本", stockCount: 3 }];
    if (sql.includes("FROM risk_strategy_result")) return [{ tsCode: "000001.SZ", name: "Fixture", close: 0, pctChg: 0, summary: "fixture" }];
    throw new Error(`Unexpected fixture query: ${sql}`);
  }), { now: NOW, tradeDate: "2026-08-17" });

  assert.equal(result.status, "ready");
  assert.equal(result.serverDate, "2026-08-17");
  assert.equal(result.batchId, "market-20260817");
  assert.equal(result.dataAsOf, "2026-08-17");
  assert.deepEqual(result.missingFields, []);
  assert.equal(result.data.tradeDate, "20260817");
  assert.equal(result.data.previousTradeDate, "20260814");
  assert.equal(result.data.indices[0].close, 0, "numeric zero is a valid value");
  assert.equal(result.data.breadth.total, 3);
  assert.equal(result.data.breadth.limitDown, 0);
  assert.equal(result.data.valuation.peTtmAvg, 0);
  assert.equal(result.data.auction.gapDownCount, 1);
  assert.equal(result.data.strategy.hits[0].pctChg, 0);
  assert.deepEqual(seen[0].params, ["20260817"], "the requested day bounds the trade-date lookup");
  assert.ok(seen.some((entry) => entry.sql.includes("FROM limit_updown") && entry.params[0] === "20260817"));
});

test("today reports missing without touching child tables when no trade date is available", async () => {
  let calls = 0;
  const result = await getTodayResearch(async (sql, params) => {
    calls += 1;
    assert.match(sql, /MAX\(trade_date\) AS latestTradeDate/);
    assert.deepEqual(params, ["20260817"]);
    return [{ latestTradeDate: null }];
  }, { now: NOW });

  assert.equal(calls, 1, "child tables must not be queried without a resolved trade date");
  assert.equal(result.status, "missing");
  assert.equal(result.batchId, null);
  assert.equal(result.dataAsOf, null);
  assert.equal(result.data.tradeDate, null);
  assert.ok(result.missingFields.includes("today.tradeDate"));
});

test("today sanitizes unexpected driver failures", async () => {
  const result = await getTodayResearch(async () => {
    throw new Error("host=127.0.0.1 password=secret driver failure");
  }, { now: NOW });

  assert.equal(result.status, "failed");
  assert.equal(result.data.tradeDate, null);
  assert.deepEqual(result.data.indices, []);
  assert.deepEqual(result.data.industries, []);
  assert.deepEqual(result.missingFields, ["today.query"]);
  assert.doesNotMatch(JSON.stringify(result), /password|127\.0\.0\.1|secret|driver/i);
});

test("strategy reports missing when no successful run exists at or before the request", async () => {
  const seenParams = [];
  const result = await getStrategyResearch(async (_sql, params) => {
    seenParams.push(params);
    return [];
  }, { now: NOW });

  assert.equal(result.serverDate, "2026-08-17");
  assert.equal(result.status, "missing");
  assert.equal(result.batchId, null);
  assert.deepEqual(result.data.run, null);
  assert.deepEqual(result.data.funnel, []);
  assert.deepEqual(result.data.candidates, []);
  assert.deepEqual(result.data.failureStages, []);
  assert.deepEqual(result.data.history, []);
  assert.ok(result.missingFields.includes("strategy.run"));
  assert.deepEqual(seenParams[0], ["20260817"]);
});

test("strategy reads one run's funnel, candidates, failure stages, and history", async () => {
  const result = await getStrategyResearch(guardedQuery(async (sql, params) => {
    if (sql.includes("FROM risk_strategy_run")) {
      assert.deepEqual(params, ["20260817"]);
      return [{
        id: 45,
        strategyCode: "startup_signal",
        strategyName: "启动信号",
        evaluationDate: "20260817",
        paramsVersion: "startup-signal-v3",
        status: "success",
        startedAt: "2026-08-17 18:00:00.000000",
        completedAt: "2026-08-17 18:04:05.000000",
        universeCount: 4601,
        resultCount: 1,
      }];
    }
    if (sql.includes("FROM risk_strategy_funnel")) {
      assert.deepEqual(params, [45]);
      return [
        { stageOrder: 1, stageCode: "universe", stageName: "全市场样本", stockCount: 4601 },
        { stageOrder: 2, stageCode: "low_structure", stageName: "低位结构", stockCount: 4210 },
      ];
    }
    if (sql.includes("FROM risk_strategy_result")) {
      assert.deepEqual(params, [45]);
      return [{
        tsCode: "002815.SZ",
        name: "Fixture",
        board: "主板",
        industry: "元器件",
        evaluationDate: "20260817",
        signalDate: "20260817",
        close: 0,
        pctChg: 0,
        summary: "fixture",
        signals: [{ label: "试盘确认", value: "20260817" }],
        evidence: [{ label: "试盘确认", value: "fixture", status: "通过" }],
      }];
    }
    if (sql.includes("FROM risk_strategy_stock_stage")) {
      assert.deepEqual(params, [45]);
      return [{ failureStage: "trial_confirm", stockCount: 4089 }];
    }
    if (sql.includes("FROM risk_strategy_signal_history")) {
      assert.deepEqual(params, ["20260817"]);
      return [{ tsCode: "002815.SZ", name: "Fixture", confirmationDate: "20260817", close: 0, pctChg: 0, summary: "fixture" }];
    }
    throw new Error(`Unexpected fixture query: ${sql}`);
  }), { now: NOW });

  assert.equal(result.status, "ready");
  assert.equal(result.batchId, "market-20260817");
  assert.equal(result.dataAsOf, "2026-08-17");
  assert.deepEqual(result.missingFields, []);
  assert.equal(result.data.run.strategyCode, "startup_signal");
  assert.equal(result.data.run.universeCount, 4601);
  assert.equal(result.data.run.runtimeMs, 245000);
  assert.equal(result.data.funnel[1].stockCount, 4210);
  assert.equal(result.data.candidates[0].close, 0, "numeric zero is a valid value");
  assert.equal(result.data.candidates[0].signals[0].value, "20260817");
  assert.equal(result.data.candidates[0].evidence[0].status, "通过");
  assert.deepEqual(result.data.failureStages, [{ stage: "trial_confirm", label: "试盘确认", count: 4089 }]);
  assert.equal(result.data.history[0].confirmationDate, "20260817");
});

test("strategy keeps reportable rows and marks absent sections as partial", async () => {
  const result = await getStrategyResearch(guardedQuery(async (sql) => {
    if (sql.includes("FROM risk_strategy_run")) {
      return [{ id: 9, strategyCode: "startup_signal", evaluationDate: "20260817", status: "success", universeCount: 4601, resultCount: 0 }];
    }
    if (sql.includes("FROM risk_strategy_funnel")) return [{ stageOrder: 1, stageCode: "universe", stageName: "全市场样本", stockCount: 4601 }];
    if (sql.includes("FROM risk_strategy_result")) return [];
    if (sql.includes("FROM risk_strategy_stock_stage")) return [];
    if (sql.includes("FROM risk_strategy_signal_history")) return [];
    throw new Error(`Unexpected fixture query: ${sql}`);
  }), { now: NOW });

  assert.equal(result.status, "partial");
  assert.deepEqual(result.data.candidates, []);
  assert.deepEqual(result.missingFields, ["strategy.history"], "zero results are not a missing candidate list");
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

test("IPO exposes stable ready shapes for companies, stages, metrics, and scenarios", async () => {
  const ipo = await getIpoResearch(guardedQuery(async (sql) => {
    if (sql.includes("FROM research_batch")) return [batch("ipo")];
    if (sql.includes("FROM ipo_company")) return [{ id: 1, companyCode: "fixture", name: "Fixture" }];
    if (sql.includes("FROM ipo_stage_event")) return [{ id: 2, ipoCompanyId: 1, stageCode: "accepted", sortOrder: 1 }];
    if (sql.includes("FROM ipo_metric_snapshot")) return [{ id: 3, ipoCompanyId: 1, snapshotKind: "overview", metrics: {} }];
    if (sql.includes("FROM ipo_subscription_analysis")) return [{ id: 4, ipoCompanyId: 1, analysisType: "actual", winningRatePct: 0 }];
    if (sql.includes("FROM ipo_valuation_scenario")) return [{ id: 5, ipoCompanyId: 1, scenarioCode: "base", scenarioPrice: 0 }];
    throw new Error(`Unexpected fixture query: ${sql}`);
  }), { now: NOW });

  assert.equal(ipo.status, "ready");
  assert.equal(ipo.data.subscriptions[0].winningRatePct, 0);
  assert.equal(ipo.data.valuations[0].scenarioPrice, 0);
});

test("IPO validates discoverable positions, identities, and JSON containers", async () => {
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
