# Canvas 决策轨道、开放研究页与双公司 IPO 对比 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 为 803研究加入真实的 Canvas 椭圆公转动效、三层叠片 Logo、公开可访问的风控与策略页面，以及长鑫科技与宇树科技双公司 IPO 对照台。

**Architecture:** 将轨道数学模型放入可由 Node 直接测试的 `lib/orbit-model.mjs`，Canvas 生命周期和绘制集中在独立客户端组件 `app/decision-orbit.tsx`。现有 `PrototypeApp` 继续管理 hash 路由，但移除会员门禁状态；IPO 页面保留纯展示组件模式，用明确的数据数组驱动双公司布局。

**Tech Stack:** Next.js 16 App Router、React 19、TypeScript、Canvas 2D、Tailwind CSS 4、lucide-react、vinext/Vite、Node test runner。

## Global Constraints

- 本次只修改本地功能分支，不公开部署。
- Canvas 不引入第三方动画库，不使用视频、GIF 或外部图片。
- `prefers-reduced-motion: reduce` 时只绘制静态帧。
- 风控提醒与策略信号观察必须对所有原型访问者完整开放。
- IPO 信息口径截至 `2026-08-03`，不提供申购、目标价、收益、关联股票或仓位建议。
- 品牌名保持“803研究”，页头图标使用 `lucide-react` 的 `Layers3`。

---

### Task 1: 可测试的椭圆轨道数学模型

**Files:**
- Create: `lib/orbit-model.mjs`
- Create: `tests/orbit-model.test.mjs`
- Modify: `package.json`

**Interfaces:**
- Produces: `ORBIT_DEFINITIONS`，每项包含 `label`、`radiusX`、`radiusY`、`tiltDeg`、`durationMs`、`direction`、`phase`、`accent`。
- Produces: `getOrbitAngle(orbit, elapsedMs, speed): number`。
- Produces: `getOrbitPoint(orbit, angle, width, height): { x: number; y: number }`。
- Produces: `getCanvasPixelRatio(value): number`。

- [ ] **Step 1: 写轨道数学失败测试**

```js
import assert from "node:assert/strict";
import test from "node:test";
import {
  ORBIT_DEFINITIONS,
  getCanvasPixelRatio,
  getOrbitAngle,
  getOrbitPoint,
} from "../lib/orbit-model.mjs";

test("five research dimensions use independent elliptical orbits", () => {
  assert.deepEqual(ORBIT_DEFINITIONS.map(({ label }) => label), ["公司", "生意", "估值", "技术", "风控"]);
  assert.equal(new Set(ORBIT_DEFINITIONS.map(({ durationMs }) => durationMs)).size, 5);
  assert.deepEqual(new Set(ORBIT_DEFINITIONS.map(({ direction }) => direction)), new Set([1, -1]));
});

test("orbit angle follows elapsed time, direction and hover speed", () => {
  const orbit = { phase: 0, direction: 1, durationMs: 20_000 };
  assert.equal(getOrbitAngle(orbit, 5_000, 1), Math.PI / 2);
  assert.equal(getOrbitAngle({ ...orbit, direction: -1 }, 5_000, 1), -Math.PI / 2);
  assert.equal(getOrbitAngle(orbit, 5_000, 0.35), Math.PI * 0.175);
});

test("ellipse points are centered, tilted and responsive", () => {
  const orbit = { radiusX: 0.4, radiusY: 0.2, tiltDeg: 0 };
  assert.deepEqual(getOrbitPoint(orbit, 0, 1000, 600), { x: 900, y: 300 });
  assert.deepEqual(getOrbitPoint(orbit, Math.PI / 2, 1000, 600), { x: 500, y: 420 });
});

test("canvas pixel ratio is clamped between one and two", () => {
  assert.equal(getCanvasPixelRatio(0.75), 1);
  assert.equal(getCanvasPixelRatio(1.5), 1.5);
  assert.equal(getCanvasPixelRatio(3), 2);
});
```

- [ ] **Step 2: 运行测试确认缺少模块**

Run: `node --test tests/orbit-model.test.mjs`

Expected: FAIL with `ERR_MODULE_NOT_FOUND` for `lib/orbit-model.mjs`.

- [ ] **Step 3: 实现数学模型**

