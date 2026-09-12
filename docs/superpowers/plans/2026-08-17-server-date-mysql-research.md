# Server Date and MySQL Research Integration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Convert the existing 803见势研究 prototype to a self-hosted Next.js Node application whose research page headers use server time, whose four research modules read MySQL-backed data with `XX` fallbacks, and whose strategy page contains only strategy01.

**Architecture:** Preserve the current React UI and hash navigation, replace Vinext/Cloudflare runtime files with standard Next.js Node output, and expose server-only MySQL repositories through five read-only Route Handlers. Store/query structured batch results using the approved hybrid schema design; JSON is limited to flexible evidence/timeline/metric payloads. Database schema SQL is proposal-only until the user separately authorizes DDL.

**Tech Stack:** Next.js 16 App Router, React 19, TypeScript, Node.js 22, `mysql2`, native `node:test`, CSS, MySQL 8.

## Global Constraints

- Do not execute `CREATE`, `ALTER`, `DROP`, `INSERT`, `UPDATE`, `DELETE`, `REPLACE`, `TRUNCATE`, grants, or migrations against the supplied database.
- Do not commit or print database/SSH passwords; runtime secrets come only from ignored environment variables.
- Production connects directly to MySQL on the same server; SSH tunneling is an administrator/local-development concern only.
- Only title/header “today” labels use server time in `Asia/Shanghai`; historical/business dates come from database rows.
- Research data must never fall back to the current static demo values. Missing values render as `XX`; numeric zero remains `0`.
- Membership purchase/payment/redeem behavior remains a local prototype in this iteration.
- Strategy02 `quality` / “估值修复” is removed completely. Strategy01 code is `momentum-gap-volume`.
- Do not publish. Keep the verified local development server available for review.

---

### Task 1: Move the runtime from Vinext/Cloudflare to standard Next.js Node

**Files:**
- Modify: `package.json`
- Modify: `package-lock.json`
- Create: `next.config.ts`
- Delete: `vite.config.ts`
- Delete: `worker/index.ts`
- Delete: `build/sites-vite-plugin.ts`
- Delete: `db/index.ts`
- Delete: `db/schema.ts`
- Delete: `drizzle.config.ts`
- Modify: `tests/rendered-html.test.mjs`
- Modify: `tests/prototype-source.test.mjs`

**Interfaces:**
- Produces: `npm run dev`, `npm run build`, and `npm run start` backed by official Next.js.
- Produces: standalone production output under `.next/standalone`.

- [ ] **Step 1: Write failing runtime-source tests**

Add assertions that scripts use `next`, `next.config.ts` contains `output: "standalone"`, and Vinext/Cloudflare worker entry points are absent:

```js
test("the project targets the standard Next.js Node runtime", async () => {
  const pkg = JSON.parse(await readFile(new URL("../package.json", import.meta.url), "utf8"));
  assert.equal(pkg.scripts.dev, "next dev");
  assert.equal(pkg.scripts.build, "next build");
  assert.equal(pkg.scripts.start, "next start");
  assert.equal(pkg.dependencies.mysql2 !== undefined, true);
  assert.equal(pkg.dependencies.vinext, undefined);
  await assert.rejects(readFile(new URL("../worker/index.ts", import.meta.url)));
});
```

- [ ] **Step 2: Run the focused test and verify RED**

Run: `node --test --test-name-pattern "standard Next.js Node runtime" tests/prototype-source.test.mjs`

Expected: FAIL because scripts still invoke Vinext and `mysql2` is absent.

- [ ] **Step 3: Replace runtime dependencies and configuration**

Set scripts to `next dev/build/start`, retain `next`, `react`, `react-dom`, `lucide-react`, add `mysql2`, and remove Vinext/Vite/Cloudflare/Drizzle-only dependencies. Create:

```ts
import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "standalone",
  reactStrictMode: true,
};

export default nextConfig;
```

Regenerate `package-lock.json` with npm. Rewrite server-render verification to start `next start` on an ephemeral local port after `next build`, request `/`, and terminate only that child process. Remove `runnerImport` usage from source tests; assert source/model behavior through native imports and HTTP-render tests.

- [ ] **Step 4: Verify GREEN**

