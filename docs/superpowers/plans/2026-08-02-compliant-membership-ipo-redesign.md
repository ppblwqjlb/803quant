# Compliant Membership and IPO Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Reposition the prototype as an A-share data and public-information aggregation platform, merge daily intelligence into the decision desk, add member gating and code redemption, add an IPO research page, and remove performance or stock-recommendation marketing language.

**Architecture:** Keep the existing single-page React/Vinext app, Hash routing, and in-memory demo state. Extend the shared model with the new route and redemption validator, keep access state in `PrototypeApp`, render daily intelligence inside `TodayPage`, and add focused IPO and access-gate components without adding a backend or persistence.

**Tech Stack:** React 19, TypeScript, Vinext/Vite, Lucide React, CSS, Node test runner, CDP browser smoke tests, Sites hosting.

## Global Constraints

- Keep the entire site dark; text and Lucide icons use white or white-opacity layers, not cyan/teal.
- Preserve the approved homepage CTA exception: white background/black text by default and blue background/white text on hover.
- Use system sans-serif numerals with `font-feature-settings: "zero" 0`; do not use `ui-monospace`, `Consolas`, or slashed-zero styling for visible numbers.
- Navigation order is `today`, `risk`, `strategy`, `ipo`, `membership`; legacy `#intel` resolves to `today`.
- Default visitor is not a member; `risk` and `strategy` require in-memory membership.
- Online payment success and valid demo code `JIANSHI-2026-VIP` grant in-memory access; refresh resets access.
- Use “策略信号观察”, “规则命中”, and “临近阈值”; do not use stock recommendation, buy/sell, target-price, position-sizing, guaranteed-return, or historical-performance claims.
- Add the fixed notice: “本平台提供公开信息整理、数据展示与标准化模型结果，不构成证券投资咨询或个性化投资建议。市场有风险，投资需独立判断。”
- The IPO page is an information-research page and does not offer subscription or secondary-market action advice.
- Do not add authentication, database, real payments, code inventory, external notifications, search, history, or an admin backend.

---

### Task 1: Routing, copy-safe model data, and redemption validation

**Files:**
- Modify: `lib/prototype-model.mjs`
- Modify: `tests/prototype-model.test.mjs`

**Interfaces:**
- Produces: `PAGE_IDS = ["home", "today", "risk", "strategy", "ipo", "membership"]`.
- Produces: `getPageFromHash(hash)` with `#intel` compatibility returning `today`.
- Produces: `validateRedemptionCode(code): { valid: boolean; expiresAt?: string; message: string }`.
- Produces: risk scenarios whose public `summary`, `action`, `coefficientLabel`, and `exposureLabel` contain no position instructions.
- Produces: intelligence items using `关注提升`, `关注降低`, and `持续观察` actions.

- [ ] **Step 1: Write failing model tests**

Add tests that assert the new page list, legacy redirect, valid/invalid redemption values, and absence of prohibited action terms:

```js
test("legacy intel route resolves to the merged today page", () => {
  assert.equal(getPageFromHash("#intel"), "today");
  assert.equal(getPageFromHash("#ipo"), "ipo");
});

test("redemption validation accepts only the normalized demo code", () => {
  assert.equal(validateRedemptionCode(" jianshi-2026-vip ").valid, true);
  assert.equal(validateRedemptionCode("BAD-CODE").valid, false);
  assert.match(validateRedemptionCode("BAD-CODE").message, /无效/);
});

test("public model copy contains no position instructions", () => {
  const publicCopy = JSON.stringify({ scenarios: RISK_SCENARIOS, intel: INTEL_ITEMS });
  for (const prohibited of ["减仓", "加仓", "开仓", "仓位", "风险暴露"]) {
    assert.doesNotMatch(publicCopy, new RegExp(prohibited));
  }
});
```

- [ ] **Step 2: Run the model tests and verify RED**

Run: `node --test tests/prototype-model.test.mjs`

Expected: FAIL because `#ipo`, `validateRedemptionCode`, and compliant copy do not exist yet.

- [ ] **Step 3: Implement the minimal model changes**

Update the exported page list and hash compatibility, add the validator below the plan helpers, and rewrite risk/intelligence public strings:

```js
export function validateRedemptionCode(code) {
  const normalized = String(code || "").trim().toUpperCase();
  if (normalized === "JIANSHI-2026-VIP") {
    return { valid: true, expiresAt: "2027-07-31 23:59", message: "兑换成功，会员权益已生效。" };
  }
  return { valid: false, message: "兑换码无效或已失效，请核对后重试。" };
}
```

- [ ] **Step 4: Run model tests and verify GREEN**

Run: `node --test tests/prototype-model.test.mjs`

Expected: all model tests pass.

- [ ] **Step 5: Commit Task 1**

```bash
git add lib/prototype-model.mjs tests/prototype-model.test.mjs
git commit -m "feat: add compliant routing and redemption model"
```

### Task 2: Membership gate, online activation, and code redemption

**Files:**
- Modify: `app/prototype-app.tsx`
- Modify: `tests/prototype-source.test.mjs`

**Interfaces:**
- Consumes: `validateRedemptionCode(code)` from Task 1.
- Produces: `isMember: boolean`, `gateTarget: "risk" | "strategy" | null`, and guarded `navigate(next)` behavior.
- Produces: `MemberGateDialog` with purchase and redemption actions.
- Produces: `MembershipPage({ onActivated, initialMode, onEnterMemberContent })`.
- Produces: payment and redemption success callbacks that call `onActivated()`.

- [ ] **Step 1: Write failing source-contract tests**

Add assertions for the member state, guarded routes, gate copy, redemption code, four redemption states, and activation callbacks:

```js
assert.match(app, /const \[isMember, setIsMember\] = useState\(false\)/);
assert.match(app, /if \(\(next === "risk" \|\| next === "strategy"\) && !isMember\)/);
assert.match(app, /仅会员可查看完整内容/);
assert.match(app, /在线开通/);
assert.match(app, /兑换会员码/);
assert.match(app, /JIANSHI-2026-VIP/);
assert.match(app, /validating/);
assert.match(app, /兑换码无效或已失效/);
assert.match(app, /setIsMember\(true\)/);
```

- [ ] **Step 2: Run the source test and verify RED**

Run: `node --test tests/prototype-source.test.mjs`

Expected: FAIL because membership gating and redemption UI are absent.

- [ ] **Step 3: Implement the access state and gate**

Extend `PageId` with `ipo`, remove `intel`, add access state in `PrototypeApp`, and guard `navigate`. Render a lock marker on the risk and strategy navigation items. Implement an accessible `MemberGateDialog` with:

```tsx
<button onClick={() => { setGateTarget(null); navigate("membership", { mode: "purchase", bypassGate: true }); }}>
  查看会员方案
</button>
<button onClick={() => { setGateTarget(null); setMembershipMode("redeem"); goTo("membership"); }}>
  兑换会员码
</button>
```

The dialog uses the existing `useAccessibleOverlay` helper and restores focus on close.

- [ ] **Step 4: Implement activation and redemption on the membership page**

Add purchase/redeem tabs, controlled input, status messaging, demo-code fill, and a short validation timer. On valid code or payment success call `onActivated`, then allow “进入风控提醒” or “进入策略信号观察”. Keep the timer cleanup in `useEffect`.

- [ ] **Step 5: Run source tests and verify GREEN**

Run: `node --test tests/prototype-source.test.mjs`

Expected: source-contract tests pass.

- [ ] **Step 6: Commit Task 2**

```bash
git add app/prototype-app.tsx tests/prototype-source.test.mjs
git commit -m "feat: gate member research and add code redemption"
```

### Task 3: Merge daily intelligence and add the IPO research page

**Files:**
- Create: `app/ipo-page.tsx`
- Modify: `app/prototype-app.tsx`
- Modify: `app/home-page.tsx`
- Modify: `tests/prototype-source.test.mjs`

**Interfaces:**
- Produces: `IntelSection` rendered inside `TodayPage` with `id="today-intelligence"`.
- Produces: `IPOPage` with progress, monthly timeline, industry map, research cases, batch metadata, and fixed risk notice.
- Consumes: `onNavigate("ipo")` from the homepage and `page === "ipo"` from `PrototypeApp`.