```js
const TAU = Math.PI * 2;

export const ORBIT_DEFINITIONS = [
  { label: "公司", radiusX: 0.46, radiusY: 0.17, tiltDeg: 7, durationMs: 24_000, direction: 1, phase: 0.08, accent: "#27d8c2" },
  { label: "生意", radiusX: 0.38, radiusY: 0.27, tiltDeg: -28, durationMs: 31_000, direction: -1, phase: 2.4, accent: "#9ec5e7" },
  { label: "估值", radiusX: 0.29, radiusY: 0.39, tiltDeg: 38, durationMs: 27_000, direction: 1, phase: 1.1, accent: "#ffffff" },
  { label: "技术", radiusX: 0.24, radiusY: 0.44, tiltDeg: -8, durationMs: 35_000, direction: -1, phase: 4.2, accent: "#6ea5d6" },
  { label: "风控", radiusX: 0.43, radiusY: 0.33, tiltDeg: 58, durationMs: 39_000, direction: 1, phase: 5.1, accent: "#27d8c2" },
];

export function getOrbitAngle(orbit, elapsedMs, speed = 1) {
  return orbit.phase + orbit.direction * (elapsedMs / orbit.durationMs) * TAU * speed;
}

export function getOrbitPoint(orbit, angle, width, height) {
  const x = Math.cos(angle) * width * orbit.radiusX;
  const y = Math.sin(angle) * height * orbit.radiusY;
  const tilt = orbit.tiltDeg * Math.PI / 180;
  return {
    x: Math.round((width / 2 + x * Math.cos(tilt) - y * Math.sin(tilt)) * 1e6) / 1e6,
    y: Math.round((height / 2 + x * Math.sin(tilt) + y * Math.cos(tilt)) * 1e6) / 1e6,
  };
}

export function getCanvasPixelRatio(value) {
  return Math.min(2, Math.max(1, Number(value) || 1));
}
```

- [ ] **Step 4: 将测试脚本纳入单元测试**

```json
"test:unit": "node --test tests/orbit-model.test.mjs tests/prototype-*.test.mjs"
```

- [ ] **Step 5: 运行测试确认通过**

Run: `npm run test:unit`

Expected: orbit model tests and existing prototype tests pass.

- [ ] **Step 6: 提交数学模型**

```bash
git add lib/orbit-model.mjs tests/orbit-model.test.mjs package.json
git commit -m "feat: add decision orbit model"
```

### Task 2: Canvas 决策轨道与三层叠片 Logo

**Files:**
- Create: `app/decision-orbit.tsx`
- Modify: `app/home-page.tsx`
- Modify: `app/prototype-app.tsx`
- Modify: `app/globals.css`
- Modify: `tests/prototype-source.test.mjs`

**Interfaces:**
- Consumes: `ORBIT_DEFINITIONS`、`getOrbitAngle`、`getOrbitPoint`、`getCanvasPixelRatio`。
- Produces: `DecisionOrbit(): JSX.Element`。
- Produces: `.decision-orbit`, `.decision-orbit-canvas`, `.decision-orbit-core` responsive styles.

- [ ] **Step 1: 写 Canvas 和 Logo 失败契约**

在 `tests/prototype-source.test.mjs` 读取 `app/decision-orbit.tsx`，并加入以下断言：

```js
assert.match(home, /<DecisionOrbit\s*\/>/);
assert.doesNotMatch(home, /research-orbit orbit-one/);
assert.match(app, /<span className="brand-mark"><Layers3 size=\{21\}/);
for (const contract of [
  /requestAnimationFrame/,
  /ResizeObserver/,
  /IntersectionObserver/,
  /document\.visibilityState/,
  /prefers-reduced-motion/,
  /getOrbitPoint/,
  /aria-label="公司、生意、估值、技术与风控围绕决策中心持续运行"/,
]) assert.match(orbit, contract);
```

- [ ] **Step 2: 运行测试确认失败**

Run: `node --test --test-name-pattern "production page" tests/prototype-source.test.mjs`

Expected: FAIL because `decision-orbit.tsx` and the new contracts are absent.

- [ ] **Step 3: 创建 `DecisionOrbit` 组件**

组件必须使用以下绘制与生命周期实现：