Run: `npm run build && node --test --test-name-pattern "standard Next.js Node runtime" tests/prototype-source.test.mjs`

Expected: PASS; `.next/standalone/server.js` exists.

- [ ] **Step 5: Commit**

```bash
git add package.json package-lock.json next.config.ts tests
git add -u vite.config.ts worker build db drizzle.config.ts
git commit -m "build: migrate site to nextjs node runtime"
```

### Task 2: Add server-time contracts and dynamic header refresh

**Files:**
- Create: `lib/research/contracts.ts`
- Create: `lib/server/system-context.ts`
- Create: `app/api/system/context/route.ts`
- Create: `app/use-server-context.ts`
- Modify: `app/page.tsx`
- Modify: `app/prototype-app.tsx`
- Modify: `app/home-page.tsx`
- Modify: `app/ipo-page.tsx`
- Create: `tests/research-contracts.test.mjs`
- Create: `tests/system-context.test.mjs`

**Interfaces:**
- Produces: `ResearchResponse<T>`, `ResearchStatus`, `displayValue(value)`, `SystemContext`, `getSystemContext(now?)`.
- Produces: `GET /api/system/context` with `Cache-Control: no-store`.
- Produces: `useServerContext(initialContext)` for five-minute/visibility refreshes.

- [ ] **Step 1: Write failing contract and time tests**

```js
test("displayValue preserves zero and replaces missing values", () => {
  assert.equal(displayValue(0), "0");
  assert.equal(displayValue(null), "XX");
  assert.equal(displayValue(undefined), "XX");
  assert.equal(displayValue(""), "XX");
});

test("system context formats the server instant in Shanghai", () => {
  const context = getSystemContext(new Date("2026-08-16T16:30:00.000Z"));
  assert.equal(context.serverDate, "2026-08-17");
  assert.equal(context.compactDate, "08/17");
  assert.equal(context.dottedDate, "2026.08.17");
  assert.equal(context.timezone, "Asia/Shanghai");
});
```

- [ ] **Step 2: Verify RED**

Run: `node --test tests/research-contracts.test.mjs tests/system-context.test.mjs`

Expected: FAIL because the modules do not exist.

- [ ] **Step 3: Implement the pure contracts and system endpoint**

Implement the exact envelope:

```ts
export type ResearchStatus = "ready" | "pending" | "partial" | "missing" | "failed";
export type ResearchResponse<T> = {
  serverDate: string;
  timezone: "Asia/Shanghai";
  status: ResearchStatus;
  batchId: string | null;
  dataAsOf: string | null;
  missingFields: string[];
  data: T;
};
```

`getSystemContext()` must derive all formatted strings from one server `Date` using `Intl.DateTimeFormat(..., { timeZone: "Asia/Shanghai" })`. The route returns `dynamic = "force-dynamic"` and `Cache-Control: no-store, max-age=0`.

- [ ] **Step 4: Wire server time into headers**

Make `app/page.tsx` async, pass an initial context into `PrototypeApp`, and remove research-date imports from `RESEARCH_SNAPSHOT`. `useServerContext` re-fetches `/api/system/context` every 300,000 ms and on `visibilitychange`; it schedules requests using timers but displays only server-returned dates. Use `dottedDate` on the homepage and `compactDate` on Today/Risk/Strategy/IPO headings.

- [ ] **Step 5: Verify GREEN and hydration safety**

Run: `node --test tests/research-contracts.test.mjs tests/system-context.test.mjs && npm run build`

Expected: PASS with no hydration/date mismatch.

- [ ] **Step 6: Commit**

```bash
git add app lib tests
git commit -m "feat: derive research header dates from server time"
```

### Task 3: Add a read-only MySQL boundary and schema audit

**Files:**
- Create: `lib/server/mysql.ts`
- Create: `lib/server/query.ts`
- Create: `scripts/audit-mysql-schema.mjs`
- Create: `.env.example`
- Modify: `.gitignore`
- Create: `tests/mysql-boundary.test.mjs`
- Create: `docs/database/current-schema-audit.md`