- [ ] **Step 1: Write failing structure tests**

Add source assertions:

```js
for (const label of ["今日决策台", "风控提醒", "策略信号观察", "IPO 专题", "会员服务"]) {
  assert.match(app, new RegExp(label));
}
assert.doesNotMatch(app, /id: "intel"/);
assert.match(app, /id="today-intelligence"/);
assert.match(app, /<IntelSection/);
for (const copy of ["IPO 进程概览", "本月项目时间线", "产业链影响图谱", "专题研究", "数据说明"]) {
  assert.match(ipo, new RegExp(copy));
}
```

- [ ] **Step 2: Run source tests and verify RED**

Run: `node --test tests/prototype-source.test.mjs`

Expected: FAIL because the merged section and IPO page do not exist.

- [ ] **Step 3: Convert `IntelPage` to `IntelSection` and embed it**

Remove the standalone page heading and wrap the existing batch, state, summary, filters, feed, empty and partial states in:

```tsx
<section id="today-intelligence" className="today-intelligence-block" aria-labelledby="today-intelligence-title">
  <PageHeading eyebrow="DAILY INFORMATION BATCH" title="今日信息" description="公开内容摘要、观点变化与市场总结，是今日决策台的一部分。" />
  {/* existing intelligence modules */}
</section>
```

Change action filters to `全部标签`, `关注提升`, `关注降低`, and `持续观察`.

- [ ] **Step 4: Create the IPO page**

Create `app/ipo-page.tsx` with local immutable demo data. Use semantic sections, buttons only where interactive, and no stock-benefit list. The five progress stages are `受理`, `问询`, `注册`, `发行`, and `上市`. Each research case has `已知事实`, `待验证变量`, `产业影响`, and `主要风险` fields.

- [ ] **Step 5: Wire navigation and homepage product entries**

Replace the old information product with the IPO product, change the strategy product name, and make the homepage “今日信息” narrative point into the merged decision desk.

- [ ] **Step 6: Run source tests and verify GREEN**

Run: `node --test tests/prototype-source.test.mjs`

Expected: page and copy contracts pass.

- [ ] **Step 7: Commit Task 3**

```bash
git add app/ipo-page.tsx app/prototype-app.tsx app/home-page.tsx tests/prototype-source.test.mjs
git commit -m "feat: merge daily intelligence and add IPO research"
```

### Task 4: Homepage compliance copy, white visual system, and numeral styling

**Files:**
- Modify: `app/home-page.tsx`
- Modify: `app/prototype-app.tsx`
- Modify: `app/globals.css`
- Modify: `app/layout.tsx`
- Modify: `tests/prototype-source.test.mjs`

**Interfaces:**
- Produces: slogan placement in the hero and lower CTA.
- Produces: white/white-opacity text and icon variables with no cyan text/icon declarations.
- Produces: sans-serif visible numbers and disabled slashed-zero feature.
- Produces: fixed site-wide compliance notice and updated metadata.

- [ ] **Step 1: Write failing compliance and visual tests**

Add assertions that the finished source contains the slogan twice, contains the fixed notice, uses “2 套策略”, and excludes prohibited marketing:

```js
assert.equal((home.match(/数据为据，决策有衡/g) ?? []).length, 2);
assert.match(app, /本平台提供公开信息整理、数据展示与标准化模型结果/);
assert.match(home, /2 套策略/);
for (const prohibited of ["15%", "年化复利", "历史业绩", "十套策略", "10 套策略", "买什么", "荐股"]) {
  assert.doesNotMatch(home + app, new RegExp(prohibited));
}
assert.match(css, /font-feature-settings:\s*"zero" 0/);
assert.doesNotMatch(css, /ui-monospace|Consolas/);
assert.match(css, /--brand:\s*#ffffff/i);
```

- [ ] **Step 2: Run source tests and verify RED**

Run: `node --test tests/prototype-source.test.mjs`

Expected: FAIL on old performance, strategy-count, cyan and numeral contracts.

- [ ] **Step 3: Rewrite homepage and product copy**

