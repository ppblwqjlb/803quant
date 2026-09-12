# 见势研究全站深色改版 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 把现有五页浅色侧边栏原型升级为带品牌首页、桌面顶部导航和全站大字号深色设计的公开可点击原型。

**Architecture:** 保留现有 React 单页应用、Hash 路由、统一模拟数据和五个业务页面，把默认路由扩展为 `home`。新增独立 `HomePage` 负责营销首页，`PrototypeApp` 负责全局顶部导航、功能页状态栏和页面切换；现有业务组件继续留在 `prototype-app.tsx`，避免无必要重构。全站视觉由 `globals.css` 的深色设计变量、首页布局和功能页覆盖规则统一控制。

**Tech Stack:** React 19、TypeScript、Vinext、Lucide React、CSS、Node.js test runner、Sites hosting。

## Global Constraints

- 全站使用深色视觉，桌面主导航固定在顶部，不保留左侧导航。
- 默认入口为 `#home`；顶部五项索引为今日决策台、风控提醒、策略选股、今日信息、会员充值。
- 首页必须展示好公司、好生意、好价格、好时机、多维研究与技术面分析。
- 首页必须展示 10 年深耕、300+ 学员、10 套策略、社群连续更新 1200 天、过去 10 年 A 股投资年化复利 15%。
- 桌面正文基础字号 18px；首页主标题 68–76px；功能页正文 17–18px；表格不低于 15px；移动端正文不低于 16px。
- 视觉参考 sober-club.com 的大标题、大留白、细边框矩阵和克制高亮色，但不得复制其品牌素材、插画、合作机构或文案。
- 继续使用模拟数据，不连接数据库、行情、登录、支付或站外通知。
- 移动端产品页保留底部五项导航；390px、1024px、1440px 不得出现页面级横向溢出。

---

## File Structure

- `app/home-page.tsx`：新增品牌首页，包含 Hero、数据矩阵、产品入口、研究体系、服务节奏、加入前说明和会员行动区。
- `app/prototype-app.tsx`：扩展 `PageId`、替换侧边栏为顶部导航、接入首页，保留现有五页业务组件和交互。
- `app/globals.css`：替换全局色彩与框架布局，并为首页、五个功能页及响应式状态提供统一深色样式。
- `lib/prototype-model.mjs`：把 `home` 加入 Hash 路由并改为无效路由的默认回退。
- `app/layout.tsx`：更新官网定位、描述与分享文案。
- `tests/prototype-model.test.mjs`：测试六个路由和默认首页。
- `tests/prototype-source.test.mjs`：测试顶部导航、品牌首页文案、深色色值、大字号和响应式契约。
- `tests/rendered-html.test.mjs`：测试服务端默认输出品牌首页而非今日决策台。
- `tests/browser-smoke.mjs`：补充首页与顶部导航路径，保留风控、选股、信息、支付和移动端回归。
- `README.md`：把说明更新为“品牌首页 + 五个产品页”。

---

### Task 1: 扩展首页路由契约

**Files:**
- Modify: `tests/prototype-model.test.mjs`
- Modify: `lib/prototype-model.mjs`

**Interfaces:**
- Produces: `PAGE_IDS = ["home", "today", "risk", "strategy", "intel", "membership"]`
- Produces: `getPageFromHash(hash): PageId`，空值和未知值返回 `home`

- [ ] **Step 1: Write the failing test**

把路由测试改为：

```js
test("hash navigation resolves the homepage and five product pages", () => {
  for (const page of ["home", "today", "risk", "strategy", "intel", "membership"]) {
    assert.equal(getPageFromHash(`#${page}`), page);
  }
  assert.equal(getPageFromHash(""), "home");
  assert.equal(getPageFromHash("#unknown"), "home");
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test tests/prototype-model.test.mjs`  
Expected: FAIL，因为 `#home` 和未知路由仍返回 `today`。

- [ ] **Step 3: Write minimal implementation**