**Interfaces:**
- Produces: `getReadPool(): Pool`, `queryRows<T>(sql, params): Promise<T[]>`, `assertReadOnlySql(sql): void`.
- Consumes env: `MYSQL_HOST`, `MYSQL_PORT`, `MYSQL_DATABASE`, `MYSQL_USER`, `MYSQL_PASSWORD`, `MYSQL_CONNECTION_LIMIT`.
- Produces audit command: `npm run db:audit`.

- [ ] **Step 1: Write the failing SQL guard tests**

```js
test("read-only guard accepts SELECT and rejects mutations", () => {
  assert.doesNotThrow(() => assertReadOnlySql("SELECT * FROM information_schema.TABLES"));
  assert.throws(() => assertReadOnlySql("CREATE TABLE forbidden(id int)"), /read-only/i);
  assert.throws(() => assertReadOnlySql("UPDATE daily SET close = 0"), /read-only/i);
  assert.throws(() => assertReadOnlySql("SELECT 1; DELETE FROM daily"), /read-only/i);
});
```

- [ ] **Step 2: Verify RED**

Run: `node --test tests/mysql-boundary.test.mjs`

Expected: FAIL because the guard does not exist.

- [ ] **Step 3: Implement the server-only connection and guard**

Use `mysql2/promise`, a lazily initialized pool, `decimalNumbers: true`, `timezone: "+08:00"`, and `multipleStatements: false`. `queryRows` calls `assertReadOnlySql`, allows only `SELECT`, `SHOW`, `DESCRIBE`, `EXPLAIN`, or `WITH ... SELECT`, and never logs connection options.

- [ ] **Step 4: Implement the schema audit script**

Query only `information_schema.TABLES`, `COLUMNS`, and `STATISTICS` for non-system schemas. Output table/column/index names and a reuse recommendation; never sample user data and never issue DDL/DML. Add the known export baseline (`adj_factor`, `daily`, `daily_basic`, `index_basic`, `index_daily`) and note `call_auction` as “referenced, verify live”.

- [ ] **Step 5: Run only the safe audit when environment variables are available**

Run: `npm run db:audit`

Expected: a read-only inventory. If no tunnel/listener is available, record that limitation in `docs/database/current-schema-audit.md`; do not weaken the guard or persist supplied credentials.

- [ ] **Step 6: Verify GREEN**

Run: `node --test tests/mysql-boundary.test.mjs && git grep -nE "(MYSQL_PASSWORD|SSH_PASSWORD)=.+" -- ':!docs/superpowers/*'`

Expected: tests PASS and the secret scan prints nothing (a no-match exit code is acceptable).

- [ ] **Step 7: Commit**

```bash
git add lib/server scripts tests .env.example .gitignore docs/database/current-schema-audit.md package.json package-lock.json
git commit -m "feat: add read only mysql access boundary"
```

### Task 4: Document the hybrid schema without executing it

**Files:**
- Create: `docs/database/mysql-research-schema-proposal.sql`
- Create: `docs/database/frontend-table-map.md`
- Create: `tests/schema-proposal.test.mjs`

**Interfaces:**
- Produces proposal tables exactly named: `stock_basic`, `trade_calendar`, `stock_limit_price`, `external_market_quote`, `market_event`, `intel_item`, `research_batch`, `daily_decision_snapshot`, `risk_snapshot`, `risk_signal_result`, `strategy_definition`, `strategy_run`, `strategy_funnel_result`, `strategy_candidate`, `ipo_company`, `ipo_stage_event`, `ipo_metric_snapshot`, `ipo_subscription_analysis`, `ipo_valuation_scenario`.

- [ ] **Step 1: Write a failing proposal-safety test**

```js
test("schema proposal is explicitly non-executable and covers every module", async () => {
  const sql = await readFile(new URL("../docs/database/mysql-research-schema-proposal.sql", import.meta.url), "utf8");
  assert.match(sql, /DO NOT EXECUTE WITHOUT EXPLICIT USER APPROVAL/);
  for (const table of REQUIRED_PROPOSAL_TABLES) assert.match(sql, new RegExp(`CREATE TABLE \\`${table}\\``));
  assert.doesNotMatch(sql, /DROP TABLE|TRUNCATE|INSERT INTO/i);
});
```

