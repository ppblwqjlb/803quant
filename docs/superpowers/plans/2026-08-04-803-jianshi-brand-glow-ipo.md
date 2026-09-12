# 803见势研究品牌、首页微光与 IPO 进度 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 将全站品牌统一为“803见势研究”，为首页四个入口增加克制动态微光，并将 IPO 发行进度重构为带日期的上下对齐双行。

**Architecture:** 品牌继续由 `PrototypeApp` 与根布局元数据集中输出，Logo 作为透明 PNG 静态资源。首页微光由 `product-entry` 的 CSS 伪元素实现，不增加运行时依赖；IPO 公司数据增加与六阶段同序的日期数组，视图直接映射为两行共享网格，并删除独立时间线模块。

**Tech Stack:** Next.js/Vinext、React 19、TypeScript、CSS、Node test、Playwright CDP 浏览器冒烟脚本。

## Global Constraints

- 最终品牌名精确为“803见势研究”，副标题“A 股数据与信息研究平台”保持不变。
- 使用用户提供 Logo 的蓝青色图形主体与透明背景，不使用原图深色方形底。
- 首页微光使用 CSS，不引入视频、Canvas 或额外动画依赖。
- `prefers-reduced-motion: reduce` 下停止微光漂移。
- IPO 阶段顺序固定为受理、问询、上市委、注册、申购、上市；日期格式为 `MM.DD`，缺失日期显示“待定”。
- 删除 IPO “关键时间线”模块。
- 仅在本地验证，不发布。

---

### Task 1: 全站品牌与透明 Logo

**Files:**
- Create: `public/803-jianshi-logo.png`
- Modify: `app/prototype-app.tsx:1-205`
- Modify: `app/layout.tsx:4-12`
- Modify: `app/globals.css:756-784, 997`
- Test: `tests/prototype-source.test.mjs:64-80`
- Test: `tests/rendered-html.test.mjs:16-28`

**Interfaces:**
- Consumes: 用户提供的 PNG `C:/Users/Administrator/AppData/Local/Temp/codex-clipboard-d8b3191c-604a-4d77-b514-1d9a70c6ea40.png`。
- Produces: `/803-jianshi-logo.png` 与全站品牌文案“803见势研究”。

- [ ] **Step 1: 更新品牌契约测试并确认失败**

将源码与 SSR 断言改为：

```js
assert.match(layout, /803见势研究 · A股数据与信息研究平台/);
assert.match(app, /<img src="\/803-jianshi-logo\.png" alt=""/);
assert.match(app, /<strong>803见势研究<\/strong>/);
assert.doesNotMatch(app + layout, />803研究</);
```

运行：`npm run test:unit`

预期：FAIL，提示新品牌名或 Logo `<img>` 尚不存在。

- [ ] **Step 2: 生成透明 Logo 资源**

读取原图，将与四角深色背景接近的像素转换为透明通道，裁切到非透明主体边界并保留 8px 安全边距，保存为 `public/803-jianshi-logo.png`。确认输出为 RGBA PNG 且四角 alpha 为 0。

- [ ] **Step 3: 替换品牌组件与元数据**

将品牌标记替换为：

```tsx
<span className="brand-mark" aria-hidden="true">
  <img src="/803-jianshi-logo.png" alt="" />
</span>
<div>
  <strong>803见势研究</strong>
  <span>A 股数据与信息研究平台</span>
</div>
```

同步将按钮 `aria-label`、`metadata.title`、`metadata.description` 与 `openGraph.title` 中的品牌名统一为“803见势研究”，删除 `Layers3` 的未使用导入。

- [ ] **Step 4: 调整 Logo 尺寸并运行品牌测试**

在 `.brand-mark` 中去掉旧边框与渐变，让图片使用：

```css
.brand-mark img { width: 100%; height: 100%; object-fit: contain; display: block; }
```

运行：`npm run test:unit && npm run build && node --test tests/rendered-html.test.mjs`

预期：全部 PASS。

- [ ] **Step 5: 提交品牌变更**

```bash
git add public/803-jianshi-logo.png app/prototype-app.tsx app/layout.tsx app/globals.css tests/prototype-source.test.mjs tests/rendered-html.test.mjs
git commit -m "feat: rebrand site as 803见势研究"
```

### Task 2: 首页四卡动态微光