```js
export const PAGE_IDS = ["home", "today", "risk", "strategy", "intel", "membership"];

export function getPageFromHash(hash) {
  const value = String(hash || "").replace(/^#\/?/, "");
  return PAGE_IDS.includes(value) ? value : "home";
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test tests/prototype-model.test.mjs`  
Expected: 所有模型测试 PASS。

- [ ] **Step 5: Commit**

```bash
git add lib/prototype-model.mjs tests/prototype-model.test.mjs
git commit -m "feat: add brand homepage route"
```

### Task 2: 建立品牌首页与顶部应用框架

**Files:**
- Create: `app/home-page.tsx`
- Modify: `app/prototype-app.tsx`
- Modify: `tests/prototype-source.test.mjs`
- Modify: `tests/rendered-html.test.mjs`

**Interfaces:**
- Consumes: `goTo(page)` Hash 导航行为
- Produces: `HomePage({ onNavigate }: { onNavigate: (page: ProductPageId) => void })`
- Produces: `PageId = "home" | "today" | "risk" | "strategy" | "intel" | "membership"`
- Produces: `.site-header`、`.brand-home`、`.product-statusbar`、`.home-page`

- [ ] **Step 1: Write failing source and render tests**

在 `prototype-source.test.mjs` 读取 `home-page.tsx`，增加：

```js
for (const copy of [
  "研究好公司，等待好价格，把握好节奏",
  "10 年深耕",
  "300+",
  "10 套策略",
  "1200 天",
  "15%",
  "好公司",
  "好生意",
  "好价格",
  "好时机",
]) assert.match(home, new RegExp(copy));

assert.match(app, /site-header/);
assert.match(app, /page === "home"/);
assert.doesNotMatch(app, /<aside className="sidebar"/);
```

把 `rendered-html.test.mjs` 的默认页断言改为：

```js
assert.match(html, /研究好公司，等待好价格，把握好节奏/);
assert.match(html, /股票投资俱乐部/);
assert.match(html, /过去 10 年/);
assert.doesNotMatch(html, /class="sidebar"/);
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `node --test tests/prototype-source.test.mjs`  
Expected: FAIL，`home-page.tsx` 不存在。

- [ ] **Step 3: Implement `HomePage` content**

在 `home-page.tsx` 定义准确数据：

```tsx
const PROOF = [
  { value: "10", unit: "年", label: "持续深耕 A 股研究" },
  { value: "300+", unit: "位", label: "累计服务学员" },
  { value: "10", unit: "套", label: "持续运行策略" },
  { value: "1200", unit: "天", label: "社群活跃更新" },
];

const RESEARCH = [
  ["01", "GOOD COMPANY", "好公司", "从治理、竞争优势、财务质量与行业位置出发。"],
  ["02", "GOOD BUSINESS", "好生意", "理解商业模式、现金流、成长空间与周期属性。"],
  ["03", "GOOD PRICE", "好价格", "用估值区间与安全边际等待赔率合适的位置。"],
  ["04", "GOOD TIMING", "好时机", "结合趋势结构、量价关系与催化把握交易节奏。"],
];
```

页面按以下真实顺序渲染：Hero → 五项产品入口 → WHY JIANSHI 数据矩阵 → 四项研究体系 → 日内服务时间轴 → 加入前问答 → 会员 CTA。Hero 右侧渲染五层 `.research-orbit` CSS 轨道，不使用外部图片。

- [ ] **Step 4: Replace the sidebar shell with top navigation**

在 `PrototypeApp`：

```tsx
const [page, setPage] = useState<PageId>("home");
if (!window.location.hash) window.history.replaceState(null, "", "#home");
```

顶部结构必须为：

```tsx
<header className="site-header">
  <button className="site-brand" onClick={() => goTo("home")}>...</button>
  <nav className="top-nav">...</nav>
  <button className="header-cta" onClick={() => goTo("today")}>查看今日决策</button>
