# 803 研究轨道与 IPO 最新数据迭代 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 实现立体可悬停的决策轨道球，精简首页为四个产品模块，统一 2026-08-03 数据快照，并扩展 IPO 申购、中签、估值和商业航天进度研究。

**Architecture:** 在现有 Canvas 2D 轨道上增加可测试的景深、球体半径和命中检测纯函数，画布组件只管理绘制和指针状态。日期与 IPO 计算集中在 `lib/prototype-model.mjs`，`app/ipo-page.tsx` 只负责组合已标注为实际值或测算值的界面数据。

**Tech Stack:** Next.js 16 App Router、React 19、TypeScript、Canvas 2D、CSS、Node `node:test`、Vinext。

## Global Constraints

- 数据快照日期固定为 `2026-08-03`，真实 IPO 历史日期不可伪更新。
- 宇树科技未完成发行的定价、中签率和流通市值必须显示“测算”。
- 商业航天项目使用正式简称“蓝箭航天”和“中科宇航”。
- IPO 页面不再出现“观察变量与主要风险”模块。
- 不引入 Three.js、WebGL 库或其他新依赖。
- 保留顶部会员导航、会员页和首页底部会员 CTA，仅删除首页两处产品模块中的会员项。
- 仅保留本地分支与工作树，不发布、不推送、不创建 PR。

---

### Task 1: 统一快照日期与 IPO 计算模型

**Files:**
- Modify: `lib/prototype-model.mjs`
- Modify: `tests/prototype-model.test.mjs`

**Interfaces:**
- Consumes: 现有 `getPlanExpiry()` 和 `validateRedemptionCode()` 模型。
- Produces: `RESEARCH_SNAPSHOT`、`getReferenceIssuePrice(raiseYuan, issueShares)`、`getAtLeastOneHitProbability(ratePercent, allocationNumbers)`、`getMarketCapYi(priceYuan, shares)`。

- [ ] **Step 1: 为日期与计算写失败测试**

```js
import {
  RESEARCH_SNAPSHOT,
  getAtLeastOneHitProbability,
  getMarketCapYi,
  getReferenceIssuePrice,
} from "../lib/prototype-model.mjs";

test("research snapshot uses the current August 3 batch", () => {
  assert.deepEqual(RESEARCH_SNAPSHOT, {
    iso: "2026-08-03",
    dotted: "2026.08.03",
    compact: "08/03",
    batchId: "BLOG-260803-03",
    activatedAt: "2026-08-03 22:58",
    redeemExpiresAt: "2027-08-03 23:59",
    orderNo: "JS260803225801",
  });
  assert.equal(getPlanExpiry("monthly"), "2026-09-03 22:58");
  assert.equal(getPlanExpiry("quarterly"), "2026-11-03 22:58");
  assert.equal(getPlanExpiry("yearly"), "2027-08-03 22:58");
});

test("IPO helpers keep probability and market-cap units explicit", () => {
  assert.equal(getReferenceIssuePrice(4_201_710_000, 40_446_434), 103.88);
  assert.equal(getAtLeastOneHitProbability(0.02, 12), 0.2397);
  assert.equal(getMarketCapYi(100, 404_464_340), 404.46);
  assert.equal(getMarketCapYi(150, 30_000_000), 45);
});
```

- [ ] **Step 2: 运行定向测试确认失败**

Run: `node --test tests/prototype-model.test.mjs`

Expected: FAIL，报告 `RESEARCH_SNAPSHOT` 或 IPO 计算函数未导出。

- [ ] **Step 3: 实现最小日期和计算模型**

```js
export const RESEARCH_SNAPSHOT = Object.freeze({
  iso: "2026-08-03",
  dotted: "2026.08.03",
  compact: "08/03",
  batchId: "BLOG-260803-03",
  activatedAt: "2026-08-03 22:58",
  redeemExpiresAt: "2027-08-03 23:59",
  orderNo: "JS260803225801",
});

export function getReferenceIssuePrice(raiseYuan, issueShares) {
  return Math.round((raiseYuan / issueShares) * 100) / 100;
}

export function getAtLeastOneHitProbability(ratePercent, allocationNumbers) {
  const rate = ratePercent / 100;
  return Math.round((1 - (1 - rate) ** allocationNumbers) * 100 * 10_000) / 10_000;
}

export function getMarketCapYi(priceYuan, shares) {
  return Math.round((priceYuan * shares / 100_000_000) * 100) / 100;
}
```

