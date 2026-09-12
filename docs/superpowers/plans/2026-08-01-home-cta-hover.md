# Homepage CTA Hover Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (- [ ]) syntax for tracking.

**Goal:** Make the four homepage CTA buttons white with black text by default, then blue with white text on hover, with a reversing square arrow treatment.

**Architecture:** Keep the current homepage component and action class names. Scope all new visual rules under .home-page so the fixed header CTA and product-page controls retain their current behavior; add one existing Lucide arrow to the only CTA that currently lacks an icon.

**Tech Stack:** React 19, TypeScript, CSS, Lucide React, Node test runner, Edge CDP browser smoke test, Sites hosting.

## Global Constraints

- Apply the new treatment only to the four CTA controls inside .hero-actions and .home-cta-actions.
- Default state is #ffffff background with #060911 text.
- Hover state is #176bff background with white text.
- Default arrow square is #060911 with a white icon; hover reverses it to white with a #176bff icon.
- Preserve button copy, destinations, Hash routing, full-width mobile layout, and a minimum 50px mobile touch height.
- Do not alter .header-cta, product entry buttons, or product-page controls.
- Add no dependency.

---

### Task 1: Homepage CTA visual contract and interaction

**Files:**
- Modify: tests/prototype-source.test.mjs
- Modify: tests/browser-smoke.mjs
- Modify: app/home-page.tsx
- Modify: app/globals.css

**Interfaces:**
- Consumes: existing primary-action, secondary-action, hero-actions, and home-cta-actions markup.
- Produces: four homepage CTA controls sharing one scoped visual contract; hoverSelector(selector: string): Promise<void> in the browser smoke test.

- [ ] **Step 1: Write the failing source-contract test**

Add these assertions to tests/prototype-source.test.mjs:

~~~js
assert.match(home, /先看今日决策\s*<ArrowRight size=\{20\}\s*\/>/);
assert.match(css, /\.home-page \.primary-action,\s*\.home-page \.secondary-action\s*\{[^}]*background:\s*#fff[^}]*color:\s*#060911/s);
assert.match(css, /\.home-page \.primary-action:hover,\s*\.home-page \.secondary-action:hover\s*\{[^}]*background:\s*#176bff[^}]*color:\s*#fff/s);
assert.match(css, /\.home-page :is\(\.primary-action, \.secondary-action\) > svg\s*\{[^}]*background:\s*#060911[^}]*color:\s*#fff/s);
assert.match(css, /\.home-page :is\(\.primary-action, \.secondary-action\):hover > svg\s*\{[^}]*background:\s*#fff[^}]*color:\s*#176bff/s);
~~~

- [ ] **Step 2: Run the source test and confirm RED**

Run:

~~~powershell
npm.cmd run test:unit
~~~

Expected: the production-page source test fails because the bottom arrow and scoped white/blue CTA rules do not exist.

- [ ] **Step 3: Add the failing browser hover contract**

Add hoverSelector to tests/browser-smoke.mjs. It resolves the target bounding box, sends Input.dispatchMouseEvent with type mouseMoved to the center point, and waits 220ms.

At 1440px, assert:

~~~js
assert.deepEqual(defaultCta, {
  background: "rgb(255, 255, 255)",
  color: "rgb(6, 9, 17)",
  iconBackground: "rgb(6, 9, 17)",
  iconColor: "rgb(255, 255, 255)",
  headerBackground: "rgb(39, 216, 194)",
});
await hoverSelector(".hero-actions .primary-action");
assert.deepEqual(hoverCta, {
  background: "rgb(23, 107, 255)",
  color: "rgb(255, 255, 255)",
  iconBackground: "rgb(255, 255, 255)",
  iconColor: "rgb(23, 107, 255)",
});
~~~

defaultCta and hoverCta read the computed background and color from .hero-actions .primary-action and its direct svg. defaultCta also reads .header-cta to prove the header remains teal.

- [ ] **Step 4: Run the browser smoke test and confirm RED**

~~~powershell
node tests/browser-smoke.mjs
~~~

Expected: it fails on the default CTA background because the existing button is teal.

- [ ] **Step 5: Implement the minimal markup**

In app/home-page.tsx, change the bottom secondary CTA to:

~~~tsx
<button type="button" className="secondary-action" onClick={() => onNavigate("today")}>
  先看今日决策 <ArrowRight size={20} />
</button>
~~~

- [ ] **Step 6: Implement the scoped visual states**

Append these rules to app/globals.css:

~~~css
.home-page .primary-action,
.home-page .secondary-action {
  min-height: 64px;
  padding: 7px 7px 7px 28px;
  justify-content: space-between;
  gap: 24px;
  border-color: #fff;
  border-radius: 0;
  background: #fff;
  color: #060911;
}

.home-page :is(.primary-action, .secondary-action) > svg {
  width: 46px;
  height: 46px;
  padding: 12px;
  flex: 0 0 46px;
  box-sizing: border-box;
  background: #060911;
  color: #fff;
  transition: background .2s ease, color .2s ease, transform .2s ease;
}

@media (hover: hover) {
  .home-page .primary-action:hover,
  .home-page .secondary-action:hover {
    border-color: #176bff;
    background: #176bff;
    color: #fff;
    transform: translateY(-1px);
  }

  .home-page :is(.primary-action, .secondary-action):hover > svg {
    background: #fff;
    color: #176bff;
    transform: translateX(2px);
  }
}

.home-page :is(.primary-action, .secondary-action):focus-visible {
  outline: 3px solid #176bff;
  outline-offset: 4px;
}
~~~

Extend the existing reduced-motion block so these buttons and their direct SVG use transition: none and transform: none.

- [ ] **Step 7: Run focused tests and confirm GREEN**

~~~powershell
npm.cmd run test:unit
node tests/browser-smoke.mjs
~~~

Expected: all six unit/source tests and all browser paths pass; browser errors remain empty.

- [ ] **Step 8: Commit the implementation**

~~~powershell
git add app/home-page.tsx app/globals.css tests/prototype-source.test.mjs tests/browser-smoke.mjs
git commit -m "style: update homepage CTA interactions"
~~~

### Task 2: Final validation and public preview update

**Files:**
- Verify: app/home-page.tsx
- Verify: app/globals.css
- Verify: tests/prototype-source.test.mjs
- Verify: tests/browser-smoke.mjs
- Package: .openai/hosting.json and dist/**

**Interfaces:**
- Consumes: the committed CTA implementation and the existing Sites project_id in .openai/hosting.json.
- Produces: a validated public Sites version at the existing site URL.

- [ ] **Step 1: Run the complete verification suite**

~~~powershell
npm.cmd test
npm.cmd run lint
git diff --check
git status --short
~~~

Expected: unit/source tests pass, production build succeeds, rendered HTML test passes, lint reports no errors, and the worktree is clean.

- [ ] **Step 2: Push the exact validated commit**

Read .openai/hosting.json, request a fresh short-lived Sites source credential, and push the current HEAD to the returned branch with a per-command HTTP authorization header. Do not persist or print the credential.

- [ ] **Step 3: Package and publish the same state**

Package dist/ with .openai/hosting.json, save a new Sites version with the pushed HEAD SHA, deploy that saved version to the existing public project, and poll until status is succeeded.

- [ ] **Step 4: Verify and open the deployed page**

Confirm the live URL returns HTTP 200 and contains the current homepage copy, then open that exact URL in the in-app browser.

