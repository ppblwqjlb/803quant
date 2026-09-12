# 803研究前端交付 Implementation Plan

> **For Codex:** REQUIRED SUB-SKILL: Use `superpowers:executing-plans` to implement this plan task-by-task.

**Goal:** 将已完成的深色 A 股研究平台原型正式迁移为“803研究”，保持所有页面与交互不回退，并生成可发布的新版本。

**Architecture:** 延续现有 vinext/Next.js App Router 单页原型。`PrototypeApp` 管理 hash 路由与会员演示状态，`HomePage` 管理官网首页，`prototype-model.mjs` 管理纯数据和兑换码校验。品牌迁移通过先更新测试契约，再修改 UI、元数据、模型常量和文档完成。

**Tech Stack:** Next.js 16 App Router、React 19、TypeScript、Tailwind CSS 4、lucide-react、vinext/Vite、Node test runner。

---

### Task 1: 锁定 803 品牌测试契约

**Files:**
- Modify: `tests/prototype-source.test.mjs`
- Modify: `tests/prototype-model.test.mjs`
- Modify: `tests/rendered-html.test.mjs`
- Modify: `tests/browser-smoke.mjs`

**Step 1: 写失败测试**

- 将元数据与页面品牌断言改为“803研究”。
- 增加首页英文标签 `WHY 803`、`JOIN 803` 和品牌标志 `803` 的源码断言。
- 将演示兑换码断言改为 `803-2026-VIP`。
- 增加实际运行源文件不包含旧品牌的断言。

**Step 2: 运行测试确认失败**

Run: `npm run test:unit`

Expected: 品牌、元数据和兑换码断言失败，证明测试可捕获未迁移状态。

**Step 3: 提交测试契约**

```bash
git add tests/prototype-source.test.mjs tests/prototype-model.test.mjs tests/rendered-html.test.mjs tests/browser-smoke.mjs
git commit -m "test: define 803 research brand contract"
```

### Task 2: 迁移页面品牌与会员演示状态

**Files:**
- Modify: `app/prototype-app.tsx`
- Modify: `app/home-page.tsx`
- Modify: `lib/prototype-model.mjs`

**Step 1: 更新站点品牌**

- 将页头 Logo、品牌文字和无障碍标签统一为“803研究”。
- 将 `WHY JIANSHI` 与 `JOIN JIANSHI` 改为 `WHY 803` 与 `JOIN 803`。
- 将客户端会员状态类型及 Window 属性迁移到 803 命名。
- 将演示兑换码迁移到 `803-2026-VIP`，并更新填入演示码按钮。

**Step 2: 运行单元测试**

Run: `npm run test:unit`

Expected: 品牌与模型测试通过。

**Step 3: 提交页面迁移**

```bash
git add app/prototype-app.tsx app/home-page.tsx lib/prototype-model.mjs
git commit -m "feat: rebrand platform as 803 research"
```

### Task 3: 更新元数据、分享图与交付说明

**Files:**
- Modify: `app/layout.tsx`
- Create: `public/og.png`
- Modify: `README.md`

**Step 1: 生成一次 803研究社交分享图**

使用 imagegen 生成与深海军蓝、青绿色研究终端视觉一致的横版品牌图，保存为 `public/og.png`，图中只使用短品牌与平台定位，不包含收益承诺。

**Step 2: 更新元数据**

- 标题改为 `803研究 · A股数据与信息研究平台`。
- 描述改为 803 品牌口径。
- Open Graph 图片改为 `/og.png` 并填写实际尺寸。

**Step 3: 更新 README**

- 标题与介绍使用“803研究”。
- 兑换码说明使用 `803-2026-VIP`。
- 保留演示数据、无真实支付和无投资建议的边界说明。

**Step 4: 运行单元和渲染测试**

Run: `npm test`

Expected: 元数据、分享图尺寸和静态 HTML 断言全部通过。

**Step 5: 提交交付信息**

```bash
git add app/layout.tsx public/og.png README.md
git commit -m "chore: update 803 research metadata and preview"
```

### Task 4: 回归检查与代码质量验证

**Files:**
- Verify: `app/prototype-app.tsx`
- Verify: `app/home-page.tsx`
- Verify: `app/globals.css`
- Verify: `tests/*.mjs`

**Step 1: 检查旧品牌残留**

Run: `rg -n "见势研究|WHY JIANSHI|JOIN JIANSHI|JIANSHI-2026-VIP|__jianshiMemberActive" app lib tests README.md`

Expected: 无匹配。

**Step 2: 执行代码规范检查**

Run: `npm run lint`

Expected: 0 errors。

**Step 3: 执行完整测试与生产构建**

Run: `npm test`

Expected: 单元测试、生产构建和渲染 HTML 测试全部通过。

**Step 4: 检查 Git 差异**

Run: `git diff --check && git status --short`

Expected: 无空白错误，仅显示预期文件。

### Task 5: 保存 Sites 版本并准备公开发布

**Files:**
- Verify: `.openai/hosting.json`
- Verify: Git commit SHA

**Step 1: 确认托管项目与访问级别**

读取现有 Sites 项目，确认项目 ID、当前版本和公开访问状态。

**Step 2: 推送当前分支**

为现有 Sites 源仓库取得临时凭证，推送 `codex/dark-site-redesign` 最新提交，不在 Git 配置中持久化凭证。

**Step 3: 保存新版本**

使用最新 commit SHA 保存 Sites 版本，并等待构建成功。

**Step 4: 发布控制**

若公开发布授权明确，部署新版本并验证线上 URL；若授权不足，保留已构建版本并向用户请求一次发布确认。

**Step 5: 最终交付**

报告测试结果、版本状态、公开 URL（如已发布）和当前演示范围。