同时将 `getPlanExpiry()` 和兑换成功到期日期更新为规格中的 8 月 3 日口径。

- [ ] **Step 4: 运行模型测试确认通过**

Run: `node --test tests/prototype-model.test.mjs`

Expected: PASS，日期、概率和市值计算无失败。

- [ ] **Step 5: 提交模型改动**

```powershell
git add lib/prototype-model.mjs tests/prototype-model.test.mjs
git commit -m "feat: centralize current research and ipo calculations"
```

---

### Task 2: 实现立体可悬停的轨道球

**Files:**
- Modify: `lib/orbit-model.mjs`
- Modify: `app/decision-orbit.tsx`
- Modify: `app/globals.css`
- Modify: `tests/orbit-model.test.mjs`
- Modify: `tests/prototype-source.test.mjs`

**Interfaces:**
- Consumes: `ORBIT_DEFINITIONS`、`getOrbitPoint()` 和 Canvas 容器尺寸。
- Produces: `getOrbitDepth(pointY, height)`、`getOrbitSphereRadius(baseRadius, depth)`、`isPointInOrbitSphere(pointer, sphere)`；`DecisionOrbit` 通过指针事件选中单个球。

- [ ] **Step 1: 为新维度、景深和命中检测写失败测试**

```js
import {
  getOrbitDepth,
  getOrbitSphereRadius,
  isPointInOrbitSphere,
} from "../lib/orbit-model.mjs";

test("orbit labels begin with strategy instead of company", () => {
  assert.deepEqual(
    ORBIT_DEFINITIONS.map(({ label }) => label),
    ["策略", "生意", "估值", "技术", "风控"],
  );
});

test("front orbit spheres render larger than rear spheres", () => {
  assert.equal(getOrbitDepth(0, 600), 0);
  assert.equal(getOrbitDepth(600, 600), 1);
  assert.ok(getOrbitSphereRadius(29, 1) > getOrbitSphereRadius(29, 0));
});

test("pointer hit testing uses the visible sphere radius", () => {
  const sphere = { x: 100, y: 100, radius: 30 };
  assert.equal(isPointInOrbitSphere({ x: 120, y: 110 }, sphere), true);
  assert.equal(isPointInOrbitSphere({ x: 132, y: 100 }, sphere), false);
});
```

在源码契约中增加：

```js
assert.match(orbit, /createRadialGradient/);
assert.match(orbit, /onPointerMove/);
assert.match(orbit, /isPointInOrbitSphere/);
assert.match(orbit, /hoveredOrbitRef/);
assert.doesNotMatch(orbit, /drawPill/);
assert.match(orbit, /aria-label="策略、生意、估值、技术与风控围绕决策中心持续运行"/);
```

- [ ] **Step 2: 运行轨道与源码测试确认失败**

Run: `node --test tests/orbit-model.test.mjs tests/prototype-source.test.mjs`

Expected: FAIL，新函数未导出且旧 `drawPill()` 仍存在。

- [ ] **Step 3: 实现轨道景深与圆形命中纯函数**

```js
export function getOrbitDepth(pointY, height) {
  return Math.min(1, Math.max(0, pointY / Math.max(1, height)));
}

export function getOrbitSphereRadius(baseRadius, depth) {
  return Math.round((baseRadius * (0.78 + depth * 0.44)) * 1e4) / 1e4;
}

export function isPointInOrbitSphere(pointer, sphere) {
  return Math.hypot(pointer.x - sphere.x, pointer.y - sphere.y) <= sphere.radius;
}
```

将第一个轨道标签从“公司”改为“策略”。

- [ ] **Step 4: 改造 Canvas 绘制与指针状态**

`app/decision-orbit.tsx` 的实现要点必须包含：

