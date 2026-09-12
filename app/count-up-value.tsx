"use client";

import { useEffect, useRef, useState } from "react";
import { getCountFrame } from "../lib/motion-model.mjs";

type CountUpValueProps = {
  value: number;
  suffix?: string;
  delay?: number;
  duration?: number;
  label: string;
};

export function CountUpValue({ value, suffix = "", delay = 0, duration = 1400, label }: CountUpValueProps) {
  const hostRef = useRef<HTMLSpanElement>(null);
  const [displayValue, setDisplayValue] = useState<number | null>(null);

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;

    const motionQuery = window.matchMedia?.("(prefers-reduced-motion: reduce)");
    const reduceMotion = motionQuery?.matches ?? false;
    if (reduceMotion || !("IntersectionObserver" in window)) {
      return;
    }

    let animationFrame = 0;
    let animationStart: number | null = null;
    let hasStarted = false;
    let observer: IntersectionObserver | null = null;

    const finish = () => {
      if (animationFrame) cancelAnimationFrame(animationFrame);
      observer?.disconnect();
      setDisplayValue(null);
    };

    const drawFrame = (timestamp: number) => {
      if (document.visibilityState === "hidden") {
        finish();
        return;
      }

      if (animationStart === null) animationStart = timestamp + delay;
      if (timestamp < animationStart) {
        animationFrame = requestAnimationFrame(drawFrame);
        return;
      }

      const progress = Math.min(1, (timestamp - animationStart) / duration);
      setDisplayValue(getCountFrame(value, progress));
      if (progress < 1) animationFrame = requestAnimationFrame(drawFrame);
    };

    observer = new IntersectionObserver(([entry]) => {
      if (!entry?.isIntersecting || hasStarted) return;
      hasStarted = true;
      observer?.unobserve(host);
      setDisplayValue(0);
      animationFrame = requestAnimationFrame(drawFrame);
    }, { threshold: 0.25, rootMargin: "0px 0px -8% 0px" });

    observer.observe(host);
    const handleMotionPreference = (event: MediaQueryListEvent) => {
      if (event.matches) finish();
    };
    motionQuery?.addEventListener("change", handleMotionPreference);

    return () => {
      motionQuery?.removeEventListener("change", handleMotionPreference);
      observer?.disconnect();
      if (animationFrame) cancelAnimationFrame(animationFrame);
    };
  }, [delay, duration, value]);

  return (
    <span ref={hostRef} className="count-up-value" data-count-up-target={value} aria-label={label}>
      <strong className="proof-value" aria-hidden="true">{displayValue ?? value}</strong>
      {suffix && <span className="count-up-suffix" aria-hidden="true">{suffix}</span>}
    </span>
  );
}