```tsx
"use client";

import { useEffect, useRef } from "react";
import { Layers3 } from "lucide-react";
import { ORBIT_DEFINITIONS, getCanvasPixelRatio, getOrbitAngle, getOrbitPoint } from "../lib/orbit-model.mjs";

function drawPill(context: CanvasRenderingContext2D, width: number, height: number, point: { x: number; y: number }, label: string) {
  context.font = '500 13px "Microsoft YaHei", sans-serif';
  const pillWidth = context.measureText(label).width + 20;
  const preferredX = point.x > width / 2 ? point.x + 14 : point.x - pillWidth - 14;
  const x = Math.max(4, Math.min(width - pillWidth - 4, preferredX));
  const y = Math.max(4, Math.min(height - 30, point.y - 15));
  context.beginPath();
  context.roundRect(x, y, pillWidth, 30, 15);
  context.fillStyle = "rgba(6, 9, 17, .86)";
  context.fill();
  context.strokeStyle = "rgba(134, 169, 204, .28)";
  context.stroke();
  context.fillStyle = "#dbe8f5";
  context.textAlign = "center";
  context.textBaseline = "middle";
  context.fillText(label, x + pillWidth / 2, y + 15);
}

function drawScene(context: CanvasRenderingContext2D, width: number, height: number, elapsed: number) {
  context.clearRect(0, 0, width, height);
  const glow = context.createRadialGradient(width / 2, height / 2, 20, width / 2, height / 2, Math.min(width, height) * .42);
  glow.addColorStop(0, "rgba(39, 216, 194, .16)");
  glow.addColorStop(.42, "rgba(12, 50, 82, .24)");
  glow.addColorStop(1, "rgba(6, 9, 17, 0)");
  context.fillStyle = glow;
  context.fillRect(0, 0, width, height);

  for (const orbit of ORBIT_DEFINITIONS) {
    context.save();
    context.translate(width / 2, height / 2);
    context.rotate(orbit.tiltDeg * Math.PI / 180);
    context.beginPath();
    context.ellipse(0, 0, width * orbit.radiusX, height * orbit.radiusY, 0, 0, Math.PI * 2);
    context.strokeStyle = orbit.accent === "#27d8c2" ? "rgba(39, 216, 194, .34)" : "rgba(134, 169, 204, .32)";
    context.lineWidth = 1.25;
    context.stroke();
    context.restore();

    const angle = getOrbitAngle(orbit, elapsed, 1);
    const point = getOrbitPoint(orbit, angle, width, height);
    context.save();
    context.shadowColor = orbit.accent;
    context.shadowBlur = 16;
    context.fillStyle = orbit.accent;
    context.beginPath();
    context.roundRect(point.x - 5, point.y - 5, 10, 10, 3);
    context.fill();
    context.restore();
    drawPill(context, width, height, point, orbit.label);
  }
}

export function DecisionOrbit() {
  const hostRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const slowRef = useRef(false);

  useEffect(() => {
    const host = hostRef.current;
    const canvas = canvasRef.current;
    const context = canvas?.getContext("2d");
    if (!host || !canvas || !context) return;

    const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
    let frameId = 0;
    let width = 0;
    let height = 0;
    let inViewport = true;
    let documentVisible = document.visibilityState === "visible";
    let elapsed = 0;
    let previousTime = performance.now();
    let speed = 1;

    const draw = () => {
      context.setTransform(getCanvasPixelRatio(window.devicePixelRatio), 0, 0, getCanvasPixelRatio(window.devicePixelRatio), 0, 0);
      drawScene(context, width, height, elapsed);
    };
    const resize = () => {
      const bounds = host.getBoundingClientRect();
      width = Math.max(1, bounds.width);
      height = Math.max(1, bounds.height);
      const ratio = getCanvasPixelRatio(window.devicePixelRatio);
      canvas.width = Math.round(width * ratio);
      canvas.height = Math.round(height * ratio);
      draw();
    };
    const shouldAnimate = () => inViewport && documentVisible && !reducedMotion.matches;
    const animate = (time: number) => {
      const delta = Math.min(48, Math.max(0, time - previousTime));
      previousTime = time;
      const targetSpeed = slowRef.current ? .35 : 1;
      speed += (targetSpeed - speed) * Math.min(1, delta / 240);
      elapsed += delta * speed;
      draw();
      frameId = shouldAnimate() ? requestAnimationFrame(animate) : 0;
    };
    const syncAnimation = () => {
      documentVisible = document.visibilityState === "visible";
      cancelAnimationFrame(frameId);
      frameId = 0;
      previousTime = performance.now();
      if (shouldAnimate()) frameId = requestAnimationFrame(animate);
      else draw();
    };

    const resizeObserver = new ResizeObserver(resize);
    const intersectionObserver = new IntersectionObserver(([entry]) => { inViewport = entry.isIntersecting; syncAnimation(); });
    resizeObserver.observe(host);
    intersectionObserver.observe(host);
    document.addEventListener("visibilitychange", syncAnimation);
    reducedMotion.addEventListener("change", syncAnimation);
    resize();
    syncAnimation();
    return () => {
      cancelAnimationFrame(frameId);
      resizeObserver.disconnect();
      intersectionObserver.disconnect();
      document.removeEventListener("visibilitychange", syncAnimation);
      reducedMotion.removeEventListener("change", syncAnimation);
    };
  }, []);

  return (
    <div ref={hostRef} className="decision-orbit" onPointerEnter={() => { slowRef.current = true; }} onPointerLeave={() => { slowRef.current = false; }}>
      <canvas ref={canvasRef} className="decision-orbit-canvas" aria-label="公司、生意、估值、技术与风控围绕决策中心持续运行">Canvas 不可用：多维研究共同支持决策。</canvas>
      <div className="decision-orbit-core" aria-hidden="true"><Layers3 size={28} /><strong>决策</strong><small>多维验证</small></div>
    </div>
  );
}
```

