"use client";

import { useLayoutEffect } from "react";

const REVEAL_SELECTOR = "[data-reveal]";

export function MotionController() {
  useLayoutEffect(() => {
    const motionQuery = window.matchMedia?.("(prefers-reduced-motion: reduce)");
    let reduceMotion = motionQuery?.matches ?? false;
    let observer: IntersectionObserver | null = null;

    const reveal = (element: HTMLElement) => {
      element.dataset.revealState = "visible";
      if (observer) observer.unobserve(element);
    };

    const prepare = (element: HTMLElement) => {
      if (element.dataset.revealState === "visible") return;

      const requestedDelay = Number(element.dataset.revealDelay ?? 0);
      const delay = Number.isFinite(requestedDelay) ? Math.min(280, Math.max(0, requestedDelay)) : 0;
      element.style.setProperty("--reveal-delay", `${delay}ms`);

      if (reduceMotion || !observer) {
        reveal(element);
        return;
      }

      element.dataset.revealState = "pending";
      observer.observe(element);
    };

    if (!reduceMotion && "IntersectionObserver" in window) {
      observer = new IntersectionObserver((entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) reveal(entry.target as HTMLElement);
        });
      }, { threshold: 0.12, rootMargin: "0px 0px -8% 0px" });
    }

    const prepareNode = (node: Node) => {
      if (!(node instanceof HTMLElement)) return;
      if (node.matches(REVEAL_SELECTOR)) prepare(node);
      node.querySelectorAll<HTMLElement>(REVEAL_SELECTOR).forEach(prepare);
    };

    document.querySelectorAll<HTMLElement>(REVEAL_SELECTOR).forEach(prepare);

    const handleMotionPreference = (event: MediaQueryListEvent) => {
      if (!event.matches) return;
      reduceMotion = true;
      observer?.disconnect();
      observer = null;
      document.querySelectorAll<HTMLElement>(REVEAL_SELECTOR).forEach(reveal);
    };
    motionQuery?.addEventListener("change", handleMotionPreference);

    const mutationObserver = new MutationObserver((records) => {
      records.forEach((record) => record.addedNodes.forEach(prepareNode));
    });
    mutationObserver.observe(document.body, { childList: true, subtree: true });

    return () => {
      motionQuery?.removeEventListener("change", handleMotionPreference);
      mutationObserver.disconnect();
      observer?.disconnect();
    };
  }, []);

  return null;
}
