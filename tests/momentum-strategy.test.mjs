import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import {
  evaluateMomentumUniverse,
  validateMomentumRules,
} from "../lib/strategy/momentum-gap-volume.mjs";
import {
  buildRunPlan,
  MOMENTUM_READ_SQL,
  resolveRequestedMode,
  runMomentumStrategy,
} from "../scripts/run-momentum-strategy.mjs";
import { assertReadOnlySql } from "../lib/server/sql-guard.ts";

const RULES = Object.freeze({
  requireTradable: true,
  excludeSt: true,
  minListedDays: 60,
  maxHistoryPercentile: 35,
  requireLimitUpTest: true,
  minConsolidationDays: 10,
  maxConsolidationRangePct: 18,
  minGapPct: 1.8,
  maxGapPct: 5,
  minVolumeRatio: 1.5,
  minCloseToHighRatio: 0.98,
  near: {
    maxGapShortfallPct: 0.4,
    maxGapExcessPct: 0.5,
    maxVolumeRatioShortfall: 0.2,
    maxCloseToHighShortfall: 0.02,
  },
});

const row = (overrides = {}) => ({
  tsCode: "000001.SZ",
  name: "平安银行",
  tradeDate: "2026-08-17",
  market: "深主板",
  board: "主板",
  industry: "银行",
  isTradable: true,
  isSt: false,
  listedDays: 900,
  adjustedHistoryPercentile: 21,
  hadLimitUpTest: true,
  consolidationDays: 18,
  consolidationRangePct: 12,
  gapPct: 2.2,
  volumeRatio: 1.8,
  close: 11.8,
  high: 12,
  changePct: 6.2,
  setupLabel: "低位试盘后启动",
  ...overrides,
});

test("momentum evaluation returns a five-step strict funnel and disjoint official/near candidates", () => {
  const result = evaluateMomentumUniverse([
    row(),
    row({ tsCode: "000002.SZ", name: "万科A", volumeRatio: 1.35 }),
    row({ tsCode: "000003.SZ", name: "国华网安", consolidationRangePct: 20 }),
  ], RULES);

  assert.deepEqual(result.funnel.map(({ code, count }) => [code, count]), [
    ["eligible", 3],
    ["limit-test", 3],
    ["consolidation", 2],
    ["gap-volume", 1],
    ["close-confirmation", 1],
  ]);
  assert.deepEqual(result.official.map((candidate) => candidate.tsCode), ["000001.SZ"]);
  assert.deepEqual(result.near.map((candidate) => candidate.tsCode), ["000002.SZ"]);
  assert.equal(result.official.some(({ tsCode }) => result.near.some((candidate) => candidate.tsCode === tsCode)), false);
  assert.equal(result.official[0].evidence.length, 11);
  assert.equal(result.near[0].evidence.find(({ code }) => code === "volume-ratio")?.state, "near");
});

test("momentum evaluation uses caller thresholds at their inclusive boundaries and preserves zero/false evidence", () => {
  const permissive = {
    ...RULES,
    requireTradable: false,
    excludeSt: false,
    minListedDays: 0,
    maxHistoryPercentile: 0,
    requireLimitUpTest: false,
    minConsolidationDays: 0,
    maxConsolidationRangePct: 0,
    minGapPct: 0,
    maxGapPct: 0,
    minVolumeRatio: 0,
    minCloseToHighRatio: 0,
    near: {
      maxGapShortfallPct: 0,
      maxGapExcessPct: 0,
      maxVolumeRatioShortfall: 0,
      maxCloseToHighShortfall: 0,
    },
  };
  const result = evaluateMomentumUniverse([row({
    isTradable: false,
    isSt: true,
    listedDays: 0,
    adjustedHistoryPercentile: 0,
    hadLimitUpTest: false,
    consolidationDays: 0,
    consolidationRangePct: 0,
    gapPct: 0,
    volumeRatio: 0,
    close: 0,
    high: 10,
    changePct: 0,
  })], permissive);

  assert.deepEqual(result.funnel.map((step) => step.count), [1, 1, 1, 1, 1]);
  assert.equal(result.official[0].gapPct, 0);
  assert.equal(result.official[0].volumeRatio, 0);
  assert.equal(result.official[0].isTradable, false);
  assert.equal(result.official[0].evidence.find(({ code }) => code === "gap-min")?.value, 0);
});

