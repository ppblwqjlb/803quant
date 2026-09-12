# 首页数字递增与全站滚动浮现 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 为首页成果指标增加视口触发的从 0 递增动效，并让全站主内容在滚动时一次性、错峰浮现。

**Architecture:** 新增 `motion-model.mjs` 保存可单测的缓动与计数计算，新建客户端 `CountUpValue` 负责单个成果数字，新建全局 `MotionController` 通过共享 `IntersectionObserver` 与 `MutationObserver` 管理声明式 `data-reveal` 元素。各页面只标注主区块，视觉参数集中在 `globals.css`，不引入第三方动画依赖。

**Tech Stack:** Next.js/Vinext、React 19、TypeScript、CSS、IntersectionObserver、MutationObserver、requestAnimationFrame、Node test、Playwright CDP。

## Global Constraints

- 数字递增只用于首页 `WHY 803` 四项成果指标，不用于日期、价格、股票代码、风险分或 IPO 数据。
- 动画每次页面生命周期只播放一次，滚回已展示内容不重播。
- 数字时长约 1400ms、错峰约 90ms；浮现时长约 760ms、位移 28px、模糊 7px、同组最大延迟 280ms。
- `prefers-reduced-motion: reduce` 下最终数字与全部内容立即可见。
- 不新增第三方动画依赖，不改动研究数据、导航和业务流程。
- 仅在本地验证，不发布、不部署、不推送远端。

---

### Task 1: 可测试计数模型与 CountUpValue

**Files:**
- Create: `lib/motion-model.mjs`
- Create: `app/count-up-value.tsx`
- Modify: `app/home-page.tsx:28-114`
- Create: `tests/motion-model.test.mjs`
- Modify: `tests/prototype-source.test.mjs:76-116`

**Interfaces:**
- Produces: `easeOutCubic(progress: number): number`。
- Produces: `getCountFrame(target: number, progress: number): number`。
- Produces: `CountUpValue({ value, suffix?, delay?, label }): React.ReactElement`。
- Consumes: `PROOF` 中拆分后的数值目标、后缀、单位和无障碍文案。

- [ ] **Step 1: 写计数模型失败测试**

在 `tests/motion-model.test.mjs` 断言：

```js
import test from "node:test";
import assert from "node:assert/strict";
import { easeOutCubic, getCountFrame } from "../lib/motion-model.mjs";

test("easeOutCubic clamps progress and ends exactly", () => {
  assert.equal(easeOutCubic(-1), 0);
  assert.equal(easeOutCubic(0), 0);
  assert.equal(easeOutCubic(1), 1);
  assert.equal(easeOutCubic(2), 1);
  assert.ok(easeOutCubic(0.5) > 0.5);
});

test("getCountFrame returns an integer without overshooting", () => {
  assert.equal(getCountFrame(300, 0), 0);
  assert.equal(getCountFrame(300, 1), 300);
  assert.ok(getCountFrame(300, 0.5) > 150);
  assert.ok(getCountFrame(300, 0.5) < 300);
});
```

运行：`node --test tests/motion-model.test.mjs`

预期：FAIL，提示 `lib/motion-model.mjs` 不存在。

- [ ] **Step 2: 实现最小计数模型并通过测试**

```js
export function easeOutCubic(progress) {
  const value = Math.min(1, Math.max(0, progress));
  return 1 - (1 - value) ** 3;
}

export function getCountFrame(target, progress) {
  return Math.min(target, Math.round(target * easeOutCubic(progress)));
}
```

运行：`node --test tests/motion-model.test.mjs`

预期：PASS。

- [ ] **Step 3: 写 CountUpValue 源码契约失败测试**

在 `tests/prototype-source.test.mjs` 读取 `app/count-up-value.tsx` 并断言包含：

```js
assert.match(countUp, /IntersectionObserver/);
assert.match(countUp, /requestAnimationFrame/);
assert.match(countUp, /prefers-reduced-motion/);
assert.match(countUp, /aria-label=\{label\}/);
assert.match(home, /<CountUpValue/);
```

同时断言首页仅四处使用 `CountUpValue`，目标值为 `10`、`300`、`2`、`1200`，且日期/会员价格仍为普通静态文本。

运行：`npm run test:unit`

预期：FAIL，提示组件文件或使用方式尚不存在。

- [ ] **Step 4: 实现 CountUpValue 并接入首页证明矩阵**

组件使用自身 `ref` 和一次性 `IntersectionObserver`，可视后在 `delay` 结束时启动 `requestAnimationFrame`；每帧调用 `getCountFrame`，达到 1 后取消帧并断开 observer。`matchMedia("(prefers-reduced-motion: reduce)")` 命中或缺少 `IntersectionObserver` 时直接设置最终值。外层使用最终 `aria-label`，变化数字和后缀使用 `aria-hidden="true"`。

将 `PROOF` 改为数字目标与后缀分离：

```ts
{ value: 300, suffix: "+", unit: "位", label: "累计服务学员", spoken: "服务 300+ 学员" }
```

按索引传入 `delay={index * 90}`。

运行：`npm run test:unit`

预期：PASS。

- [ ] **Step 5: 提交计数功能**

```bash
git add lib/motion-model.mjs app/count-up-value.tsx app/home-page.tsx tests/motion-model.test.mjs tests/prototype-source.test.mjs package.json
git commit -m "feat: animate home proof metrics"
```

### Task 2: 全局 MotionController 与浮现样式

**Files:**
- Create: `app/motion-controller.tsx`
- Modify: `app/prototype-app.tsx:1-285`
- Modify: `app/globals.css`
- Modify: `tests/prototype-source.test.mjs`