```tsx
type OrbitSphere = { index: number; x: number; y: number; radius: number };
const hoveredOrbitRef = useRef<number | null>(null);
const spheresRef = useRef<OrbitSphere[]>([]);

const onPointerMove = (event: React.PointerEvent<HTMLDivElement>) => {
  const bounds = event.currentTarget.getBoundingClientRect();
  const pointer = { x: event.clientX - bounds.left, y: event.clientY - bounds.top };
  hoveredOrbitRef.current = spheresRef.current
    .toSorted((a, b) => b.radius - a.radius)
    .find((sphere) => isPointInOrbitSphere(pointer, sphere))?.index ?? null;
};
```

- 删除 `drawPill()` 和方形标记。
- 新增 `drawSphere()`：球体半径由景深函数计算，悬停球额外放大 12%，使用径向渐变、两层边缘光和柔化阴影。
- 标签以 14px 字号居中绘制在球体正面。
- 将当前帧的可见球数据写入 `spheresRef.current`。
- `pointerleave` 清空单球悬停并恢复普通速度。
- 中央球 CSS 增加 `:before` 高光、`:after` 底部暗面和更强的阴影。

- [ ] **Step 5: 运行轨道、源码与 lint 测试**

Run: `node --test tests/orbit-model.test.mjs tests/prototype-source.test.mjs; npm run lint`

Expected: PASS，无 TypeScript/ESLint 错误。

- [ ] **Step 6: 提交轨道球改动**

```powershell
git add lib/orbit-model.mjs app/decision-orbit.tsx app/globals.css tests/orbit-model.test.mjs tests/prototype-source.test.mjs
git commit -m "feat: render interactive 3d orbit spheres"
```

---

### Task 3: 精简首页并更新当日数据口径

**Files:**
- Modify: `app/home-page.tsx`
- Modify: `app/prototype-app.tsx`
- Modify: `app/globals.css`
- Modify: `lib/prototype-model.mjs`
- Modify: `tests/prototype-model.test.mjs`
- Modify: `tests/prototype-source.test.mjs`
- Modify: `tests/browser-smoke.mjs`

**Interfaces:**
- Consumes: Task 1 的 `RESEARCH_SNAPSHOT` 和更新后的 `getPlanExpiry()`。
- Produces: 仅含 `today | risk | strategy | ipo` 的首页 `PRODUCTS`；所有当日快照文案使用 8 月 3 日。

- [ ] **Step 1: 为四模块和新日期写失败契约测试**

```js
assert.equal((home.match(/className="product-entry"/g) ?? []).length, 1, "entries are rendered from one product array");
assert.doesNotMatch(home, /id: "membership", no: "05"/);
assert.match(home, /四个模块，把信息整理成每日研究/);
assert.doesNotMatch(home, /五个模块/);
assert.match(home, /RESEARCH_SNAPSHOT\.dotted/);
assert.match(app, /RESEARCH_SNAPSHOT\.iso/);
assert.match(app, /RESEARCH_SNAPSHOT\.compact/);
assert.match(app, /RESEARCH_SNAPSHOT\.batchId/);
assert.match(app, /RESEARCH_SNAPSHOT\.activatedAt/);
assert.match(app, /RESEARCH_SNAPSHOT\.orderNo/);
assert.doesNotMatch(app + home, /2026[-.]07[-.]31|07\/31|BLOG-260731|JS260731/);
```

更新模型测试对月度、季度、年度到期时间和兑换到期时间的断言。

- [ ] **Step 2: 运行契约与模型测试确认失败**

Run: `node --test tests/prototype-model.test.mjs tests/prototype-source.test.mjs`

Expected: FAIL，首页会员产品、五模块文案和 7 月 31 日快照仍存在。

- [ ] **Step 3: 将首页产品数组缩减为四项**

- 删除 `Crown` 首页图标导入和 `PRODUCTS` 中的 `membership` 对象。
- `ProductPageId` 仍保留 `membership`，供底部 CTA 继续跳转。
- 更新“四个模块”文案。
- CSS 将 `.product-entry-grid` 从 `repeat(5, 1fr)` 改为 `repeat(4, 1fr)`，响应式规则保持 2 列与 1 列。