- [ ] **Step 2: Verify RED**

Run: `node --test tests/schema-proposal.test.mjs`

Expected: FAIL because the proposal does not exist.

- [ ] **Step 3: Write the proposal and page map**

Use `utf8mb4`, InnoDB, `BIGINT UNSIGNED` surrogate keys, unique module/batch/trade-date keys, foreign keys between result tables, `DATETIME(3)` in `Asia/Shanghai`, `DECIMAL` for money/rates, and JSON only for `summary_points_json`, `timeline_json`, `kill_conditions_json`, `rules_json`, `evidence_json`, and `metrics_json`. Add indexes for latest-successful-batch and candidate filters. Do not add seed data.

`frontend-table-map.md` must map every displayed field group to source table/column and state `XX` for missing data.

- [ ] **Step 4: Verify GREEN without touching MySQL**

Run: `node --test tests/schema-proposal.test.mjs`

Expected: PASS. Do not run the SQL file.

- [ ] **Step 5: Commit**

```bash
git add docs/database tests/schema-proposal.test.mjs
git commit -m "docs: propose hybrid research database schema"
```

### Task 5: Implement read-only research repositories and APIs

**Files:**
- Create: `lib/server/repositories/repository-helpers.ts`
- Create: `lib/server/repositories/today.ts`
- Create: `lib/server/repositories/risk.ts`
- Create: `lib/server/repositories/strategy.ts`
- Create: `lib/server/repositories/ipo.ts`
- Create: `app/api/research/today/route.ts`
- Create: `app/api/research/risk/route.ts`
- Create: `app/api/research/strategy/route.ts`
- Create: `app/api/research/ipo/route.ts`
- Create: `tests/research-repositories.test.mjs`
- Create: `tests/research-routes.test.mjs`

**Interfaces:**
- Produces: `getTodayResearch(query?)`, `getRiskResearch(query?)`, `getStrategyResearch(query?)`, `getIpoResearch(query?)`.
- Each returns `Promise<ResearchResponse<ModuleData>>` and accepts injected `queryRows` in tests.

- [ ] **Step 1: Write failing repository tests for ready/missing/partial states**

```js
test("strategy repository returns a stable missing response when no successful batch exists", async () => {
  const result = await getStrategyResearch(async () => []);
  assert.equal(result.status, "missing");
  assert.equal(result.batchId, null);
  assert.deepEqual(result.data.candidates, []);
  assert.ok(result.missingFields.includes("strategy.batch"));
});

test("zero values survive a partial risk batch", async () => {
  const result = await getRiskResearch(fixtureQuery({ score: 0, signals: [] }));
  assert.equal(result.data.snapshot.score, 0);
  assert.equal(result.status, "partial");
});
```

- [ ] **Step 2: Verify RED**

Run: `node --test tests/research-repositories.test.mjs`

Expected: FAIL because repositories do not exist.

- [ ] **Step 3: Implement latest-successful-batch queries and stable defaults**

Every repository first selects `research_batch` by `module`, `status = 'succeeded'`, newest `trade_date/completed_at`. It then loads module details in parallel. Missing table (`ER_NO_SUCH_TABLE`) returns `missing`; missing child rows return `partial`; connection/query errors return `failed`. No static model constant may be imported.

- [ ] **Step 4: Implement no-store Route Handlers**

Each route exports `runtime = "nodejs"`, `dynamic = "force-dynamic"`, calls its repository, returns HTTP 200 for `ready/pending/partial/missing`, HTTP 503 for `failed`, and sets `Cache-Control: no-store, max-age=0`.

- [ ] **Step 5: Verify GREEN**

Run: `node --test tests/research-repositories.test.mjs tests/research-routes.test.mjs`

Expected: PASS; response objects never contain `MYSQL_*`, password, host, or raw driver errors.

- [ ] **Step 6: Commit**

```bash
git add app/api/research lib/server/repositories tests
git commit -m "feat: expose read only research data APIs"
```

### Task 6: Remove strategy02 and implement strategy01 batch calculation

