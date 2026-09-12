import assert from "node:assert/strict";
import test from "node:test";

import { getSystemContext } from "../lib/server/system-context.ts";

test("system context formats the server instant in Shanghai", () => {
  const context = getSystemContext(new Date("2026-08-16T16:30:00.000Z"));
  assert.equal(context.serverDate, "2026-08-17");
  assert.equal(context.compactDate, "08/17");
  assert.equal(context.dottedDate, "2026.08.17");
  assert.equal(context.timezone, "Asia/Shanghai");
});