test("momentum evaluation rejects malformed rules and rows instead of silently changing the universe", () => {
  assert.throws(() => evaluateMomentumUniverse([], undefined), /rules/i);
  assert.throws(() => evaluateMomentumUniverse([], { ...RULES, minGapPct: 6 }), /minGapPct/i);
  assert.throws(() => evaluateMomentumUniverse([row({ volumeRatio: undefined })], RULES), /rows\[0\]\.volumeRatio/i);
  assert.throws(() => evaluateMomentumUniverse([row({ isTradable: 0 })], RULES), /rows\[0\]\.isTradable/i);
  assert.deepEqual(evaluateMomentumUniverse([], RULES).funnel.map((step) => step.count), [0, 0, 0, 0, 0]);
});

test("candidate ordering is deterministic when match scores tie", () => {
  const result = evaluateMomentumUniverse([
    row({ tsCode: "600002.SH", name: "B" }),
    row({ tsCode: "000001.SZ", name: "A" }),
    row({ tsCode: "300001.SZ", name: "C" }),
  ], RULES);
  assert.deepEqual(result.official.map(({ tsCode }) => tsCode), ["000001.SZ", "300001.SZ", "600002.SH"]);
});

test("runner defaults to dry-run and refuses either write gate in isolation", () => {
  assert.equal(resolveRequestedMode([], {}), "dry-run");
  assert.throws(() => resolveRequestedMode(["--write"], {}), /both --write and ALLOW_DB_WRITES=true/i);
  assert.throws(() => resolveRequestedMode([], { ALLOW_DB_WRITES: "true" }), /both --write and ALLOW_DB_WRITES=true/i);
  assert.equal(resolveRequestedMode(["--write"], { ALLOW_DB_WRITES: "true" }), "write");
  assert.throws(
    () => buildRunPlan({ argv: ["--write"], env: { ALLOW_DB_WRITES: "true" } }),
    /schema.*not authorized|not authorized.*schema/i,
  );
  assert.deepEqual(buildRunPlan({ argv: [], env: {} }), {
    mode: "dry-run",
    mutationStatements: [],
  });
});

test("importing the runner cannot open MySQL or execute a run", async () => {
  const source = await readFile(new URL("../scripts/run-momentum-strategy.mjs", import.meta.url), "utf8");
  assert.doesNotMatch(source, /^import .*server\/query/m);
  assert.match(source, /await import\([^)]*server\/query\.ts/);
  assert.match(source, /isMainModule/);
});

test("momentum evaluation rejects impossible or ambiguous raw rows before counting the funnel", () => {
  assert.throws(() => evaluateMomentumUniverse([row({ close: 12.1, high: 12 })], RULES), /close.*high/i);
  assert.throws(() => evaluateMomentumUniverse([row({ volumeRatio: -0.1 })], RULES), /volumeRatio/i);
  assert.throws(() => evaluateMomentumUniverse([row({ consolidationRangePct: -0.1 })], RULES), /consolidationRangePct/i);
  assert.throws(() => evaluateMomentumUniverse([row(), row()], RULES), /duplicate.*tsCode/i);
  assert.throws(() => evaluateMomentumUniverse([row(), row({ tsCode: "000002.SZ", tradeDate: "2026-08-16" })], RULES), /tradeDate/i);
});

test("momentum evaluation rejects near tolerances that erase an effective threshold", () => {
  assert.throws(
    () => evaluateMomentumUniverse([], {
      ...RULES,
      near: { ...RULES.near, maxVolumeRatioShortfall: RULES.minVolumeRatio + 0.01 },
    }),
    /maxVolumeRatioShortfall/i,
  );
  assert.throws(
    () => evaluateMomentumUniverse([], {
      ...RULES,
      near: { ...RULES.near, maxCloseToHighShortfall: RULES.minCloseToHighRatio + 0.01 },
    }),
    /maxCloseToHighShortfall/i,
  );
});

const RUNNER_RULES = Object.freeze({
  ...RULES,
  minListedDays: 0,
  maxHistoryPercentile: 100,
  requireLimitUpTest: false,
  minConsolidationDays: 0,
  maxConsolidationRangePct: 100,
  minGapPct: 0,
  maxGapPct: 10,
  minVolumeRatio: 1,
  minCloseToHighRatio: 0.9,
  near: {
    ...RULES.near,
    maxGapShortfallPct: 0,
  },
});