**Interfaces:**
- Produces: `<MotionController />`，挂载后观察 `[data-reveal]`。
- Consumes: 元素属性 `data-reveal`、`data-reveal-state`、`data-reveal-delay`。
- Side effect: 可见时将 `data-reveal-state` 设为 `visible` 并 `unobserve`。

- [ ] **Step 1: 写 MotionController 失败测试**

增加源码契约：

```js
assert.match(motionController, /new IntersectionObserver/);
assert.match(motionController, /new MutationObserver/);
assert.match(motionController, /data-reveal-state/);
assert.match(motionController, /unobserve/);
assert.match(app, /<MotionController \/>/);
```

增加 CSS 契约：初始 `opacity: 0`、`translate3d(0, 28px, 0)`、`blur(7px)`，可见状态归零；减少动态效果中无 transition 且全部可见。

运行：`npm run test:unit`

预期：FAIL，提示控制器和 CSS 契约尚不存在。

- [ ] **Step 2: 实现共享观察器**

`MotionController` 在 `useEffect` 中执行：

```ts
const selector = "[data-reveal]";
const reveal = (element: HTMLElement) => {
  element.dataset.revealState = "visible";
  observer?.unobserve(element);
};
```

减少动态效果、缺少观察器或元素首屏已在阈值之上时直接显示；否则由阈值 `0.12`、`rootMargin: "0px 0px -8% 0px"` 的单一 observer 处理。MutationObserver 仅扫描新增节点及其后代中的 `[data-reveal]`，卸载时断开两个 observer。

- [ ] **Step 3: 在根应用挂载控制器并加入 CSS**

在 `.app-frame` 内挂载一次 `<MotionController />`。CSS 使用：

```css
[data-reveal] {
  opacity: 0;
  transform: translate3d(0, 28px, 0);
  filter: blur(7px);
  transition: opacity 760ms cubic-bezier(.22,1,.36,1), transform 760ms cubic-bezier(.22,1,.36,1), filter 760ms cubic-bezier(.22,1,.36,1);
  transition-delay: var(--reveal-delay, 0ms);
}
[data-reveal][data-reveal-state="visible"] { opacity: 1; transform: none; filter: blur(0); }
```

使用 `@media (prefers-reduced-motion: reduce)` 立即展示并禁用 transition。

运行：`npm run test:unit`

预期：PASS。

- [ ] **Step 4: 提交全局动效基础设施**

```bash
git add app/motion-controller.tsx app/prototype-app.tsx app/globals.css tests/prototype-source.test.mjs
git commit -m "feat: add global scroll reveal controller"
```

### Task 3: 全站区块标注、错峰与浏览器验收

**Files:**
- Modify: `app/home-page.tsx`
- Modify: `app/prototype-app.tsx`
- Modify: `app/ipo-page.tsx`
- Modify: `app/globals.css`
- Modify: `tests/prototype-source.test.mjs`
- Modify: `tests/browser-smoke.mjs`

**Interfaces:**
- Consumes: Task 2 的 `[data-reveal]` 契约。
- Produces: 首页及五个产品页所有主内容区块的一次性浮现覆盖。

- [ ] **Step 1: 写全站覆盖失败测试**

源码测试断言：首页首屏下方各 section、通用 `PageHeading`、Today/Risk/Strategy/Membership 顶级 section、IPO 全部顶级 section 和合规说明都有 `data-reveal`。同时断言 `.home-hero`、`.site-header`、`.product-statusbar`、弹窗和 Drawer 没有该属性。

浏览器脚本增加：

```js
const revealState = await evaluate(`({
  total: document.querySelectorAll('[data-reveal]').length,
  visible: document.querySelectorAll('[data-reveal][data-reveal-state="visible"]').length,
  hidden: document.querySelectorAll('[data-reveal]:not([data-reveal-state="visible"])').length
})`);
assert.ok(revealState.total > 0);
```

运行：`npm run test:unit`

预期：FAIL，提示全站区块尚未完整标注。

- [ ] **Step 2: 标注首页与产品页主区块**

首页 hero 保持立即可见；其后的产品入口和各主 section 添加 `data-reveal`。`PageHeading` 根节点添加 `data-reveal`，其余顶级 section 与页面底部合规说明逐一标注。对网格内子卡片通过 CSS 自定义属性设置不超过 280ms 的错峰，不对表格行、数据单元格和弹窗进行动画。

- [ ] **Step 3: 增加浏览器计数与滚动断言**

在 `browser-smoke.mjs` 中验证：

- 首页加载后证明数字目标元素存在，滚动到证明区后最终显示 `10`、`300+`、`2`、`1200`。
- 首页下方仍有未展示元素，向下滚动后对应元素变为 `visible`。
- 切换 Today、Risk、Strategy、IPO、Membership 后，各页面至少有一个可见的 `data-reveal` 元素。
- 已展示元素滚出再滚回仍为 `visible`。
- 无控制台错误和横向溢出。

- [ ] **Step 4: 运行完整验证**

```bash
npm test
npm run lint
node tests/browser-smoke.mjs
```

预期：全部 PASS，生产构建成功，浏览器脚本无错误。

- [ ] **Step 5: 提交全站接入**

```bash
git add app/home-page.tsx app/prototype-app.tsx app/ipo-page.tsx app/globals.css tests/prototype-source.test.mjs tests/browser-smoke.mjs
git commit -m "feat: reveal content across the site"
```

## 自检结果

- 规格覆盖：计数范围、一次性播放、全站主区块、错峰、减少动态效果、浏览器验收均有对应任务。
- 占位符扫描：无 TBD、TODO、later 或未定义接口。
- 类型一致：`CountUpValue`、`MotionController`、`data-reveal-state="visible"` 在所有任务中命名一致。