**Files:**
- Create: `lib/strategy/momentum-gap-volume.mjs`
- Create: `scripts/run-momentum-strategy.mjs`
- Modify: `lib/prototype-model.mjs`
- Modify: `app/prototype-app.tsx`
- Modify: `app/home-page.tsx`
- Modify: `tests/prototype-model.test.mjs`
- Modify: `tests/prototype-source.test.mjs`
- Modify: `tests/browser-smoke.mjs`
- Create: `tests/momentum-strategy.test.mjs`

**Interfaces:**
- Produces: `evaluateMomentumUniverse(rows, rules)` returning `{ funnel, official, near }`.
- Runner defaults to dry-run; database writes require both `--write` and `ALLOW_DB_WRITES=true` after explicit user authorization.

- [ ] **Step 1: Write failing removal and calculation tests**

```js
test("the strategy model exposes only momentum-gap-volume", async () => {
  const app = await readFile(new URL("../app/prototype-app.tsx", import.meta.url), "utf8");
  const model = await readFile(new URL("../lib/prototype-model.mjs", import.meta.url), "utf8");
  assert.doesNotMatch(app + model, /quality|策略 02|好公司估值修复/);
});

test("momentum evaluation separates official and near candidates", () => {
  const result = evaluateMomentumUniverse(FIXTURE_ROWS, FIXTURE_RULES);
  assert.deepEqual(result.funnel.map((step) => step.count), [3, 3, 2, 1, 1]);
  assert.deepEqual(result.official.map((row) => row.tsCode), ["000001.SZ"]);
  assert.deepEqual(result.near.map((row) => row.tsCode), ["000002.SZ"]);
});
```

- [ ] **Step 2: Verify RED**

Run: `node --test tests/momentum-strategy.test.mjs tests/prototype-model.test.mjs`

Expected: FAIL because quality candidates still exist and the evaluator is absent.

- [ ] **Step 3: Remove strategy02 from UI/model**

Delete `StrategyId = "quality"`, the quality strategy definition, quality candidates, selector state/UI, quality funnel branch, and all tests/clicks for strategy02. Change homepage proof/copy from two strategies to one strategy. Keep the single strategy header and formal/near tabs.

- [ ] **Step 4: Implement the pure evaluator and guarded runner**

The evaluator accepts rules rather than hardcoding thresholds. It processes real row inputs containing trade date, adjusted history percentile, gap percent, volume ratio, close/high validation, and stock metadata; it returns counts and evidence. The runner reads the latest common trade date from `daily`, `daily_basic`, `adj_factor`, and optional `call_auction`, reads `rules_json` from `strategy_definition`, and prints a dry-run summary. Write mode must refuse unless both gates are present; do not execute write mode in this task.

- [ ] **Step 5: Verify GREEN**

Run: `node --test tests/momentum-strategy.test.mjs tests/prototype-model.test.mjs tests/prototype-source.test.mjs`

Expected: PASS and `rg -n "quality|策略 02|好公司估值修复" app lib tests` returns no strategy02 implementation matches.

- [ ] **Step 6: Commit**

```bash
git add app lib scripts tests package.json
git commit -m "feat: keep only momentum strategy pipeline"
```

### Task 7: Replace static research page data with API-backed states

**Files:**
- Create: `app/use-research-module.ts`
- Modify: `app/prototype-app.tsx`
- Modify: `app/ipo-page.tsx`
- Modify: `lib/prototype-model.mjs`
- Modify: `tests/prototype-source.test.mjs`
- Modify: `tests/browser-smoke.mjs`
- Modify: `tests/rendered-html.test.mjs`

**Interfaces:**
- Produces: `useResearchModule<T>(endpoint, emptyData)` returning `{ response, loading, refresh }`.
- Consumes the four `/api/research/*` endpoints.

- [ ] **Step 1: Write failing source and browser-state tests**

Assert that research pages contain API endpoints, no longer import `RISK_SCENARIOS`, `CANDIDATES`, `INTEL_ITEMS`, IPO company arrays, or research batch fields from `RESEARCH_SNAPSHOT`, and expose `data-research-status` for `ready`, `partial`, `missing`, and `failed`.

- [ ] **Step 2: Verify RED**

Run: `node --test --test-name-pattern "database-backed research|missing research data" tests/prototype-source.test.mjs tests/rendered-html.test.mjs`

