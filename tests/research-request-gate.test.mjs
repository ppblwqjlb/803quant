import assert from "node:assert/strict";
import test from "node:test";

import { createResearchRequestGate } from "../lib/research/request-gate.ts";

test("request gate rejects an in-flight response after unmount invalidation", () => {
  const gate = createResearchRequestGate();
  const request = gate.begin();
  assert.equal(gate.isCurrent(request), true);
  gate.invalidate();
  assert.equal(gate.isCurrent(request), false);
});

test("a replacement gate cannot accept a request from the prior hook lifecycle", () => {
  const priorGate = createResearchRequestGate();
  const request = priorGate.begin();
  priorGate.invalidate();
  const replacementGate = createResearchRequestGate();
  replacementGate.begin();
  assert.equal(replacementGate.isCurrent(request), false);
});