- [ ] **Step 4: 替换当日快照和会员演示时间**

`app/home-page.tsx` 导入 `RESEARCH_SNAPSHOT` 并使用 `{RESEARCH_SNAPSHOT.dotted}`。

`app/prototype-app.tsx` 导入同一常量，替换：

```tsx
<strong>{RESEARCH_SNAPSHOT.iso} · 收盘后</strong>
eyebrow={`TODAY'S BRIEF · ${RESEARCH_SNAPSHOT.compact}`}
eyebrow={`RISK CONTROL · ${RESEARCH_SNAPSHOT.compact}`}
eyebrow={`STRATEGY SCREEN · ${RESEARCH_SNAPSHOT.compact}`}
<b>{RESEARCH_SNAPSHOT.iso} 夜间批次</b>
<small>批次号 {RESEARCH_SNAPSHOT.batchId}</small>
```

支付演示的生效时间、兑换到期时间和订单号使用 `RESEARCH_SNAPSHOT` 对应字段。

- [ ] **Step 5: 同步浏览器烟雾脚本的新文案期望**

将 `tests/browser-smoke.mjs` 中会员成功时间、订单号和首页产品模块断言替换为 8 月 3 日与四模块口径；不运行浏览器自动化。

- [ ] **Step 6: 运行单元测试和 lint**

Run: `npm run test:unit; npm run lint`

Expected: PASS，没有旧快照日期契约失败。

- [ ] **Step 7: 提交首页与日期改动**

```powershell
git add app/home-page.tsx app/prototype-app.tsx app/globals.css lib/prototype-model.mjs tests/prototype-model.test.mjs tests/prototype-source.test.mjs tests/browser-smoke.mjs
git commit -m "feat: refresh homepage modules and current snapshot"
```

---

### Task 4: 增加 IPO 申购、中签与宇树市值情景

**Files:**
- Modify: `app/ipo-page.tsx`
- Modify: `app/globals.css`
- Modify: `tests/prototype-source.test.mjs`
- Modify: `tests/browser-smoke.mjs`

**Interfaces:**
- Consumes: Task 1 的 `getReferenceIssuePrice()`、`getAtLeastOneHitProbability()` 和 `getMarketCapYi()`。
- Produces: 六阶段 IPO 进度、两个申购日期、中签难度对比、宇树股价/市值情景；删除 IPO 观察风险模块。

- [ ] **Step 1: 为 IPO 新模块写失败契约测试**

```js
for (const copy of [
  "申购",
  "2026-07-16",
  "2026-08-10",
  "计划网上申购",
  "中签难度对比",
  "0.4714%",
  "约 0.02%",
  "理论约 212 个配号中 1 个",
  "非官方定价 · 情景测算",
  "开盘流通市值",
  "总市值",
  "100 元",
  "300 元",
]) assert.match(ipo, new RegExp(copy.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));

assert.doesNotMatch(ipo, /观察变量与主要风险|ipo-watch-section|variables:|risks:/);
```

- [ ] **Step 2: 运行源码契约测试确认失败**

Run: `node --test tests/prototype-source.test.mjs`

Expected: FAIL，申购阶段、中签和市值情景不存在，观察风险模块仍存在。

- [ ] **Step 3: 将 IPO 进度改为六阶段并补充申购日**

```tsx
const IPO_STAGES = ["受理", "问询", "上市委", "注册", "申购", "上市"] as const;
```

- 长鑫 `stageIndex` 改为 5，时间线在注册与上市之间插入 `["2026-07-16", "网上申购"]`。
- 宇树 `stageIndex` 保持注册阶段，增加 `plannedStageIndex: 4`，时间线插入 `["2026-08-10", "计划网上申购", "planned"]`。
- 进度点区分 `complete`、`planned` 和默认未完成状态。

- [ ] **Step 4: 实现中签难度对比模块**

建立静态对象，其中宇树的参考价和顶格概率从 Task 1 函数生成：

```tsx
const unitreeReferencePrice = getReferenceIssuePrice(4_201_710_000, 40_446_434);
const unitreeTopProbability = getAtLeastOneHitProbability(0.02, 12);
```

界面必须显示：

- 长鑫：66.88 亿股 / 579.19 亿元、8.66 元/股、单签 4,330 元、顶格 3,349 万元 / 6,698 号、0.4714%。
- 宇树：4,044.64 万股 / 42.02 亿元、参考 103.88 元/股、单签约 51,940 元、顶格 6 万元 / 12 号、约 0.02%、顶格至少一签约 0.2397%。
- 长条可视化按对数或归一化宽度展示，文本数值始终保留。

- [ ] **Step 5: 实现宇树股价与市值情景表**

```tsx
const UNITREE_PRICE_POINTS = [100, 150, 200, 250, 300] as const;
const UNITREE_FLOAT_SCENARIOS = [20_000_000, 30_000_000, 40_446_434] as const;