Expected: FAIL because pages still render static research constants.

- [ ] **Step 3: Implement the hook and Today/Risk rendering**

Fetch with `cache: "no-store"`, abort on unmount, retain stable empty shapes, and refresh on page entry/visibility. Replace Today decision, risk summary/signals/timeline/kill conditions, candidate preview, information feed, and events with response fields. Each leaf uses `displayValue`; status blocks distinguish pending/missing/failed.

- [ ] **Step 4: Implement Strategy rendering**

Render strategy definition, batch, funnel, official/near candidates, and evidence from `/api/research/strategy`. If result tables do not exist, show the strategy01 structure and `XX` values without static candidate rows.

- [ ] **Step 5: Implement IPO rendering**

Move all IPO companies, stages, comparisons, subscription analysis, valuation scenarios, and commercial-space events to `/api/research/ipo`. Keep the existing layout and removed-module decisions. Historical event dates display only database values; missing values display `XX`.

- [ ] **Step 6: Remove remaining static research snapshots**

Keep only navigation helpers, IPO pure math helpers, and membership demo helpers in `prototype-model.mjs`. Rename membership-only snapshot data to `MEMBERSHIP_DEMO` so research code cannot accidentally import it.

- [ ] **Step 7: Verify GREEN**

Run: `npm test && npm run lint`

Expected: all tests PASS; source scan finds no hardcoded research date/batch IDs, quality strategy, or static research candidate/intelligence/IPO arrays in research page code. Membership-only demo timestamps remain out of scope.

- [ ] **Step 8: Commit**

```bash
git add app lib tests
git commit -m "feat: render research modules from mysql APIs"
```

### Task 8: Local end-to-end verification and operator documentation

**Files:**
- Modify: `README.md`
- Create: `docs/deployment/self-hosted-node.md`
- Modify: `tests/browser-smoke.mjs`

**Interfaces:**
- Documents local run, production standalone run, environment variables, read-only database account, schema authorization gate, cron command, and rollback.

- [ ] **Step 1: Update browser smoke expectations**

Test `#home`, `#today`, `#risk`, `#strategy`, and `#ipo`; verify the page header matches `/api/system/context`, strategy02 is absent, missing database fields show `XX`, navigation remains usable, and there are no console/runtime errors. Do not require static market values.

- [ ] **Step 2: Write operator documentation**

Document Node.js `>=22.13.0`, `npm ci`, `npm run build`, `npm run start`, environment variable setup, same-host MySQL networking, least-privilege accounts, and `16:10` batch scheduling. State that `mysql-research-schema-proposal.sql` must not be run until explicit approval.

- [ ] **Step 3: Run the complete verification suite**

Run: `npm run test:unit && npm run lint && npm run build && node --test tests/rendered-html.test.mjs`

Expected: PASS.

- [ ] **Step 4: Start the local server and run browser smoke**

Run `npm run dev` in a retained session, use its printed local URL, then run `node tests/browser-smoke.mjs` with the required local base URL/CDP settings.

Expected: all routes load, dates come from the server endpoint, missing data is honest, and no strategy02 copy is present.

- [ ] **Step 5: Confirm database safety and worktree state**

Run:

```bash
git grep -nE "(MYSQL_PASSWORD|SSH_PASSWORD)=.+" -- .
git status --short
```

Expected: no credentials found; only intentional changes present. Confirm no database mutation command was executed.

- [ ] **Step 6: Commit**

```bash
git add README.md docs/deployment tests/browser-smoke.mjs
git commit -m "docs: add self hosted research operations guide"
```

## Final Acceptance

- Standard Next.js Node build runs locally and produces standalone output.
- Home/Today/Risk/Strategy/IPO header dates equal the current Shanghai server date without client-clock rendering.
- Research pages contain no static research values and show `XX` for absent database fields.
- Strategy page exposes only `momentum-gap-volume`; strategy02 and its candidates are absent.
- APIs are server-only, no-store, stable under empty/missing tables, and never expose credentials or raw errors.
- Hybrid schema and frontend mapping exist as reviewable documents only; no DDL/DML has been executed.
- Full tests, lint, build, rendered HTML, and local browser smoke pass.
