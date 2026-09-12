import assert from "node:assert/strict";

const appBaseUrl = process.env.APP_BASE_URL ?? "http://localhost:3000";
const cdpPort = process.env.CDP_PORT ?? "9222";
const expectMissingData = process.env.SMOKE_EXPECT_MISSING_DATA !== "false";
const contextResponse = await fetch(`${appBaseUrl}/api/system/context`);
assert.equal(contextResponse.ok, true, "system context endpoint responds successfully");
const serverContext = await contextResponse.json();
assert.match(serverContext.serverDate, /^\d{4}-\d{2}-\d{2}$/, "system context returns a server date");
assert.match(serverContext.dottedDate, /^\d{4}\.\d{2}\.\d{2}$/, "system context returns a homepage date");
assert.match(serverContext.compactDate, /^\d{2}\/\d{2}$/, "system context returns a research-page date");
const targets = await fetch(`http://127.0.0.1:${cdpPort}/json/list`).then((response) => response.json());
const target = targets.find((item) => item.type === "page");
assert.ok(target?.webSocketDebuggerUrl, "No debuggable browser page found");

const socket = new WebSocket(target.webSocketDebuggerUrl);
await new Promise((resolve, reject) => {
  socket.addEventListener("open", resolve, { once: true });
  socket.addEventListener("error", reject, { once: true });
});

let nextId = 0;
const pending = new Map();
const errors = [];
socket.addEventListener("message", (event) => {
  const message = JSON.parse(event.data);
  if (message.id && pending.has(message.id)) {
    const request = pending.get(message.id);
    pending.delete(message.id);
    if (message.error) request.reject(new Error(message.error.message));
    else request.resolve(message.result);
  }
  if (message.method === "Runtime.exceptionThrown") errors.push(message.params.exceptionDetails.text);
  if (message.method === "Log.entryAdded" && message.params.entry.level === "error") errors.push(message.params.entry.text);
});

function send(method, params = {}) {
  const id = ++nextId;
  socket.send(JSON.stringify({ id, method, params }));
  return new Promise((resolve, reject) => pending.set(id, { resolve, reject }));
}

async function evaluate(expression) {
  const result = await send("Runtime.evaluate", { expression, awaitPromise: true, returnByValue: true });
  if (result.exceptionDetails) throw new Error(result.exceptionDetails.text);
  return result.result.value;
}

const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
async function open(hash) {
  await send("Page.navigate", { url: `${appBaseUrl}/#${hash}` });
  await delay(900);
  await evaluate("document.fonts.ready.then(() => true)");
}

async function clickText(text, exact = true) {
  const clicked = await evaluate(`(() => {
    const item = [...document.querySelectorAll('button')].find((button) => ${exact ? "button.innerText.trim() ===" : "button.innerText.includes"} ${JSON.stringify(text)});
    if (!item) return false;
    item.click();
    return true;
  })()`);
  assert.equal(clicked, true, `Button not found: ${text}`);
  await delay(180);
}

async function clickSelector(selector) {
  const clicked = await evaluate(`(() => {
    const item = document.querySelector(${JSON.stringify(selector)});
    if (!(item instanceof HTMLElement)) return false;
    item.click();
    return true;
  })()`);
  assert.equal(clicked, true, `Element not found: ${selector}`);
  await delay(180);
}

async function waitFor(expression, label) {
  for (let attempt = 0; attempt < 20; attempt += 1) {
    if (await evaluate(expression)) return;
    await delay(100);
  }
  assert.fail(`Timed out waiting for ${label}`);
}

await send("Runtime.enable");
await send("Log.enable");

const routes = ["home", "today", "risk", "strategy", "ipo"];
for (const hash of routes) {
  await open(hash);
  assert.equal(await evaluate("document.body.innerText.trim().length > 0"), true, `${hash} page has content`);
  assert.equal(await evaluate("!document.querySelector('[data-nextjs-dialog], .vite-error-overlay, #webpack-dev-server-client-overlay')"), true, `${hash} has no error overlay`);
  assert.equal(await evaluate("Math.max(document.documentElement.scrollWidth, document.body.scrollWidth) <= window.innerWidth"), true, `${hash} has no desktop overflow`);
  const expectedDate = hash === "home" ? serverContext.dottedDate : serverContext.compactDate;
  assert.equal(await evaluate(`document.body.innerText.includes(${JSON.stringify(expectedDate)})`), true, `${hash} displays the server-derived date`);

  if (hash !== "home") {
    await waitFor(`(() => {
      const status = document.querySelector('[data-research-status]')?.getAttribute('data-research-status');
      return status !== null && status !== 'pending';
    })()`, `${hash} research response`);
    assert.equal(await evaluate("document.querySelector('[data-research-status]')?.getAttribute('data-research-status') !== null"), true, `${hash} exposes research status`);
    if (expectMissingData) assert.equal(await evaluate("document.body.innerText.includes('XX')"), true, `${hash} displays XX for unavailable database fields`);
  }
}

const renderedText = await evaluate("document.body.innerText");
for (const removedStrategy of ["策略 02", "quality", "估值修复"]) {
  assert.equal(renderedText.includes(removedStrategy), false, `${removedStrategy} is absent from the rendered application`);
}

