import assert from "node:assert/strict";
import test from "node:test";

import { createServerContextRefresher } from "../app/use-server-context.ts";

const context = (serverDate) => ({
  serverDate,
  compactDate: serverDate.slice(5).replace("-", "/"),
  dottedDate: serverDate.replaceAll("-", "."),
  timezone: "Asia/Shanghai",
});

function deferred() {
  let resolve;
  const promise = new Promise((nextResolve) => { resolve = nextResolve; });
  return { promise, resolve };
}

test("latest server refresh wins when an earlier request resolves late", async () => {
  const first = deferred();
  const second = deferred();
  const applied = [];
  let callCount = 0;
  const refresher = createServerContextRefresher({
    fetchContext: () => [first.promise, second.promise][callCount++],
    onContext: (next) => applied.push(next.serverDate),
    schedule: () => 1,
    cancelSchedule: () => {},
    subscribeVisibility: () => () => {},
  });

  void refresher.refresh();
  void refresher.refresh();
  second.resolve(context("2026-08-18"));
  await Promise.resolve();
  first.resolve(context("2026-08-17"));
  await Promise.resolve();

  assert.deepEqual(applied, ["2026-08-18"]);
});

test("stopping the refresher cancels its schedule, visibility listener, and active request", () => {
  let cancelled = false;
  let unsubscribed = false;
  let requestSignal;
  const refresher = createServerContextRefresher({
    fetchContext: (signal) => {
      requestSignal = signal;
      return new Promise(() => {});
    },
    onContext: () => {},
    schedule: () => 1,
    cancelSchedule: () => { cancelled = true; },
    subscribeVisibility: () => () => { unsubscribed = true; },
  });

  refresher.start();
  void refresher.refresh();
  refresher.stop();

  assert.equal(cancelled, true);
  assert.equal(unsubscribed, true);
  assert.equal(requestSignal.aborted, true);
});