</header>
```

`page === "home"` 时直接渲染 `HomePage`；五个产品页统一放进 `.product-workspace`，内部继续显示市场状态栏和现有页面组件。移动端底部导航只在产品页出现。

- [ ] **Step 5: Build and run tests**

Run: `npm run build`  
Run: `node --test tests/prototype-source.test.mjs tests/rendered-html.test.mjs`  
Expected: Build 成功，两组测试 PASS。

- [ ] **Step 6: Commit**

```bash
git add app/home-page.tsx app/prototype-app.tsx tests/prototype-source.test.mjs tests/rendered-html.test.mjs
git commit -m "feat: add dark brand homepage and top navigation"
```

### Task 3: 建立全站深色与大字号设计系统

**Files:**
- Modify: `app/globals.css`
- Modify: `tests/prototype-source.test.mjs`

**Interfaces:**
- Consumes: Task 2 的 `.site-header`、`.home-page`、`.product-workspace` 和现有业务类名
- Produces: 深色 CSS 变量、首页布局、产品页布局和可访问焦点态

- [ ] **Step 1: Write the failing CSS contract**

```js
for (const contract of [
  /--canvas:\s*#060911/,
  /--surface:\s*#0d1422/,
  /--brand:\s*#27d8c2/,
  /font-size:\s*18px/,
  /\.site-header\s*\{/,
  /\.home-hero\s*\{/,
  /\.proof-matrix\s*\{/,
  /prefers-reduced-motion/,
]) assert.match(css, contract);
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test tests/prototype-source.test.mjs`  
Expected: FAIL，因为当前主题为暖灰白且没有首页选择器。

- [ ] **Step 3: Replace global tokens and shell styles**

使用以下变量作为单一颜色来源：

```css
:root {
  --canvas: #060911;
  --nav: #080d18;
  --surface: #0d1422;
  --surface-strong: #111c2d;
  --ink: #f4f7fb;
  --ink-soft: #98a4b5;
  --line: rgba(166, 186, 215, 0.18);
  --brand: #27d8c2;
  --brand-deep: #0f8296;
  --amber: #e2b857;
  --orange: #f08a4b;
  --red: #f05b66;
  --stock-up: #f05b66;
  --stock-down: #29b784;
}

body { font-size: 18px; line-height: 1.7; }
```

`.site-header` 固定 78px；`.product-workspace` 顶部避让 78px；`.page-content` 宽度为 `min(1320px, 100%)` 且不再减去侧边栏宽度。

- [ ] **Step 4: Implement homepage styling**

必须实现：

```css
.home-hero h1 { font-size: clamp(48px, 5vw, 76px); }
.home-section-title { font-size: clamp(40px, 4vw, 64px); }
.home-copy { font-size: clamp(18px, 1.45vw, 21px); }
.proof-value { font-size: clamp(56px, 6vw, 96px); }
```

首页使用整屏级纵向留白、近直角细边框矩阵；产品入口 hover 仅移动箭头和改变边框。研究轨道使用渐变、椭圆边框、伪元素和缓慢漂移动画，同时为 `prefers-reduced-motion` 关闭动画。

- [ ] **Step 5: Restyle all functional pages**

把现有浅色固定值替换为变量或深色透明值，确保：页面标题 38–42px、卡片标题 20–22px、正文 17–18px、表格 15–16px、元数据至少 14px。保留 A 股红涨绿跌和风险黄/橙/红；`surface-card`、表格、抽屉、弹窗、状态条、输入框、选择器和套餐卡全部使用深色背景。

- [ ] **Step 6: Run tests and lint**

Run: `node --test tests/prototype-source.test.mjs`  
Run: `npm run lint`  
Expected: PASS，无 ESLint 错误。

- [ ] **Step 7: Commit**

```bash
git add app/globals.css tests/prototype-source.test.mjs
git commit -m "style: apply full dark visual system"
```

### Task 4: 完成响应式、内容元数据与浏览器路径

**Files:**
- Modify: `app/globals.css`
- Modify: `app/layout.tsx`
- Modify: `tests/browser-smoke.mjs`
- Modify: `README.md`

**Interfaces:**
- Consumes: 首页、顶部导航和五个产品页
- Produces: 1440px、1024px、390px 响应式契约和完整演示路径

- [ ] **Step 1: Add browser assertions for the homepage**

在桌面测试起点增加：

```js
await navigate("home");
const homeCheck = await evaluate(`({
  hero: document.body.innerText.includes('研究好公司，等待好价格，把握好节奏'),
  proof: document.body.innerText.includes('过去 10 年') && document.body.innerText.includes('15%'),
  topNav: getComputedStyle(document.querySelector('.top-nav')).display !== 'none',
  overflow: Math.max(document.documentElement.scrollWidth, document.body.scrollWidth) > window.innerWidth,
  hash: location.hash
})`);
assert.deepEqual(homeCheck, { hero: true, proof: true, topNav: true, overflow: false, hash: "#home" });
await clickButton("查看今日决策");
assert.equal(await evaluate("location.hash"), "#today");
```

移动端增加首页检查：菜单按钮可见、Hero 字号不小于 42px、页面无横向溢出。

- [ ] **Step 2: Implement responsive behavior**

- 1024px：顶部导航缩短间距，品牌副标题隐藏，Hero 保持双栏，证明矩阵改为两列。
- 760px 以下：首页顶部显示菜单按钮，五项顶部导航进入折叠层；产品页显示底部导航。
- 390px：首页单列，轨道视觉位于标题下方，Hero 标题 42–48px；候选表格转为卡片；抽屉宽度为 100%。
- 所有交互触控区域最小 44×44px。

- [ ] **Step 3: Update metadata and README**

```ts
title: "见势研究 · A股投资俱乐部"
description: "研究好公司，等待好价格，把握好节奏。见势研究提供多维研究、风险提醒、策略选股与每日信息汇聚。"
```

README 页面列表改为“品牌首页 + 五个产品页”，并说明默认 Hash 为 `#home`。

- [ ] **Step 4: Run complete verification**

Run: `npm run test:unit`  
Run: `npm run lint`  
Run: `npm test`  
Expected: unit、build、server-render 全部 PASS。

如果本机有可用的 Edge DevTools 会话，再运行：`node tests/browser-smoke.mjs`。Expected: 首页、五个页面、三种风控、抽屉、筛选、支付和 390px 检查全部 PASS；若没有该会话，仅记录环境限制，不把它误报为产品失败。

- [ ] **Step 5: Commit**

```bash
git add app/globals.css app/layout.tsx tests/browser-smoke.mjs README.md
git commit -m "test: verify dark site responsive flows"
```

### Task 5: 发布更新并核验公开版本

**Files:**
- Verify: `.openai/hosting.json`
- Build artifact: `dist/`

**Interfaces:**
- Consumes: 已通过验证的源码与构建产物
- Produces: 更新后的公开 Sites URL

- [ ] **Step 1: Confirm clean source and current project**

Run: `git status --short`  
Run: `Get-Content .openai/hosting.json`  
Expected: 工作树干净，Sites project id 与现有“见势研究”项目一致。

- [ ] **Step 2: Build release artifact**

Run: `npm run build`  
Expected: `dist/client` 和 `dist/server` 正常生成，无类型或构建错误。

- [ ] **Step 3: Publish with Sites hosting**

按 `sites:sites-hosting` 的现有站点更新流程：同步源码、保存新版本、部署为公开版本并等待状态变为完成。不得创建第二个重复站点。

- [ ] **Step 4: Verify public response**

检查公开 URL 返回成功，并确认页面标题为“见势研究 · A股投资俱乐部”。

- [ ] **Step 5: Handoff**

向用户提供：公开链接、主要改版结果、验证命令结果，以及未执行项目（若浏览器环境不可用）。

---

## Self-Review

- Spec coverage：首页、全站深色、顶部五项导航、大字号、五项品牌数据、四层研究体系、五个业务页、全部交互状态、移动端和发布均有对应任务。
- Placeholder scan：计划中不存在 `TBD`、`TODO`、笼统的“适当处理”或未定义接口。
- Type consistency：`PageId` 与 `PAGE_IDS` 均使用 `home | today | risk | strategy | intel | membership`；首页只接收五个产品页的导航回调。
- Dependency scope：不新增图表库、图片库、登录、支付或网络数据依赖。