**Files:**
- Modify: `app/globals.css:902-908, 972-975, 1007`
- Test: `tests/prototype-source.test.mjs:91-115`

**Interfaces:**
- Consumes: 现有 `.product-entry-grid` 与四个 `.product-entry` 按钮。
- Produces: `.product-entry::before` 独立微光层与 `@keyframes product-entry-glow-drift`。

- [ ] **Step 1: 写微光与减少动态契约测试**

在源码测试中增加：

```js
assert.match(css, /\.product-entry::before\s*\{[^}]*radial-gradient/s);
assert.match(css, /@keyframes product-entry-glow-drift/);
assert.match(css, /\.product-entry:nth-child\(2\)::before/);
assert.match(css, /\.product-entry:hover::before/);
assert.match(css, /@media \(prefers-reduced-motion: reduce\)[\s\S]*\.product-entry::before[^{]*\{[^}]*animation:\s*none/s);
```

运行：`node --test tests/prototype-source.test.mjs`

预期：FAIL，微光 CSS 尚不存在。

- [ ] **Step 2: 实现独立微光层**

将卡片设为隔离且裁切，并增加：

```css
.product-entry { isolation: isolate; overflow: hidden; }
.product-entry::before {
  content: "";
  position: absolute;
  z-index: -1;
  width: 78%;
  aspect-ratio: 1;
  left: 4%;
  bottom: -62%;
  border-radius: 50%;
  background: radial-gradient(circle, rgba(39,216,194,.2) 0%, rgba(23,107,255,.1) 38%, transparent 72%);
  filter: blur(18px);
  opacity: .66;
  transform: translate3d(0,0,0) scale(1);
  animation: product-entry-glow-drift 8s ease-in-out infinite alternate;
  transition: opacity .35s ease, transform .55s ease, filter .35s ease;
  pointer-events: none;
}
.product-entry:hover::before { opacity: .95; filter: blur(14px); transform: translate3d(7%, -10%, 0) scale(1.14); }
```

通过 `nth-child` 为四卡设置不同的水平位置、蓝青配比与动画延迟，并使用关键帧让光源小幅漂移。

- [ ] **Step 3: 添加动效降级与响应式约束**

```css
@media (prefers-reduced-motion: reduce) {
  .product-entry::before { animation: none; }
}
@media (max-width: 640px) {
  .product-entry::before { width: 64%; bottom: -54%; opacity: .5; }
}
```

运行：`node --test tests/prototype-source.test.mjs && npm run lint`

预期：全部 PASS。

- [ ] **Step 4: 提交首页微光**

```bash
git add app/globals.css tests/prototype-source.test.mjs
git commit -m "feat: add ambient glow to home modules"
```

### Task 3: IPO 双行日期进度与时间线删除

**Files:**
- Modify: `app/ipo-page.tsx:1-220`
- Modify: `app/globals.css:1415-1475`
- Test: `tests/prototype-source.test.mjs:198-245`
- Test: `tests/browser-smoke.mjs:170-190, 530-540`

**Interfaces:**
- Consumes: `IPO_STAGES` 六阶段常量与 `COMPANIES`。
- Produces: 每家公司 `stageDates` 六项数据和 `.ipo-progress-row` 上下对齐布局。

- [ ] **Step 1: 写 IPO 新结构失败测试**

在 `IPO research renders allocation and valuation scenarios` 中加入：

```js
assert.equal((ipo.match(/class="ipo-progress-row/g) ?? []).length, 2);
for (const date of ["12.30", "05.27", "06.05", "07.16", "07.27", "03.20", "05.25", "06.01", "07.01", "08.10"]) {
  assert.match(ipo, new RegExp(date.replace(".", "\\.")));
}
assert.match(ipo, /申购：08\.10，计划/);
assert.doesNotMatch(ipo, /关键时间线|ipo-timeline-section|ipo-company-timeline/);
```

并断言 CSS 中 `.ipo-progress-grid { grid-template-columns: 1fr; }`、`.ipo-progress-row` 与移动端横向滚动存在。

运行：`npm run test:unit`

预期：FAIL，旧双列结构和关键时间线仍存在。

- [ ] **Step 2: 增加阶段日期数据并简化旧 timeline**

每家公司增加与 `IPO_STAGES` 同序的数组：