const rawHistory = [
  {
    tsCode: "000001.SZ", tradeDate: "2026-08-14", open: 10, high: 10.1, low: 9.8, close: 10,
    preClose: 10, changePct: 0, volume: 100, volumeRatio: 1, adjFactor: 1,
    name: "Example", market: "main", industry: "bank", listDate: "20200101",
  },
  {
    tsCode: "000001.SZ", tradeDate: "2026-08-17", open: 10.2, high: 10.5, low: 10.1, close: 10.45,
    preClose: 10, changePct: 4.5, volume: 150, volumeRatio: 1.8, adjFactor: 1,
    name: "Example", market: "main", industry: "bank", listDate: "20200101",
  },
];

function runnerQuery({ definition = { rulesJson: JSON.stringify(RUNNER_RULES) }, commonDate = "2026-08-17", fail, rawRows = rawHistory } = {}) {
  return async (sql, params = []) => {
    if (fail) throw fail;
    if (sql.includes("FROM strategy_definition")) return definition ? [definition] : [];
    if (sql.includes("IN (SELECT trade_date FROM daily_basic)")) {
      return commonDate ? [{ tradeDate: commonDate }] : [];
    }
    if (sql.includes("FROM call_auction")) return [{ tsCode: "000001.SZ", tradeDate: commonDate }];
    if (sql.includes("JOIN daily_basic AS basic")) {
      assert.equal(params.at(-1), commonDate, "raw loader must use the selected common date");
      return rawRows.map((item) => item.tradeDate === "2026-08-17" ? { ...item, tradeDate: commonDate } : item);
    }
    throw new Error("unexpected test query");
  };
}

test("runner performs an injected exact-date raw dry run with database rules and evaluator output", async () => {
  const summary = await runMomentumStrategy({ queryRows: runnerQuery() });

  assert.equal(summary.status, "ready");
  assert.equal(summary.latestCommonTradeDate, "2026-08-17");
  assert.equal(summary.auction.status, "available");
  assert.deepEqual(summary.funnel.map((step) => step.count), [1, 1, 1, 1, 1]);
  assert.deepEqual(summary.official.map((candidate) => candidate.tsCode), ["000001.SZ"]);
  assert.deepEqual(summary.near, []);
});

test("runner returns structured non-success results for absent definitions, malformed rules, and required read errors", async () => {
  const absent = await runMomentumStrategy({ queryRows: runnerQuery({ definition: null }) });
  assert.equal(absent.status, "missing");
  assert.deepEqual(absent.missingFields, ["strategy.definition"]);

  const malformed = await runMomentumStrategy({ queryRows: runnerQuery({ definition: { rulesJson: "not-json" } }) });
  assert.equal(malformed.status, "failed");
  assert.deepEqual(malformed.missingFields, ["strategy.definition.rules"]);

  const failed = await runMomentumStrategy({ queryRows: runnerQuery({ fail: new Error("internal database detail") }) });
  assert.equal(failed.status, "failed");
  assert.deepEqual(failed.missingFields, ["strategy.read"]);
  assert.equal(JSON.stringify(failed).includes("internal database detail"), false);
});

test("runner accepts a lagging required input through intersection and ignores unavailable optional auction enrichment", async () => {
  const query = runnerQuery({ commonDate: "2026-08-16" });
  const queryWithOptionalAuctionMissing = async (sql, params) => {
    if (sql.includes("FROM call_auction")) {
      const error = new Error("An approved read-only base table is unavailable");
      error.code = "APPROVED_BASE_TABLE_MISSING";
      throw error;
    }
    return query(sql, params);
  };

  const summary = await runMomentumStrategy({ queryRows: queryWithOptionalAuctionMissing });
  assert.equal(summary.status, "ready");
  assert.equal(summary.latestCommonTradeDate, "2026-08-16");
  assert.equal(summary.auction.status, "unavailable");
});

test("runner normalizes compact raw trade dates while preserving the selected database date", async () => {
  const summary = await runMomentumStrategy({ queryRows: runnerQuery({ commonDate: "20260817" }) });
  assert.equal(summary.status, "ready");
  assert.equal(summary.latestCommonTradeDate, "2026-08-17");
});

test("runner read statements remain within the strict read-only boundary", () => {
  for (const sql of Object.values(MOMENTUM_READ_SQL)) assert.doesNotThrow(() => assertReadOnlySql(sql));
});

