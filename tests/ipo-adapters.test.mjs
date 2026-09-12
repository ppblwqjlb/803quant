import assert from "node:assert/strict";
import test from "node:test";

import { adaptIpoResearch, keepsAvailableResearchRows, researchDisplayState } from "../app/ipo-adapters.ts";

test("IPO comparison rows align each metric by ipoCompanyId and preserve zero values", () => {
  const view = adaptIpoResearch({
    companies: [{ id: 1, name: "甲" }, { id: 2, name: "乙" }],
    stages: [],
    subscriptions: [],
    valuations: [],
    metrics: [
      { id: 11, ipoCompanyId: 1, snapshotKind: "comparison", metrics: { 核心业务: "芯片", 中签率: 0 } },
      { id: 12, ipoCompanyId: 2, snapshotKind: "comparison", metrics: { 核心业务: "机器人", 中签率: 0 } },
    ],
  });

  assert.deepEqual(view.comparisonRows, [
    ["核心业务", "芯片", "机器人"],
    ["中签率", "0", "0"],
  ]);
});

test("IPO adapters group stages, subscriptions, and valuation scenarios by company", () => {
  const view = adaptIpoResearch({
    companies: [{ id: 1, name: "甲" }, { id: 2, name: "乙" }],
    stages: [{ id: 1, ipoCompanyId: 2, sortOrder: 2 }, { id: 2, ipoCompanyId: 2, sortOrder: 1 }],
    metrics: [],
    subscriptions: [{ id: 3, ipoCompanyId: 1, winningRatePct: 0 }],
    valuations: [{ id: 4, ipoCompanyId: 2, scenarioCode: "base", scenarioPrice: 0 }],
  });

  assert.equal(view.stagesFor(view.primary[1])[0].id, 2);
  assert.equal(view.subscriptions[0].company?.name, "甲");
  assert.equal(view.valuationsFor(view.primary[1])[0].scenarioPrice, 0);
});

test("display state distinguishes unavailable data from a ready empty result", () => {
  assert.equal(researchDisplayState("missing", 0), "missing");
  assert.equal(researchDisplayState("failed", 0), "failed");
  assert.equal(researchDisplayState("partial", 0), "partial");
  assert.equal(researchDisplayState("ready", 0), "empty");
  assert.equal(researchDisplayState("ready", 2), "ready");
});

test("partial API candidates remain eligible for rendering", () => {
  const partialCandidate = { id: 1, name: "可用候选" };
  assert.equal(keepsAvailableResearchRows("partial"), true);
  assert.deepEqual(keepsAvailableResearchRows("partial") ? [partialCandidate] : [], [partialCandidate]);
  assert.equal(keepsAvailableResearchRows("missing"), false);
  assert.equal(keepsAvailableResearchRows("failed"), false);
});