```ts
stageDates: [
  { date: "12.30", state: "complete" },
  { date: "待定", state: "incomplete" },
  { date: "05.27", state: "complete" },
  { date: "06.05", state: "complete" },
  { date: "07.16", state: "complete" },
  { date: "07.27", state: "complete" },
]
```

宇树对应使用 `03.20 / 05.25 / 06.01 / 07.01 / 08.10 / 待定`，申购状态为 `planned`。移除仅供“关键时间线”使用的 `timeline` 字段与 `CalendarDays` 导入。

- [ ] **Step 3: 渲染上下两行共享网格**

每家公司输出：

```tsx
<article className="ipo-progress-row" key={company.id}>
  <header>...</header>
  <div className="ipo-progress-track" role="list" aria-label={`${company.name} 发行上市进度`}>
    {IPO_STAGES.map((stage, index) => {
      const milestone = company.stageDates[index];
      const stateLabel = milestone.state === "planned" ? "计划" : milestone.state === "complete" ? "已完成" : "待定";
      return (
        <span role="listitem" aria-label={`${stage}：${milestone.date}，${stateLabel}`} className={milestone.state} key={stage}>
          <i /><b>{stage}</b><small>{milestone.date}</small>{milestone.state === "planned" && <em>计划</em>}
        </span>
      );
    })}
  </div>
</article>
```

删除整个 `ipo-timeline-section` JSX。

- [ ] **Step 4: 重构 IPO 进度样式并清理时间线 CSS**

使用：

```css
.ipo-progress-grid { display: grid; grid-template-columns: 1fr; gap: 0; }
.ipo-progress-row { display: grid; grid-template-columns: minmax(190px, 260px) minmax(720px, 1fr); align-items: center; }
.ipo-progress-row + .ipo-progress-row { border-top: 1px solid var(--line); }
.ipo-progress-track { position: relative; display: grid; grid-template-columns: repeat(6, minmax(110px, 1fr)); }
```

删除 `.ipo-timeline-section`、`.ipo-timeline-grid`、`.ipo-company-timeline` 全部规则及响应式引用。移动端对 `.ipo-progress-row` 使用单列，公司信息在上，`.ipo-progress-track` 包裹层横向滚动且最小宽度保持六节点可读。

- [ ] **Step 5: 运行 IPO 与全量测试**

运行：`npm run test:unit && npm run lint && npm run build && node --test tests/rendered-html.test.mjs`

预期：全部 PASS，SSR 中无“关键时间线”。

- [ ] **Step 6: 提交 IPO 变更**

```bash
git add app/ipo-page.tsx app/globals.css tests/prototype-source.test.mjs tests/browser-smoke.mjs
git commit -m "feat: align IPO milestones with dates"
```

### Task 4: 本地浏览器视觉与交互验收

**Files:**
- Modify if needed: `app/globals.css`
- Modify if needed: `tests/browser-smoke.mjs`
- Test: `tests/browser-smoke.mjs`

**Interfaces:**
- Consumes: 本地开发服务器 `http://localhost:5174/`。
- Produces: 首页与 IPO 的桌面、移动端截图和无错误验收结果。

- [ ] **Step 1: 启动或复用本地开发服务器**

运行：`npm run dev -- --host 127.0.0.1 --port 5174`

预期：首页可在 `http://localhost:5174/#home` 打开。

- [ ] **Step 2: 验收桌面首页**

检查 1440px 视口：Logo 透明、品牌名为“803见势研究”、四卡微光彼此错开且文字清晰；悬停任一卡片时仅当前光晕增强；控制台无错误。

- [ ] **Step 3: 验收 IPO 桌面与移动端**

检查 `#ipo`：两家公司上下排列、六阶段垂直对齐、`08.10` 显示为计划、缺失节点显示“待定”、无“关键时间线”。在 390px 视口确认页面本身无横向溢出，进度节点区域可独立横向滚动。

- [ ] **Step 4: 验收减少动态模式**

在 `prefers-reduced-motion: reduce` 下重新加载首页，确认微光存在但不持续漂移。

- [ ] **Step 5: 运行最终验证并提交视觉修正**

运行：`npm run test && npm run lint && node tests/browser-smoke.mjs`

预期：单元、SSR、生产构建、lint、浏览器冒烟全部 PASS。

若视觉验收产生必要 CSS 修正，执行：

```bash
git add app/globals.css tests/browser-smoke.mjs
git commit -m "fix: polish brand glow and IPO progress layout"
```