const UNITREE_VALUATIONS = UNITREE_PRICE_POINTS.map((price) => ({
  price,
  total: getMarketCapYi(price, 404_464_340),
  floats: UNITREE_FLOAT_SCENARIOS.map((shares) => getMarketCapYi(price, shares)),
}));
```

用响应式表格展示股价、总市值与 2,000/3,000/4,044.64 万股三档流通股本的开盘流通市值。

- [ ] **Step 6: 删除观察风险模块并更新 CSS**

- 删除 `COMPANIES` 内 `variables`/`risks` 字段、`ipo-watch-section` JSX 和对应 CSS。
- 新增 `.ipo-allocation-*`、`.ipo-probability-*`、`.ipo-valuation-*` 样式。
- 六阶段轨道在窄屏上使用 `repeat(6, minmax(74px, 1fr))`。
- 估值表使用 `overflow-x: auto` 保证 390px 无全页溢出。

- [ ] **Step 7: 更新 IPO 烟雾脚本文案契约**

将 `tests/browser-smoke.mjs` 的 `ipoCheck.sections` 替换为申购、中签、市值情景和“不存在观察风险模块”的断言字符串。

- [ ] **Step 8: 运行单元测试和 lint**

Run: `npm run test:unit; npm run lint`

Expected: PASS，IPO 新文案完整且无旧观察风险模块。

- [ ] **Step 9: 提交 IPO 申购与估值改动**

```powershell
git add app/ipo-page.tsx app/globals.css tests/prototype-source.test.mjs tests/browser-smoke.mjs
git commit -m "feat: add ipo allocation and valuation research"
```

---

### Task 5: 增加蓝箭航天与中科宇航进度

**Files:**
- Modify: `app/ipo-page.tsx`
- Modify: `app/globals.css`
- Modify: `tests/prototype-source.test.mjs`
- Modify: `tests/browser-smoke.mjs`

**Interfaces:**
- Consumes: 现有 IPO 页的六阶段视觉语言。
- Produces: `SPACE_IPOS` 静态数组和“商业航天 IPO 进度”双卡模块。

- [ ] **Step 1: 为两个正式项目名与审核事件写失败契约测试**

```js
for (const copy of [
  "商业航天 IPO 进度",
  "蓝箭航天",
  "蓝箭航天空间科技股份有限公司",
  "2025-12-31",
  "2026-06-29",
  "中科宇航",
  "中科宇航技术股份有限公司",
  "2026-03-31",
  "2026-04-15",
  "已问询",
]) assert.match(ipo, new RegExp(copy));