Remove both performance blocks, replace the fourth proof cell with a research-data statement, change all strategy counts to 2, place the slogan in hero and CTA, and add the dated data-footnote. Rewrite metadata to “见势研究 · A股数据与信息研究平台”.

- [ ] **Step 4: Apply the white visual and numeral system**

Set core text/icon variables to white opacity tiers, override icon-bearing components with `color: currentColor`, preserve red/orange/yellow backgrounds and the approved blue CTA hover, and ensure visible numeral selectors inherit the system sans font. Add:

```css
body {
  font-variant-numeric: tabular-nums lining-nums;
  font-feature-settings: "zero" 0;
}

.home-kicker,
.product-number,
.proof-value,
.service-step time,
.score-orbit span,
.candidate-table,
.plan-price,
.batch-card dd {
  font-family: inherit;
  font-feature-settings: "zero" 0;
}
```

- [ ] **Step 5: Add the fixed notice to the workspace and footer areas**

Render one persistent notice below each product page and a shorter link-style notice on the homepage. Text must match the Global Constraints exactly.

- [ ] **Step 6: Run source tests and verify GREEN**

Run: `node --test tests/prototype-source.test.mjs`

Expected: compliance, copy, color, CTA, numeral, and accessibility contracts pass.

- [ ] **Step 7: Commit Task 4**

```bash
git add app/home-page.tsx app/prototype-app.tsx app/globals.css app/layout.tsx tests/prototype-source.test.mjs
git commit -m "style: align brand visuals and compliant copy"
```

### Task 5: End-to-end member, merged-intel, IPO, mobile, and deployment verification

**Files:**
- Modify: `tests/browser-smoke.mjs`
- Modify: `tests/rendered-html.test.mjs`
- Modify: `README.md`

**Interfaces:**
- Consumes: all page, access, payment, redemption, merge and visual behavior from Tasks 1–4.
- Produces: automated evidence for desktop and 390px behavior.

- [ ] **Step 1: Write failing browser flow checks**

Add flows that:

1. Confirm five navigation labels and no standalone “今日信息”.
2. Click risk as a visitor and verify the member gate.
3. Open membership redemption, submit an invalid code, then submit `JIANSHI-2026-VIP` and enter risk.
4. Refresh, verify locked state returns, simulate payment success, and enter strategy.
5. Verify merged intelligence filters inside today.
6. Verify all five IPO sections.
7. At 390px verify no horizontal overflow and the five mobile labels `今日 / 风控 / 信号 / IPO / 我的`.
8. Inspect representative kicker and icon computed colors as white/white-opacity and representative number font families as non-monospace.

- [ ] **Step 2: Run the browser smoke test and verify RED**

Run: `$env:CDP_PORT='9222'; $env:APP_BASE='http://localhost:5174'; node tests/browser-smoke.mjs`

Expected: FAIL until the new flows are implemented in the test and app.

- [ ] **Step 3: Update browser and rendered-HTML tests**

Update route expectations and payment flow selectors. Keep browser error collection and screenshots. Update the server-render test to require the slogan, “2 套策略”, data-platform metadata, and absence of “15%”.

- [ ] **Step 4: Update README prototype scope**

Document the merged page, IPO page, in-memory membership gate, demo code, two strategy models, and information-aggregation disclaimer.

- [ ] **Step 5: Run the full verification suite**

Run:

```powershell
npm.cmd test
npm.cmd run lint
$env:CDP_PORT='9222'; $env:APP_BASE='http://localhost:5174'; node tests/browser-smoke.mjs
git diff --check
git status --short
```

Expected: unit/source/render tests pass, production build succeeds, lint exits 0, browser flows pass with `browserErrors: []`, diff check exits 0, and only intended files are present before the final commit.

- [ ] **Step 6: Commit Task 5**

```bash
git add tests/browser-smoke.mjs tests/rendered-html.test.mjs README.md
git commit -m "test: cover compliant member research flows"
```

- [ ] **Step 7: Publish the validated commit**

Use the existing `.openai/hosting.json` project, push the exact validated HEAD, package the matching `dist`, save one Sites version, deploy it to the already-approved public access level, poll to success, verify HTTP 200 and the slogan/IPO copy, and open the exact deployed URL in the in-app browser.
