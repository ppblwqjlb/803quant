import assert from "node:assert/strict";
import test from "node:test";
import { MEMBERSHIP_DEMO, PLANS, getAtLeastOneHitProbability, getMarketCapYi, getPageFromHash, getPlanExpiry, getPlanSummary, getReferenceIssuePrice, validateRedemptionCode } from "../lib/prototype-model.mjs";

test("membership demo keeps purchase and redemption timestamps separate from research data", () => {
  assert.equal(getPlanExpiry("yearly"), MEMBERSHIP_DEMO.expiryByPlan.yearly);
  assert.equal(validateRedemptionCode(" 803-2026-vip ").expiresAt, MEMBERSHIP_DEMO.redeemExpiresAt);
  assert.equal(getPlanSummary("yearly").price, 799);
  assert.equal(PLANS.every((plan) => plan.autoRenewDefault === false), true);
});

test("IPO math helpers keep explicit units without supplying research fixtures", () => {
  assert.equal(getReferenceIssuePrice(4_201_710_000, 40_446_434), 103.88);
  assert.equal(getAtLeastOneHitProbability(0.02, 12), 0.2397);
  assert.equal(getMarketCapYi(100, 404_464_340), 404.46);
});

test("hash navigation resolves the public product pages", () => {
  for (const page of ["home", "today", "risk", "strategy", "ipo", "membership"]) assert.equal(getPageFromHash(`#${page}`), page);
  assert.equal(getPageFromHash("#intel"), "today");
});