绘制函数使用 `context.ellipse()` 画固定轨道，使用 `getOrbitPoint()` 获取移动点坐标，用 `measureText()` 计算标签宽度；标签绘制在屏幕坐标系中，因此保持水平。

- [ ] **Step 4: 接入首页并更新 Logo**

```tsx
import { DecisionOrbit } from "./decision-orbit";

// Hero 右侧
<DecisionOrbit />

// 页头品牌标志
<span className="brand-mark"><Layers3 size={21} strokeWidth={1.8} /></span>
```

删除 `home-page.tsx` 中旧 `.research-visual`、`.orbit-glow`、五个 `.research-orbit` 和 `.orbit-core` 结构；从该文件移除未使用的 `Layers3` 导入。

- [ ] **Step 5: 替换轨道样式**

删除旧 `.research-visual` 到 `@keyframes orbit-float` 规则，加入：

```css
.decision-orbit { position: relative; min-height: 620px; isolation: isolate; overflow: hidden; }
.decision-orbit-canvas { position: absolute; inset: 0; width: 100%; height: 100%; display: block; }
.decision-orbit-core { position: absolute; top: 50%; left: 50%; width: 170px; height: 170px; display: grid; place-items: center; align-content: center; border: 1px solid rgba(39,216,194,.45); border-radius: 50%; background: radial-gradient(circle at 36% 30%, #1e5366, #0a1b2d 60%, #07101d); box-shadow: inset 0 0 42px rgba(39,216,194,.12), 0 0 80px rgba(10,70,92,.28); transform: translate(-50%,-50%); pointer-events: none; }
.decision-orbit-core strong { margin-top: 8px; font-size: 22px; }
.decision-orbit-core small { color: var(--ink-faint); font-size: 12px; }
```

同步将 1180、900、640 断点中的 `.research-visual` 改为 `.decision-orbit`，移动端核心尺寸改为 120px。

- [ ] **Step 6: 运行单元测试和 lint**

Run: `npm run test:unit && npm run lint`

Expected: all tests pass and lint exits 0.

- [ ] **Step 7: 提交 Canvas 与 Logo**

```bash
git add app/decision-orbit.tsx app/home-page.tsx app/prototype-app.tsx app/globals.css tests/prototype-source.test.mjs
git commit -m "feat: animate the decision orbit with canvas"
```

### Task 3: 公开风控与策略页面

**Files:**
- Modify: `app/prototype-app.tsx`
- Modify: `tests/prototype-source.test.mjs`
- Modify: `tests/browser-smoke.mjs`

**Interfaces:**
- Consumes: existing `navigate(next: PageId)` and hash router.
- Produces: direct public navigation to `#risk` and `#strategy`.

- [ ] **Step 1: 将门禁测试改为开放页面行为**

将源码测试的会员门禁用例替换为：

