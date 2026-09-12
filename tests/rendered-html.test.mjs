import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { once } from "node:events";
import { createServer } from "node:net";
import { fileURLToPath } from "node:url";
import test from "node:test";

const projectRoot = fileURLToPath(new URL("..", import.meta.url));
let server;

async function getAvailablePort() {
  const listener = createServer();
  await new Promise((resolve, reject) => listener.listen(0, "127.0.0.1", resolve).once("error", reject));
  const { port } = listener.address();
  await new Promise((resolve, reject) => listener.close((error) => error ? reject(error) : resolve()));
  return port;
}

async function startServer() {
  if (server) return server;

  const port = await getAvailablePort();
  const child = spawn(
    process.execPath,
    [fileURLToPath(new URL("../.next/standalone/server.js", import.meta.url))],
    {
      cwd: projectRoot,
      env: { ...process.env, HOSTNAME: "127.0.0.1", PORT: String(port) },
      stdio: ["ignore", "pipe", "pipe"],
      windowsHide: true,
    },
  );
  let output = "";
  child.stdout.on("data", (chunk) => { output += chunk; });
  child.stderr.on("data", (chunk) => { output += chunk; });
  const baseUrl = `http://127.0.0.1:${port}`;

  for (let attempt = 0; attempt < 100; attempt += 1) {
    if (child.exitCode !== null) throw new Error(`standalone server exited early: ${output}`);
    try {
      const response = await fetch(baseUrl);
      if (response.ok) {
        server = { baseUrl, child };
        return server;
      }
    } catch {}
    await new Promise((resolve) => setTimeout(resolve, 100));
  }

  child.kill();
  throw new Error(`standalone server did not become ready: ${output}`);
}

test.after(async () => {
  if (server?.child.exitCode === null) {
    server.child.kill();
    await once(server.child, "exit");
  }
});

async function render() {
  const { baseUrl } = await startServer();

  return fetch(baseUrl, { headers: { accept: "text/html" } });
}

test("server-renders the public brand homepage by default", async () => {
  const response = await render();
  assert.equal(response.status, 200);
  assert.match(response.headers.get("content-type") ?? "", /^text\/html\b/i);

  const html = await response.text();
  const stylesheet = html.match(/href="(\/_next\/static\/[^\"]+\.css)"/)?.[1];
  assert.ok(stylesheet, "homepage includes a static stylesheet");
  const stylesheetResponse = await fetch(`${response.url}${stylesheet}`);
  assert.equal(stylesheetResponse.status, 200, "standalone server serves the built stylesheet");
  assert.match(html, /<title>803见势研究 · A股数据与信息研究平台<\/title>/);
  assert.match(html, /803见势研究/);
  assert.match(html, /803-jianshi-logo\.png/);
  assert.match(html, /src="\/803-jianshi-logo\.png"/);
  assert.doesNotMatch(html, /_vinext\/image\?url=%2F803-jianshi-logo\.png/);
  assert.match(html, /WHY 803/);
  assert.match(html, /JOIN 803/);
  assert.doesNotMatch(html, />803研究</);
  assert.match(html, /研究好公司，等待好价格，把握好节奏/);
  assert.match(html, /数据为据，决策有衡/);
  assert.match(html, /A 股数据与信息研究平台/);
  assert.match(html, /1 套策略/);
  assert.equal((html.match(/data-count-up-target="(?:10|300|1|1200)"/g) ?? []).length, 4);
  for (const label of ["10 年深耕", "服务 300+ 学员", "1 套策略", "社群活跃更新 1200 天"]) {
    assert.match(html, new RegExp(`aria-label="${label.replace("+", "\\+")}"`));
  }
  assert.match(html, /本平台提供公开信息整理、数据展示与标准化模型结果/);
  assert.ok((html.match(/data-reveal(?:=|\s|>)/g) ?? []).length >= 16);
  assert.doesNotMatch(html, /15%|年化复利|历史业绩|十套策略|策略选股/);
  assert.doesNotMatch(html, /class="sidebar"/);
  assert.doesNotMatch(html, /SkeletonPreview|Your site is taking shape|codex-preview/);
});

test("server renders four research modules with the server-derived Shanghai date", async () => {
  const { baseUrl } = await startServer();
  const [response, contextResponse] = await Promise.all([
    render(),
    fetch(`${baseUrl}/api/system/context`),
  ]);
  const html = await response.text();
  const context = await contextResponse.json();

  assert.equal((html.match(/class="product-entry"/g) ?? []).length, 4);
  assert.equal((html.match(/class="capability-row"/g) ?? []).length, 4);
  const productEntries = html.match(/<button[^>]*class="product-entry"[\s\S]*?<\/button>/g) ?? [];
  assert.equal(productEntries.length, 4);
  const productCopy = productEntries.join("\n");
  for (const name of ["今日决策台", "风控提醒", "策略信号观察", "IPO 专题"]) {
    assert.match(productCopy, new RegExp(name));
  }
  assert.doesNotMatch(productCopy, /会员服务/);
  assert.match(html, /四个模块，把信息整理成每日研究/);
  assert.equal(context.timezone, "Asia/Shanghai");
  assert.ok(html.includes(context.dottedDate), "homepage should render the server-derived dotted date");
  assert.doesNotMatch(html, /2026\.07\.31/);
});

test("the rendered orbit canvas describes the five decision dimensions", async () => {
  const response = await render();
  const html = await response.text();

  assert.match(
    html,
    /aria-label="策略、生意、估值、技术与风控围绕决策中心持续运行"/,
  );
});

test("missing research data has explicit dynamic status states", async () => {
  const { readFile } = await import("node:fs/promises");
  const [app, ipo, hook] = await Promise.all([
    readFile(new URL("../app/prototype-app.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/ipo-page.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/use-research-module.ts", import.meta.url), "utf8"),
  ]);

  assert.match(app + ipo, /data-research-status=\{/);
  for (const status of ["ready", "partial", "missing", "failed", "pending"]) assert.match(hook, new RegExp(`ResearchStatus[\\s\\S]*${status}`));
  assert.match(app + ipo, /displayValue/);
  assert.doesNotMatch(app + ipo, /QS-260803-CLOSE|IPO-260803-02|2026-08-03/);
});
