"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { createResearchRequestGate } from "../lib/research/request-gate";

export type ResearchStatus = "ready" | "pending" | "partial" | "missing" | "failed";

export type ResearchResponse<T> = {
  serverDate: string;
  timezone: string;
  status: ResearchStatus;
  batchId: string | null;
  dataAsOf: string | null;
  missingFields: string[];
  data: T;
};

function initialResponse<T>(emptyData: () => T): ResearchResponse<T> {
  return { serverDate: "", timezone: "Asia/Shanghai", status: "missing", batchId: null, dataAsOf: null, missingFields: [], data: emptyData() };
}

export function useResearchModule<T>(endpoint: string, emptyData: () => T) {
  const emptyRef = useRef(emptyData);
  const controllerRef = useRef<AbortController | null>(null);
  const gateRef = useRef(createResearchRequestGate());
  const [response, setResponse] = useState<ResearchResponse<T>>(() => initialResponse(emptyData));
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    controllerRef.current?.abort();
    const controller = new AbortController();
    controllerRef.current = controller;
    const request = gateRef.current.begin();
    setLoading(true);
    try {
      const result = await fetch(endpoint, { cache: "no-store", signal: controller.signal });
      const payload = await result.json() as Partial<ResearchResponse<T>>;
      if (!result.ok && payload.status !== "failed") throw new Error("research request failed");
      if (gateRef.current.isCurrent(request)) setResponse({ ...initialResponse(emptyRef.current), ...payload, data: payload.data ?? emptyRef.current() });
    } catch (error) {
      if (gateRef.current.isCurrent(request) && (error as Error).name !== "AbortError") setResponse({ ...initialResponse(emptyRef.current), status: "failed" });
    } finally {
      if (gateRef.current.isCurrent(request)) setLoading(false);
    }
  }, [endpoint]);

  useEffect(() => {
    gateRef.current = createResearchRequestGate();
    const initialRefresh = window.setTimeout(() => { void refresh(); }, 0);
    const onVisibility = () => { if (document.visibilityState === "visible") void refresh(); };
    document.addEventListener("visibilitychange", onVisibility);
    return () => { window.clearTimeout(initialRefresh); gateRef.current.invalidate(); controllerRef.current?.abort(); document.removeEventListener("visibilitychange", onVisibility); };
  }, [endpoint, refresh]);

  return { response, loading, refresh };
}