await open("home");
for (const [label, hash] of [["今日决策台", "today"], ["风控提醒", "risk"], ["策略信号观察", "strategy"], ["IPO 专题", "ipo"], ["会员服务", "membership"]]) {
  await clickText(label);
  assert.equal(await evaluate("location.hash"), `#${hash}`, `${label} updates the hash route`);
}

await send("Emulation.setDeviceMetricsOverride", { width: 390, height: 844, deviceScaleFactor: 1, mobile: true });
await open("home");
await clickSelector(".mobile-menu-button");
assert.equal(await evaluate("document.querySelector('.mobile-menu-button')?.getAttribute('aria-expanded')"), "true", "mobile menu opens");
assert.equal(await evaluate("document.activeElement?.classList.contains('top-nav-item')"), true, "opening the menu focuses its first item");
await evaluate("document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })); true");
await delay(120);
assert.equal(await evaluate("document.querySelector('.mobile-menu-button')?.getAttribute('aria-expanded')"), "false", "Escape closes the mobile menu");
assert.equal(await evaluate("document.activeElement?.classList.contains('mobile-menu-button')"), true, "Escape restores focus to the mobile menu button");
const mobileRoutes = [["今日决策台", "today"], ["风控提醒", "risk"], ["策略信号观察", "strategy"], ["IPO 专题", "ipo"]];
const completedMobileRoutes = [];
for (const [label, hash] of mobileRoutes) {
  await clickSelector(".mobile-menu-button");
  assert.equal(await evaluate("document.querySelector('.mobile-menu-button')?.getAttribute('aria-expanded')"), "true", `${hash} mobile menu opens before navigation`);
  await clickText(label);
  assert.equal(await evaluate("location.hash"), `#${hash}`, `${hash} mobile navigation updates the hash route`);
  assert.equal(await evaluate("document.activeElement?.matches('main h1[data-page-heading]')"), true, `${hash} navigation focuses its heading`);
  assert.equal(await evaluate("Math.max(document.documentElement.scrollWidth, document.body.scrollWidth) <= window.innerWidth"), true, `${hash} mobile view has no overflow`);
  completedMobileRoutes.push(hash);
}
assert.deepEqual(completedMobileRoutes, mobileRoutes.map(([, hash]) => hash), "all mobile navigation routes complete in sequence");
await send("Emulation.clearDeviceMetricsOverride");

await open("membership");
assert.equal(await evaluate("!!document.querySelector('.membership-mode-tabs')"), true, "membership modes render");
await clickText("年度会员", false);
await clickText("演示开通");
assert.equal(await evaluate("!!document.querySelector('[role=dialog]')"), true, "purchase opens an accessible modal");
await evaluate("document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })); true");
await delay(180);
assert.equal(await evaluate("!document.querySelector('[role=dialog]')"), true, "Escape closes the purchase modal");
await clickText("演示开通");
await clickText("确认支付 ¥799");
assert.equal(await evaluate("document.body.innerText.includes('支付处理中')"), true, "purchase enters processing state");
await waitFor("document.body.innerText.includes('年度会员已开通')", "membership purchase success");
assert.equal(await evaluate("!!document.querySelector('.payment-success')"), true, "purchase reaches success state");
await clickText("申请电子发票");
assert.equal(await evaluate("document.body.innerText.includes('发票申请已提交')"), true, "purchase success keeps invoice interaction");
await clickText("进入策略信号观察");
assert.equal(await evaluate("location.hash"), "#strategy", "purchase success returns to strategy route");

await open("membership");
await clickText("兑换会员码");
await clickText("填入演示码");
assert.equal(await evaluate("document.querySelector('#member-code')?.value === '803-2026-VIP'"), true, "redemption demo fills its isolated membership code");
await clickText("立即兑换");
await waitFor("!!document.querySelector('.redeem-success')", "redemption success");
assert.equal(await evaluate("document.body.innerText.includes('会员权益已生效')"), true, "redemption succeeds");

await open("membership");
await clickText("兑换会员码");
await clickText("填入演示码");
await clickText("立即兑换");
await evaluate(`(() => {
  const input = document.querySelector('#member-code');
  const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set;
  setter.call(input, 'BAD-CODE');
  input.dispatchEvent(new Event('input', { bubbles: true }));
  return true;
})()`);
await delay(750);
assert.equal(await evaluate("!!document.querySelector('.redeem-success')"), false, "editing a code cancels pending redemption success");
await clickText("填入演示码");
await clickText("立即兑换");
await clickText("在线开通");
await delay(750);
await clickText("兑换会员码");
assert.equal(await evaluate("!!document.querySelector('.redeem-success')"), false, "changing membership mode cancels pending redemption success");

assert.deepEqual(errors, [], `Browser errors: ${errors.join(" | ")}`);
console.log(JSON.stringify({ routes: [...routes, "membership"], checks: ["server-date", "missing-data", "single-strategy", "hash", "mobile-menu", "mobile-heading-focus", "membership-purchase", "redemption-success", "redemption-race"], browserErrors: errors }, null, 2));
socket.close();