```js
test("risk and strategy research are directly accessible", async () => {
  const app = await readFile(new URL("../app/prototype-app.tsx", import.meta.url), "utf8");
  assert.doesNotMatch(app, /gateTarget|MemberGateDialog|__research803MemberActive|nav-lock|LockKeyhole/);
  assert.match(app, /if \(window\.location\.hash !== `#\$\{next\}`\) window\.history\.pushState/);
  assert.match(app, /page === "risk" && <RiskPage/);
  assert.match(app, /page === "strategy" &&/);
  assert.match(app, /803-2026-VIP/);
});
```

浏览器脚本将“点击风控出现门禁”改为：点击“风控提醒”后断言 `#risk` 和完整风险内容；重新进入“策略信号观察”后断言 `#strategy`、两套策略和候选列表，无需先兑换会员。

- [ ] **Step 2: 运行测试确认旧门禁导致失败**

Run: `npm run test:unit`

Expected: FAIL because gate state, lock icon and dialog still exist.

- [ ] **Step 3: 删除门禁状态和分支**

从 `PrototypeApp` 删除：

```tsx
type Research803Window = Window & { __research803MemberActive?: boolean };
const [isMember, setIsMember] = useState(() => typeof window !== "undefined" && Boolean((window as Research803Window).__research803MemberActive));
const [gateTarget, setGateTarget] = useState<"risk" | "strategy" | null>(null);
```

`syncHash` 直接执行 `setPage(getPageFromHash(window.location.hash) as PageId)`；`navigate` 不再检查会员状态。删除 `locked` 计算、锁图标、`openMembership`、`activateMembership`、`MemberGateDialog` 渲染和组件定义。

- [ ] **Step 4: 让会员演示流程自包含**

将 `MembershipPage` props 改为：

```tsx
function MembershipPage({ initialMode, onEnterMemberContent }: {
  initialMode: MembershipMode;
  onEnterMemberContent: (target: "risk" | "strategy") => void;
})
```

删除支付成功和兑换成功后的 `onActivated()` 调用；保留组件内部成功状态与进入研究页按钮。

- [ ] **Step 5: 运行单元测试**

Run: `npm run test:unit`

Expected: all unit tests pass.

- [ ] **Step 6: 提交开放访问**

```bash
git add app/prototype-app.tsx tests/prototype-source.test.mjs tests/browser-smoke.mjs
git commit -m "feat: open risk and strategy research pages"
```

### Task 4: 长鑫科技与宇树科技 IPO 对照台

**Files:**
- Modify: `app/ipo-page.tsx`
- Modify: `app/prototype-app.tsx`
- Modify: `app/globals.css`
- Modify: `tests/prototype-source.test.mjs`
- Modify: `tests/rendered-html.test.mjs`
- Modify: `tests/browser-smoke.mjs`

**Interfaces:**
- Produces: `IPO_COMPANIES`、`COMPARISON_ROWS` 和双公司页面结构。
- Consumes: existing `#ipo` route and page workspace.

- [ ] **Step 1: 写双公司失败契约**

```js
for (const copy of [
  "长鑫科技 × 宇树科技",
  "688825",
  "已上市",
  "注册生效",
  "核心业务",
  "商业模式",
  "资本开支特征",
  "需求驱动",
  "关键时间线",
  "观察变量与主要风险",
  "截至 2026-08-03",
]) assert.match(ipo, new RegExp(copy));
assert.doesNotMatch(ipo, /云岭芯科|澜海材料|远川装备|北辰智造|先进封装项目群研究/);
assert.match(app, /长鑫上市后首月观察/);
assert.match(app, /宇树发行安排观察/);
```

同步更新渲染和浏览器测试，使 `#ipo` 必须出现两家公司、两种阶段状态、对比矩阵、双时间线、风险和数据说明。

- [ ] **Step 2: 运行 IPO 相关测试确认失败**

Run: `node --test --test-name-pattern "IPO|daily intelligence" tests/prototype-source.test.mjs`

Expected: FAIL because the generic IPO demo is still rendered.

- [ ] **Step 3: 用双公司数据替换通用数组**

`IPO_COMPANIES` 必须包含：

