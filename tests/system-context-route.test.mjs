import assert from "node:assert/strict";
import test from "node:test";

import { dynamic, GET } from "../app/api/system/context/route.ts";

test("system context route is dynamic and disables response caching", () => {
  const response = GET();

  assert.equal(dynamic, "force-dynamic");
  assert.equal(response.headers.get("Cache-Control"), "no-store, max-age=0");
});
