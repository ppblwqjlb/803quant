import test from "node:test";
import assert from "node:assert/strict";

import { easeOutCubic, getCountFrame } from "../lib/motion-model.mjs";

test("count easing clamps progress and finishes exactly", () => {
  assert.equal(easeOutCubic(-1), 0);
  assert.equal(easeOutCubic(0), 0);
  assert.equal(easeOutCubic(1), 1);
  assert.equal(easeOutCubic(2), 1);
  assert.ok(easeOutCubic(0.5) > 0.5);
});

test("count frames stay integral and never overshoot their target", () => {
  assert.equal(getCountFrame(300, 0), 0);
  assert.equal(getCountFrame(300, 1), 300);
  assert.ok(getCountFrame(300, 0.5) > 150);
  assert.ok(getCountFrame(300, 0.5) < 300);
  assert.equal(getCountFrame(0, 0.5), 0);
});
