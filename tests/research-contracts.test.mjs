import assert from "node:assert/strict";
import test from "node:test";

import { displayValue } from "../lib/research/contracts.ts";

test("displayValue preserves zero and replaces missing values", () => {
  assert.equal(displayValue(0), "0");
  assert.equal(displayValue(null), "XX");
  assert.equal(displayValue(undefined), "XX");
  assert.equal(displayValue(""), "XX");
});