assert.doesNotMatch(ipo, /蓝箭科技|中宇航天/);
```

- [ ] **Step 2: 运行源码契约测试确认失败**

Run: `node --test tests/prototype-source.test.mjs`

Expected: FAIL，商业航天模块未实现。

- [ ] **Step 3: 实现商业航天 IPO 数据与卡片**

```tsx
const SPACE_IPOS = [
  {
    name: "蓝箭航天",
    fullName: "蓝箭航天空间科技股份有限公司",
    status: "已问询",
    events: [["2025-12-31", "上交所受理"], ["2026-06-29", "更新财务资料并恢复已问询"]],
    focus: "液氧甲烷运载火箭与可重复使用技术",
  },
  {
    name: "中科宇航",
    fullName: "中科宇航技术股份有限公司",
    status: "已问询",
    events: [["2026-03-31", "上交所受理"], ["2026-04-15", "进入已问询"], ["2026-06-29", "更新招股资料"]],
    focus: "力箭系列运载火箭研发、生产与发射服务",
  },
] as const;
```

在宇树市值情景后、数据说明前渲染双卡模块，每张卡展示状态、正式全称、业务摘要和公开事件。

- [ ] **Step 4: 增加商业航天卡片响应式样式**

- `.space-ipo-grid` 桌面两列、900px 以下单列。
- `.space-ipo-card` 复用深色表面、阶段徽章和小型纵向时间线。
- 所有日期使用等宽数字特性，状态不仅依赖颜色。

- [ ] **Step 5: 更新 IPO 烟雾脚本的商业航天文案契约**

将“蓝箭航天”、“中科宇航”与“已问询”加入 `ipoCheck.sections`，并检查用户的非正式名称不出现。

- [ ] **Step 6: 运行单元测试和 lint**

Run: `npm run test:unit; npm run lint`

Expected: PASS，两个商业航天项目口径正确。

- [ ] **Step 7: 提交商业航天进度改动**

```powershell
git add app/ipo-page.tsx app/globals.css tests/prototype-source.test.mjs tests/browser-smoke.mjs
git commit -m "feat: track commercial space ipo progress"
```

---

### Task 6: 完整验证与本地交付

**Files:**
- Review: `app/decision-orbit.tsx`
- Review: `app/home-page.tsx`
- Review: `app/prototype-app.tsx`
- Review: `app/ipo-page.tsx`
- Review: `app/globals.css`
- Review: `lib/orbit-model.mjs`
- Review: `lib/prototype-model.mjs`
- Review: `tests/*.mjs`

**Interfaces:**
- Consumes: Tasks 1–5 的所有实现。
- Produces: 通过单元测试、生产构建、SSR 渲染、lint 和本地 HTTP 检查的干净分支。

- [ ] **Step 1: 扫描被禁止的旧文案与旧模块**

Run:

```powershell
rg -n '2026[-.]07[-.]31|07/31|BLOG-260731|JS260731|drawPill|label: "公司"|aria-label="公司、生意|五个模块|ipo-watch-section|观察变量与主要风险|蓝箭科技|中宇航天' app lib
```

Expected: 无匹配；IPO 历史日期中允许的 7 月事件不在禁止模式中。

- [ ] **Step 2: 运行 React 最佳实践审阅**

按 `vercel:react-best-practices` 检查 Canvas 事件清理、高频状态的 ref 使用、模块级静态数据和 IPO 表格的语义。只修复与本轮改动直接相关的问题。

- [ ] **Step 3: 运行完整测试与构建**

Run: `npm test`

Expected: 所有单元/契约测试 PASS，Vinext 生产构建成功，SSR 渲染测试 PASS。

- [ ] **Step 4: 单独运行 lint**

Run: `npm run lint`

Expected: exit 0，无 ESLint 错误。

- [ ] **Step 5: 检查本地服务**

```powershell
$response = Invoke-WebRequest -UseBasicParsing -Uri "http://localhost:5174/#home" -TimeoutSec 15
Write-Output $response.StatusCode
Write-Output $response.Content.Contains("803研究")
```

Expected: `200` 和 `True`。

- [ ] **Step 6: 检查分支与工作树**

Run: `git status --short; git log -8 --oneline`

Expected: 工作树为空，本轮规格、计划与实现提交完整。

---

## Plan Self-Review

- 规格覆盖：Task 1 覆盖日期和计算；Task 2 覆盖立体轨道球；Task 3 覆盖首页四模块与最新快照；Task 4 覆盖申购、中签、市值情景和删除风险模块；Task 5 覆盖商业航天；Task 6 覆盖最终交付。
- 类型一致：Task 1 产出的四个导出名称在 Tasks 3–4 中保持一致；Task 2 的球体数据结构同时服务绘制与命中检测。
- 范围一致：不新增依赖、不删除会员页、不运行未明确要求的浏览器自动化、不发布。