```tsx
const IPO_COMPANIES = [
  {
    id: "cxmt",
    name: "长鑫科技",
    code: "688825",
    sector: "DRAM 存储芯片",
    stage: "已上市",
    stageIndex: 5,
    latest: "2026-07-24 · 科创板上市",
    summary: "覆盖 DRAM 设计、研发、生产和销售的一体化存储器制造平台。",
    variables: ["存储价格周期", "先进产品迭代", "产能爬坡与良率", "客户验证"],
    risks: ["行业周期波动", "重资产扩产压力", "技术迭代不确定性", "供应链变化"],
  },
  {
    id: "unitree",
    name: "宇树科技",
    code: "待发行",
    sector: "具身智能机器人",
    stage: "注册生效",
    stageIndex: 4,
    latest: "2026-07-01 · 首发注册获批",
    summary: "聚焦四足与人形机器人、灵巧机械臂、核心零部件和运动控制。",
    variables: ["商业化落地节奏", "人形机器人迭代", "核心部件自研", "海外与行业需求"],
    risks: ["竞争加剧", "产品可靠性验证", "供应链交付", "需求增长波动"],
  },
] as const;
```

`COMPARISON_ROWS` 固定为核心业务、产品形态、商业模式、资本开支特征、研发迭代、需求驱动和产业链影响七行。

- [ ] **Step 4: 重建 IPO 页面布局**

页面顺序必须为：标题与口径 → 双公司概览 → 发行进度对照 → 核心维度矩阵 → 双时间线 → 观察变量与风险 → 数据说明与合规提示。使用 `<section>`、`<article>`、`<table>` 和明确的 `aria-labelledby`；移动端对比表放入带 `overflow-x: auto` 的容器。

- [ ] **Step 5: 更新今日决策台事件**

```tsx
<div className="event-item past"><time>07.24</time><span><b>长鑫上市后首月观察</b><small>存储周期 · 产能与估值</small></span></div>
<div className="event-item current"><time>08.03</time><span><b>宇树发行安排观察</b><small>具身智能 · 发行节奏</small></span></div>
```

- [ ] **Step 6: 替换 IPO CSS**

新增 `.ipo-company-grid`、`.ipo-company-card`、`.ipo-progress-compare`、`.ipo-stage-track`、`.ipo-comparison-scroll`、`.ipo-comparison-table`、`.ipo-timeline-grid`、`.ipo-watch-grid` 样式。桌面双列，900px 以下单列；表格最小宽度 `760px` 并仅在自身容器横向滚动，页面本身不得溢出。

- [ ] **Step 7: 运行测试和构建**

Run: `npm test`

Expected: unit tests, production build and rendered HTML test pass.

- [ ] **Step 8: 提交 IPO 对照台**

```bash
git add app/ipo-page.tsx app/prototype-app.tsx app/globals.css tests/prototype-source.test.mjs tests/rendered-html.test.mjs tests/browser-smoke.mjs
git commit -m "feat: compare cxmt and unitree ipo progress"
```

### Task 5: 最终回归与本地交付

**Files:**
- Verify: `app/decision-orbit.tsx`
- Verify: `app/home-page.tsx`
- Verify: `app/prototype-app.tsx`
- Verify: `app/ipo-page.tsx`
- Verify: `app/globals.css`
- Verify: `tests/*.mjs`

**Interfaces:**
- Consumes: all prior task outputs.
- Produces: verified local site at `http://localhost:5174/#home`.

- [ ] **Step 1: 检查废弃门禁与旧 IPO 文案**

Run: `rg -n "MemberGateDialog|gateTarget|__research803MemberActive|nav-lock|长鑫 IPO 预期升温|云岭芯科|先进封装项目群研究" app lib README.md`

Expected: no matches.

- [ ] **Step 2: 执行 React 组件审查**

检查 effect 清理、重复监听器、离屏暂停、依赖数组、Canvas DPR、无障碍名称、移动端溢出和未使用导入；只修复与本次修改相关的问题。

- [ ] **Step 3: 执行 lint**

Run: `npm run lint`

Expected: exit 0 with no errors.

- [ ] **Step 4: 执行完整测试和生产构建**

Run: `npm test`

Expected: all tests pass, vinext production build succeeds, rendered HTML test passes.

- [ ] **Step 5: 验证本地服务与工作树**

Run: `Invoke-WebRequest -UseBasicParsing http://localhost:5174/`

Expected: HTTP 200 and HTML title `803研究 · A股数据与信息研究平台`.

Run: `git diff --check && git status --short`

Expected: no whitespace errors and a clean worktree after commits.

- [ ] **Step 6: 保持本地交付**

不调用 Sites 公开部署工具；保留 `codex/dark-site-redesign` 分支和本地开发服务器，打开 `http://localhost:5174/#home` 供用户浏览。