test("momentum rules keep both gap boundaries meaningful for near candidates", () => {
  assert.throws(
    () => validateMomentumRules({ ...RULES, minGapPct: -0.01 }),
    /minGapPct/i,
  );
  assert.throws(
    () => validateMomentumRules({
      ...RULES,
      minGapPct: 0,
      near: { ...RULES.near, maxGapShortfallPct: 0.01 },
    }),
    /maxGapShortfallPct/i,
  );
  assert.throws(
    () => validateMomentumRules({
      ...RULES,
      near: { ...RULES.near, maxGapExcessPct: RULES.maxGapPct - RULES.minGapPct + 0.01 },
    }),
    /maxGapExcessPct/i,
  );
  assert.throws(
    () => validateMomentumRules({
      ...RULES,
      near: { ...RULES.near, maxGapShortfallPct: RULES.minGapPct },
    }),
    /maxGapShortfallPct/i,
  );
  assert.throws(
    () => validateMomentumRules({
      ...RULES,
      near: { ...RULES.near, maxVolumeRatioShortfall: RULES.minVolumeRatio },
    }),
    /maxVolumeRatioShortfall/i,
  );

  const result = evaluateMomentumUniverse([row({ gapPct: RULES.maxGapPct + RULES.near.maxGapExcessPct })], RULES);
  assert.deepEqual(result.official, []);
  assert.deepEqual(result.near.map(({ tsCode }) => tsCode), ["000001.SZ"]);
});

test("runner validates semantic rules before requesting market history", async () => {
  const calls = [];
  const summary = await runMomentumStrategy({
    queryRows: async (sql) => {
      calls.push(sql);
      if (sql.includes("FROM strategy_definition")) {
        return [{ rulesJson: JSON.stringify({ ...RUNNER_RULES, minGapPct: -1 }) }];
      }
      throw new Error("raw history must not be read for invalid rules");
    },
  });

  assert.equal(summary.status, "failed");
  assert.deepEqual(summary.missingFields, ["strategy.definition.rules"]);
  assert.equal(calls.length, 1);
  assert.match(calls[0], /FROM strategy_definition/);
});

test("runner rejects null, blank, and boolean raw numeric values instead of coercing them", async () => {
  for (const invalidValue of [null, "", true]) {
    const rows = rawHistory.map((item) => ({ ...item }));
    rows[1].volumeRatio = invalidValue;
    const summary = await runMomentumStrategy({ queryRows: runnerQuery({ rawRows: rows }) });
    assert.equal(summary.status, "failed", String(invalidValue));
    assert.deepEqual(summary.missingFields, ["strategy.raw-inputs"]);
  }
});

test("runner rejects impossible raw OHLCV relationships before deriving candidates", async () => {
  const cases = [
    { open: 9.9, low: 10.1 },
    { close: 10.6, high: 10.5 },
    { volume: -1 },
  ];
  for (const overrides of cases) {
    const rows = rawHistory.map((item) => ({ ...item }));
    Object.assign(rows[1], overrides);
    const summary = await runMomentumStrategy({ queryRows: runnerQuery({ rawRows: rows }) });
    assert.equal(summary.status, "failed", JSON.stringify(overrides));
    assert.deepEqual(summary.missingFields, ["strategy.raw-inputs"]);
  }
});

test("runner rejects impossible calendar dates instead of rolling them into a later month", async () => {
  for (const invalidDate of ["2026-02-30", "2026-0817", "202608-17"]) {
    const rows = rawHistory.map((item) => ({ ...item }));
    rows[1].tradeDate = invalidDate;
    const summary = await runMomentumStrategy({ queryRows: runnerQuery({ rawRows: rows }) });

    assert.equal(summary.status, "failed", invalidDate);
    assert.deepEqual(summary.missingFields, ["strategy.raw-inputs"]);
  }
});

test("runner preserves a Shanghai MySQL DATE value without an UTC calendar-day shift", async () => {
  const rows = rawHistory.map((item) => ({ ...item }));
  rows[1].listDate = new Date("2026-08-16T16:00:00.000Z");
  const summary = await runMomentumStrategy({ queryRows: runnerQuery({ rawRows: rows }) });

  assert.equal(summary.status, "ready");
  assert.equal(summary.official[0].evidence.find(({ code }) => code === "listed-days")?.value, 0);
});
