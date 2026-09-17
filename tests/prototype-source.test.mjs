import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("the project targets the standard Next.js Node runtime", async () => {
  const pkg = JSON.parse(await readFile(new URL("../package.json", import.meta.url), "utf8"));
  const nextConfig = await readFile(new URL("../next.config.ts", import.meta.url), "utf8");
  const tsconfig = JSON.parse(await readFile(new URL("../tsconfig.json", import.meta.url), "utf8"));
  const [browserSmoke, readme] = await Promise.all([
    readFile(new URL("./browser-smoke.mjs", import.meta.url), "utf8"),
    readFile(new URL("../README.md", import.meta.url), "utf8"),
  ]);

  assert.equal(pkg.name, "jianshi-research-platform");
  assert.equal(pkg.scripts.dev, "next dev");
  assert.equal(pkg.scripts.build, "next build");
  assert.equal(pkg.scripts.start, "node .next/standalone/server.js");
  assert.equal(pkg.dependencies.mysql2 !== undefined, true);
  assert.equal(pkg.dependencies.vinext, undefined);
  assert.match(nextConfig, /output:\s*["']standalone["']/);
  assert.match(nextConfig, /turbopack:\s*\{\s*root:\s*process\.cwd\(\)/);
  assert.equal(tsconfig.exclude.includes("examples"), false);
  assert.match(browserSmoke, /http:\/\/localhost:3000/);
  assert.doesNotMatch(readme, /Vinext/i);
  await assert.rejects(readFile(new URL("../worker/index.ts", import.meta.url)));
  await assert.rejects(readFile(new URL("../build/sites-vite-plugin.ts", import.meta.url)));
  await assert.rejects(readFile(new URL("../db/index.ts", import.meta.url)));
  await assert.rejects(readFile(new URL("../db/schema.ts", import.meta.url)));
  await assert.rejects(readFile(new URL("../drizzle.config.ts", import.meta.url)));
  await assert.rejects(readFile(new URL("../vite.config.ts", import.meta.url)));
  await assert.rejects(readFile(new URL("../examples/d1/app/api/notes/route.ts", import.meta.url)));
  await assert.rejects(readFile(new URL("../examples/d1/db/schema.ts", import.meta.url)));
});

function relativeLuminance(hex) {
  const channels = hex.match(/[\da-f]{2}/gi).map((channel) => Number.parseInt(channel, 16) / 255);
  const [red, green, blue] = channels.map((channel) =>
    channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4,
  );
  return 0.2126 * red + 0.7152 * green + 0.0722 * blue;
}

function contrastRatio(foreground, background) {
  const foregroundLuminance = relativeLuminance(foreground);
  const backgroundLuminance = relativeLuminance(background);
  return (Math.max(foregroundLuminance, backgroundLuminance) + 0.05)
    / (Math.min(foregroundLuminance, backgroundLuminance) + 0.05);
}

function pngDimensions(image) {
  assert.equal(image.subarray(1, 4).toString("ascii"), "PNG", "social preview must be a PNG image");
  return [image.readUInt32BE(16), image.readUInt32BE(20)];
}

test("faint metadata text keeps 4.5:1 contrast on both dark surfaces", async () => {
  const css = await readFile(new URL("../app/globals.css", import.meta.url), "utf8");
  const faint = css.match(/--ink-faint:\s*(#[\da-f]{6})/i)?.[1];
  assert.ok(faint, "--ink-faint must be a six-digit hex color");
  assert.ok(contrastRatio(faint, "#060911") >= 4.5, `${faint} is too faint on #060911`);
  assert.ok(contrastRatio(faint, "#0d1422") >= 4.5, `${faint} is too faint on #0d1422`);
});

test("count-up animation tolerates observer cleanup before its first callback", async () => {
  const countUp = await readFile(new URL("../app/count-up-value.tsx", import.meta.url), "utf8");
  assert.match(countUp, /observer\?\.unobserve\(host\)/);
});

test("global focus indicators cover interactive controls at 3:1 contrast", async () => {
  const css = await readFile(new URL("../app/globals.css", import.meta.url), "utf8");
  const focusColor = css.match(
    /button:focus-visible,\s*select:focus-visible,\s*summary:focus-visible,\s*a:focus-visible\s*\{[^}]*outline:\s*3px solid (#[\da-f]{6})/is,
  )?.[1];
  assert.ok(focusColor, "buttons, selects, summaries, and links need one opaque global focus color");
  assert.ok(contrastRatio(focusColor, "#060911") >= 3, `${focusColor} focus outline is too faint on #060911`);
  assert.ok(contrastRatio(focusColor, "#0d1422") >= 3, `${focusColor} focus outline is too faint on #0d1422`);
});

test("social preview metadata reports the shipped PNG dimensions", async () => {
  const [layout, image] = await Promise.all([
    readFile(new URL("../app/layout.tsx", import.meta.url), "utf8"),
    readFile(new URL("../public/og.png", import.meta.url)),
  ]);
  const metadataSize = layout.match(/og\.png"\s*,\s*width:\s*(\d+)\s*,\s*height:\s*(\d+)/);
  assert.ok(metadataSize, "social preview metadata must declare width and height");
  assert.deepEqual(
    metadataSize.slice(1).map(Number),
    pngDimensions(image),
  );
});

test("the production page exposes a brand homepage and five product pages", async () => {
  const [page, layout, app, todayPage, strategyPage, uiBlocks, home, orbit, countUp, motionController, css, browserSmoke, readme] = await Promise.all([
    readFile(new URL("../app/page.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/layout.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/prototype-app.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/today-page.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/strategy-page.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/ui-blocks.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/home-page.tsx", import.meta.url), "utf8").catch(() => ""),
    readFile(new URL("../app/decision-orbit.tsx", import.meta.url), "utf8").catch(() => ""),
    readFile(new URL("../app/count-up-value.tsx", import.meta.url), "utf8").catch(() => ""),
    readFile(new URL("../app/motion-controller.tsx", import.meta.url), "utf8").catch(() => ""),
    readFile(new URL("../app/globals.css", import.meta.url), "utf8"),
    readFile(new URL("./browser-smoke.mjs", import.meta.url), "utf8"),
    readFile(new URL("../README.md", import.meta.url), "utf8"),
  ]);

  assert.match(page, /<PrototypeApp/);
  assert.doesNotMatch(page, /SkeletonPreview|codex-preview/);
  assert.match(layout, /803见势研究/);
  assert.match(layout, /803见势研究 · A股数据与信息研究平台/);
  assert.match(app, /<Image src="\/803-jianshi-logo\.png" alt="" width=\{42\} height=\{42\} priority unoptimized/);
  assert.match(app, /<strong>803见势研究<\/strong>/);
  assert.match(home, /WHY 803/);
  assert.match(home, /JOIN 803/);
  assert.doesNotMatch(app + layout, />803研究</);
  for (const label of ["今日决策台", "风控提醒", "策略信号观察", "IPO 专题", "会员服务"]) {
    assert.match(app, new RegExp(label));
  }
  for (const copy of [
    "研究好公司，等待好价格，把握好节奏",
    "数据为据，决策有衡",
    "10 年深耕",
    "300+",
    "1 套策略",
    "1200 天",
    "好公司",
    "好生意",
    "好价格",
    "市场状态",
    "IPO 专题",
    "每天如何使用？",
    "可以查看全部历史吗？",
    "¥99",
    "¥259",
    "¥799",
  ]) {
    assert.match(home, new RegExp(copy.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
  }
  assert.match(app, /site-header/);
  assert.match(app, /page === "home"/);
  assert.doesNotMatch(app, /<aside className="sidebar"/);
  assert.equal((home.match(/className="hero-title-line"/g) ?? []).length, 3);
  assert.match(home, /<DecisionOrbit\s*\/>/);
  assert.equal((home.match(/<CountUpValue/g) ?? []).length, 1);
  assert.match(home, /value:\s*10/);
  assert.match(home, /value:\s*300,\s*suffix:\s*"\+"/);
  assert.match(home, /value:\s*1/);
  assert.match(home, /value:\s*1200/);
  assert.match(countUp, /IntersectionObserver/);
  assert.match(countUp, /requestAnimationFrame/);
  assert.match(countUp, /prefers-reduced-motion/);
  assert.match(countUp, /aria-label=\{label\}/);
  assert.match(countUp, /data-count-up-target=\{value\}/);
  assert.match(motionController, /new IntersectionObserver/);
  assert.match(motionController, /new MutationObserver/);
  assert.match(motionController, /dataset\.revealState/);
  assert.match(motionController, /observer\.unobserve/);
  assert.match(motionController, /prefers-reduced-motion/);
  assert.match(app, /<MotionController\s*\/>/);
  assert.ok((home.match(/data-reveal/g) ?? []).length >= 16, "homepage should reveal its major copy, rows, and cards");
  assert.ok(((app + todayPage + strategyPage).match(/data-reveal/g) ?? []).length >= 16, "all product pages should declare reveal sections");
  assert.doesNotMatch(home, /<section className="home-hero"[^>]*data-reveal/);
  assert.doesNotMatch(app, /<header className="site-header"[^>]*data-reveal/);
  assert.doesNotMatch(app, /<div className="product-statusbar"[^>]*data-reveal/);
  assert.doesNotMatch(home, /research-orbit orbit-one/);
  for (const contract of [
    /requestAnimationFrame/,
    /ResizeObserver/,
    /IntersectionObserver/,
    /document\.visibilityState/,
    /prefers-reduced-motion/,
    /getOrbitPoint/,
  ]) {
    assert.match(orbit, contract);
  }
  for (const contract of [
    /--canvas:\s*#060911/,
    /--surface:\s*#0d1422/,
    /--brand:\s*#ffffff/,
    /font-size:\s*18px/,
    /--text-body:\s*18px/,
    /--text-compact:\s*16px/,
    /--text-meta:\s*14px/,
    /\.site-header\s*\{/,
    /\.home-hero\s*\{/,
    /\.proof-matrix\s*\{/,
    /\[data-reveal\]\[data-reveal-state="pending"\]/,
    /translate3d\(0,\s*28px,\s*0\)/,
    /filter:\s*blur\(7px\)/,
    /\[data-reveal\]\[data-reveal-state="visible"\]/,
    /prefers-reduced-motion/,
  ]) {
    assert.match(css, contract);
  }
  assert.match(css, /\.product-entry::before\s*\{[^}]*radial-gradient/s);
  assert.match(css, /@keyframes product-entry-glow-drift/);
  assert.match(css, /\.product-entry:nth-child\(2\)::before/);
  assert.match(css, /\.product-entry:nth-child\(3\)::before/);
  assert.match(css, /\.product-entry:nth-child\(4\)::before/);
  assert.match(css, /\.product-entry:hover::before/);
  assert.match(css, /@media \(prefers-reduced-motion: reduce\)[\s\S]*?\.product-entry::before\s*\{[^}]*animation:\s*none/s);
  assert.match(css, /\.drawer-backdrop,\s*\.modal-backdrop\s*\{[^}]*z-index:\s*120/s);
  assert.match(home, /先看今日决策\s*<ArrowRight size=\{20\}\s*\/>/);
  const baseCtaScope = "\\.home-page \\.hero-actions :is\\(\\.primary-action, \\.secondary-action\\)";
  const bottomCtaScope = "\\.home-page \\.home-cta-actions :is\\(\\.primary-action, \\.secondary-action\\)";
  assert.match(css, new RegExp(`${baseCtaScope},\\s*${bottomCtaScope}\\s*\\{[^}]*background:\\s*#fff[^}]*color:\\s*#060911`, "s"));
  assert.match(css, new RegExp(`${baseCtaScope}:hover,\\s*${bottomCtaScope}:hover\\s*\\{[^}]*background:\\s*#176bff[^}]*color:\\s*#fff`, "s"));
  assert.match(css, new RegExp(`${baseCtaScope} > svg,\\s*${bottomCtaScope} > svg\\s*\\{[^}]*background:\\s*#060911[^}]*color:\\s*#fff`, "s"));
  assert.match(css, new RegExp(`${baseCtaScope}:hover > svg,\\s*${bottomCtaScope}:hover > svg\\s*\\{[^}]*background:\\s*#fff[^}]*color:\\s*#176bff`, "s"));
  assert.match(css, new RegExp(`${baseCtaScope}:focus-visible,\\s*${bottomCtaScope}:focus-visible\\s*\\{[^}]*outline:\\s*3px solid #176bff`, "s"));
  assert.match(css, new RegExp(`${baseCtaScope}[^}]*${bottomCtaScope}[^}]*transition:\\s*none[^}]*transform:\\s*none`, "s"));
  assert.doesNotMatch(css, /\.home-page \.primary-action(?:\s*,|\s*\{|:hover)/);
  assert.match(css, /\.candidate-table th\s*\{[^}]*font-size:\s*var\(--text-meta\)/s);
  assert.match(uiBlocks, /\.site-header, \.product-statusbar, \.mobile-nav/);
  assert.match(app, /aria-label=\{mobileMenuOpen \? "关闭产品导航" : "打开产品导航"\}/);
  assert.match(app + uiBlocks, /event\.key === "Escape"/);
  assert.match(app, /id="product-navigation"/);
  assert.match(app, /mobileMenuButtonRef/);
  assert.match(app, /productNavRef/);
  assert.match(app, /querySelector<HTMLButtonElement>\("button"\)\?\.focus\(\)/);
  assert.match(app, /mobileMenuButtonRef\.current\?\.focus\(\)/);
  assert.match(css, /\.eyebrow,\s*\.popular-label,\s*\.product-statusbar \.market-status,\s*\.section-title > small,\s*\.section-title > div > small\s*\{\s*font-size:\s*var\(--text-meta\)/s);
  assert.match(css, /\.state-banner,\s*\.loading-block\s*\{\s*font-size:\s*var\(--text-compact\)/s);
  assert.match(css, /@media\s*\(max-width:\s*640px\)/);
  assert.match(css, /min-height:\s*44px/);
  assert.match(browserSmoke, /data-research-status/);
  assert.match(browserSmoke, /membership-mode-tabs/);
  assert.match(readme, /品牌首页/);
  assert.match(readme, /803见势研究/);
  assert.match(readme, /#home/);
});

test("risk and strategy research are directly accessible", async () => {
  const [app, strategyPage, uiBlocks] = await Promise.all([
    readFile(new URL("../app/prototype-app.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/strategy-page.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/ui-blocks.tsx", import.meta.url), "utf8"),
  ]);

  assert.match(app, /window\.history\.pushState/);
  assert.match(app, /window\.addEventListener\("popstate", syncHash\)/);
  assert.match(app, /if \(window\.location\.hash !== `#\$\{next\}`\) window\.history\.pushState/);
  assert.match(app, /page === "risk" && <RiskPage/);
  assert.match(app, /page === "strategy" &&/);
  assert.doesNotMatch(app, /gateTarget|MemberGateDialog|__research803MemberActive|nav-lock|LockKeyhole/);
  assert.match(app, /803-2026-VIP/);
  assert.match(app, /type RedeemState = "idle" \| "validating" \| "success" \| "invalid"/);
  assert.match(app, /兑换码无效或已失效/);
  assert.match(uiBlocks, /overlayLayer\?\.parentElement\?\.classList\.contains\("app-frame"\)/);
  assert.doesNotMatch(app, /strategyId|strategy-selector|strategy-option|策略 02|好公司估值修复|quality/);
  assert.match(strategyPage, /run\.strategyCode/);
});

test("the today console composes the macro dashboard and strategy pages", async () => {
  const [app, home] = await Promise.all([
    readFile(new URL("../app/prototype-app.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/home-page.tsx", import.meta.url), "utf8"),
  ]);

  for (const label of ["今日决策台", "风控提醒", "策略信号观察", "IPO 专题", "会员服务"]) {
    assert.match(app, new RegExp(label));
  }
  assert.doesNotMatch(app, /id: "intel"/);
  assert.match(app, /<TodayPage/);
  assert.match(app, /<StrategyPage/);
  assert.match(app, /emptyTodayResearchData/);
  assert.match(app, /emptyStrategyResearchData/);
  assert.match(app, /今日决策台/);
  assert.match(home, /id: "ipo"/);
});

test.skip("legacy IPO fixture copy is replaced by database-backed rendering", async () => {
  const [css, ipo] = await Promise.all([
    readFile(new URL("../app/globals.css", import.meta.url), "utf8"),
    readFile(new URL("../app/ipo-page.tsx", import.meta.url), "utf8"),
  ]);
  const { getAtLeastOneHitProbability, getMarketCapYi, getReferenceIssuePrice } = await import(
    new URL("../lib/prototype-model.mjs", import.meta.url),
  );

  for (const copy of [
    "长鑫科技 × 宇树科技",
    "688825",
    "已上市",
    "注册生效",
    "核心业务",
    "商业模式",
    "资本开支特征",
    "需求驱动",
    "申购",
    "12.30",
    "07.16",
    "08.10",
    "待定",
    "中签难度对比",
    "66.88 亿股 / 579.19 亿元",
    "8.66 元/股",
    "单签 4,330 元",
    "3,349,000 股",
    "3,349 万元",
    "6,698 个",
    "0.4714%",
    "理论约 212 个配号中 1 个",
    "发行量不低于 4,044.64 万股 / 拟募集 42.02 亿元",
    "新股比例不低于 10%",
    "参考参数 · 情景测算",
    "6,000 股",
    "6 万元",
    "12 个",
    "约 0.02%",
    "非官方定价 · 情景测算",
    "开盘流通市值",
    "总市值",
    "截至 2026-08-03",
  ]) {
    assert.match(ipo, new RegExp(copy.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
  }
  assert.equal(getReferenceIssuePrice(4_201_710_000, 40_446_434).toFixed(2), "103.88");
  assert.equal((getReferenceIssuePrice(4_201_710_000, 40_446_434) * 500).toLocaleString("zh-CN"), "51,940");
  assert.equal(getAtLeastOneHitProbability(0.02, 12).toFixed(4), "0.2397");
  assert.equal(getMarketCapYi(100, 404_464_340).toFixed(2), "404.46");
  assert.equal(getMarketCapYi(300, 404_464_340).toFixed(2), "1213.39");
  assert.equal((ipo.match(/className="ipo-progress-row"/g) ?? []).length, 1);
  for (const date of ["12.30", "05.27", "06.05", "07.16", "07.27", "03.20", "05.25", "06.01", "07.01", "08.10"]) {
    assert.match(ipo, new RegExp(date.replace(".", "\\.")));
  }
  assert.match(ipo, /item\.details\.map\(\(\[label, value\]\)/);
  assert.match(ipo, /stateLabel = milestone\.state/);
  assert.doesNotMatch(ipo, /关键时间线|ipo-timeline-section|ipo-company-timeline/);
  assert.match(css, /\.ipo-progress-grid\s*\{[^}]*grid-template-columns:\s*1fr/s);
  assert.match(css, /\.ipo-progress-row\s*\{/);
  assert.match(css, /\.ipo-progress-track\s*\{[^}]*grid-template-columns:\s*repeat\(6/s);
  assert.doesNotMatch(css, /\.ipo-timeline-section|\.ipo-company-timeline/);
  assert.doesNotMatch(ipo, /观察变量与主要风险|ipo-watch-section|待观察变量|主要风险/);
  assert.ok((ipo.match(/data-reveal/g) ?? []).length >= 9, "IPO heading, sections, and compliance note should reveal on scroll");
  assert.doesNotMatch(ipo, /云岭芯科|澜海材料|远川装备|北辰智造|演示项目/);
});

test.skip("legacy commercial-space fixture copy is replaced by database-backed rendering", async () => {
  const ipo = await readFile(new URL("../app/ipo-page.tsx", import.meta.url), "utf8");

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
    "液氧甲烷运载火箭与可重复使用技术",
    "力箭系列运载火箭研发、生产与发射服务",
    "上交所受理",
    "更新财务资料并恢复已问询",
    "进入已问询",
    "更新招股资料",
  ]) {
    assert.ok(ipo.includes(copy), `IPO page must render ${copy}`);
  }
  assert.doesNotMatch(ipo, /蓝箭科技|中宇航天/);
});

test("brand, marketing copy, colors, and numerals follow the information-platform contract", async () => {
  const [app, home, css, layout] = await Promise.all([
    readFile(new URL("../app/prototype-app.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/home-page.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/globals.css", import.meta.url), "utf8"),
    readFile(new URL("../app/layout.tsx", import.meta.url), "utf8"),
  ]);

  assert.equal((home.match(/数据为据，决策有衡/g) ?? []).length, 2);
  assert.match(app, /本平台提供公开信息整理、数据展示与标准化模型结果，不构成证券投资咨询或个性化投资建议。市场有风险，投资需独立判断。/);
  assert.match(home, /1 套策略/);
  assert.doesNotMatch(home, /两套规则策略|2 套策略/);
  assert.match(layout, /A股数据与信息研究平台/);

  for (const prohibited of ["15%", "年化复利", "历史业绩", "十套策略", "10 套策略", "买什么", "仓位", "风险暴露", "个股推荐", "强制防守", "决定一笔交易"]) {
    assert.doesNotMatch(home + app, new RegExp(prohibited));
  }

  assert.match(css, /font-feature-settings:\s*"zero" 0/);
  assert.doesNotMatch(css, /ui-monospace|Consolas/);
  const invalidFontShorthands = css
    .split(/\r?\n/)
    .filter((line) => /\bfont:\s*.+\binherit\s*;/.test(line) && !/\bfont:\s*inherit\s*;/.test(line));
  assert.deepEqual(invalidFontShorthands, []);
  assert.match(css, /--brand:\s*#ffffff/i);
  assert.doesNotMatch(css, /color:\s*#27d8c2/i);
  assert.match(css, /svg\s*\{[^}]*color:\s*currentColor/s);
});

test("database-backed research pages use the four research APIs without static research snapshots", async () => {
  const [app, ipo, model, hook] = await Promise.all([
    readFile(new URL("../app/prototype-app.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/ipo-page.tsx", import.meta.url), "utf8"),
    readFile(new URL("../lib/prototype-model.mjs", import.meta.url), "utf8"),
    readFile(new URL("../app/use-research-module.ts", import.meta.url), "utf8"),
  ]);

  for (const endpoint of ["/api/research/today", "/api/research/risk", "/api/research/strategy", "/api/research/ipo"]) {
    assert.match(app + ipo, new RegExp(endpoint.replaceAll("/", "\\/")));
  }
  assert.match(app + ipo, /useResearchModule/);
  assert.match(hook, /cache:\s*["']no-store["']/);
  assert.match(hook, /AbortController/);
  assert.match(hook, /visibilitychange/);
  assert.doesNotMatch(app, /\b(?:RISK_SCENARIOS|CANDIDATES|INTEL_ITEMS|RESEARCH_SNAPSHOT)\b/);
  assert.doesNotMatch(ipo, /\b(?:COMPANIES|SPACE_IPOS|ALLOCATION_CASES|UNITREE_VALUATIONS|COMPARISON_ROWS)\b/);
  assert.doesNotMatch(model, /\b(?:RISK_SCENARIOS|CANDIDATES|INTEL_ITEMS|RESEARCH_SNAPSHOT)\b/);
  assert.match(model, /MEMBERSHIP_DEMO/);
});

test("browser smoke gates server dates, missing values, and the single-strategy contract", async () => {
  const browserSmoke = await readFile(new URL("../tests/browser-smoke.mjs", import.meta.url), "utf8");

  assert.match(browserSmoke, /\/api\/system\/context/);
  assert.match(browserSmoke, /serverDate/);
  assert.match(browserSmoke, /dottedDate/);
  assert.match(browserSmoke, /compactDate/);
  assert.match(browserSmoke, /"home"/);
  assert.match(browserSmoke, /includes\(['"]XX['"]\)/);
  assert.match(browserSmoke, /策略 02/);
  assert.match(browserSmoke, /quality/);
  assert.match(browserSmoke, /估值修复/);
});
