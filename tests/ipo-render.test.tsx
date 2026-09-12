import assert from "node:assert/strict";
import test from "node:test";
import { renderToStaticMarkup } from "react-dom/server";
import { IPOPage } from "../app/ipo-page.tsx";
import { getPageFromHash } from "../lib/prototype-model.mjs";

test("the IPO shell preserves research sections and exposes an honest missing-data state", () => {
  const html = renderToStaticMarkup(<IPOPage context={{ serverDate: "2026-08-17", compactDate: "08/17", dottedDate: "2026.08.17", timezone: "Asia/Shanghai" }} />);
  assert.equal(getPageFromHash("#ipo"), "ipo");
  for (const selector of ["ipo-company-grid", "ipo-progress", "ipo-comparison", "ipo-allocation", "ipo-valuation", "space-ipo-section", "ipo-data-note"]) assert.match(html, new RegExp(selector));
  assert.match(html, /data-research-status="pending"/);
  assert.match(html, /XX/);
  assert.match(html, /IPO DUEL RESEARCH.*08\/17/);
});
