"use client";

import { useEffect, useState } from "react";

import type { SystemContext } from "../lib/server/system-context";

const REFRESH_INTERVAL_MS = 300_000;

type ServerContextRefresherOptions = {
  fetchContext: (signal: AbortSignal) => Promise<SystemContext>;
  onContext: (context: SystemContext) => void;
  schedule: (callback: () => void, delay: number) => unknown;
  cancelSchedule: (handle: unknown) => void;
  subscribeVisibility: (callback: () => void) => () => void;
};

export function createServerContextRefresher({
  fetchContext,
  onContext,
  schedule,
  cancelSchedule,
  subscribeVisibility,
}: ServerContextRefresherOptions) {
  let disposed = false;
  let latestRequest = 0;
  let requestController: AbortController | null = null;
  let scheduleHandle: unknown;
  let unsubscribeVisibility: (() => void) | null = null;

  const refresh = async () => {
    const requestId = ++latestRequest;
    requestController?.abort();
    const controller = new AbortController();
    requestController = controller;

    try {
      const nextContext = await fetchContext(controller.signal);
      if (!disposed && !controller.signal.aborted && requestId === latestRequest) {
        onContext(nextContext);
      }
    } catch {
      // Keep the latest server-derived context if a refresh is cancelled or fails.
    }
  };

  return {
    refresh,
    start() {
      scheduleHandle = schedule(() => { void refresh(); }, REFRESH_INTERVAL_MS);
      unsubscribeVisibility = subscribeVisibility(() => { void refresh(); });
    },
    stop() {
      disposed = true;
      latestRequest += 1;
      requestController?.abort();
      if (scheduleHandle !== undefined) cancelSchedule(scheduleHandle);
      unsubscribeVisibility?.();
    },
  };
}

export function useServerContext(initialContext: SystemContext): SystemContext {
  const [context, setContext] = useState(initialContext);

  useEffect(() => {
    const refresher = createServerContextRefresher({
      fetchContext: async (signal) => {
        const response = await fetch("/api/system/context", { cache: "no-store", signal });
        if (!response.ok) throw new Error("Unable to refresh server context");
        return response.json() as Promise<SystemContext>;
      },
      onContext: setContext,
      schedule: (callback, delay) => window.setInterval(callback, delay),
      cancelSchedule: (handle) => window.clearInterval(handle as number),
      subscribeVisibility: (callback) => {
        const refreshWhenVisible = () => {
          if (document.visibilityState === "visible") callback();
        };
        document.addEventListener("visibilitychange", refreshWhenVisible);
        return () => document.removeEventListener("visibilitychange", refreshWhenVisible);
      },
    });

    refresher.start();
    return () => refresher.stop();
  }, []);

  return context;
}
