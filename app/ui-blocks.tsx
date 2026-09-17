"use client";

import { useEffect, useRef } from "react";
import { FileText, LoaderCircle } from "lucide-react";

export function PageHeading({ eyebrow, title, description, right }: { eyebrow: string; title: string; description: string; right?: React.ReactNode }) {
  return (
    <div className="page-heading" data-reveal>
      <div>
        <span className="eyebrow">{eyebrow}</span>
        <h1 data-page-heading tabIndex={-1}>{title}</h1>
        <p>{description}</p>
      </div>
      {right && <div className="heading-action">{right}</div>}
    </div>
  );
}

export function StateTabs<T extends string>({ value, options, onChange, label }: { value: T; options: { id: T; label: string }[]; onChange: (next: T) => void; label: string }) {
  return (
    <div className="segmented" role="group" aria-label={label}>
      {options.map((option) => (
        <button type="button" key={option.id} aria-pressed={value === option.id} className={value === option.id ? "active" : ""} onClick={() => onChange(option.id)}>
          {option.label}
        </button>
      ))}
    </div>
  );
}

export function LoadingBlock({ label }: { label: string }) {
  return <div className="loading-block" role="status"><LoaderCircle className="spin" size={22} /><span>{label}</span><div><i /><i /><i /></div></div>;
}

export function EmptyBlock({ title, description, action, onAction }: { title: string; description: string; action?: string; onAction?: () => void }) {
  return <div className="empty-block"><span><FileText size={24} /></span><h3>{title}</h3><p>{description}</p>{action && <button type="button" className="secondary-button" onClick={onAction}>{action}</button>}</div>;
}

export function StatusBlock({ icon, title, description }: { icon: React.ReactNode; title: string; description: string }) {
  return <div className="surface-card status-block"><span>{icon}</span><div><h3>{title}</h3><p>{description}</p></div></div>;
}

export function useAccessibleOverlay<T extends HTMLElement>(onDismiss: () => void, dismissible = true) {
  const overlayRef = useRef<T>(null);
  const dismissRef = useRef(onDismiss);

  useEffect(() => {
    dismissRef.current = onDismiss;
  }, [onDismiss]);

  useEffect(() => {
    const overlay = overlayRef.current;
    if (!overlay) return;

    const previousFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const pageStack = overlay.closest(".page-stack");
    const overlayLayer = overlay.parentElement;
    const appFrame = overlayLayer?.parentElement?.classList.contains("app-frame") ? overlayLayer.parentElement : null;
    const backgroundTargets = Array.from(new Set([
      ...(appFrame
        ? Array.from(appFrame.children).filter((item) => !item.contains(overlay)) as HTMLElement[]
        : [
            ...document.querySelectorAll<HTMLElement>(".site-header, .product-statusbar, .mobile-nav"),
            ...Array.from(pageStack?.children ?? []).filter((item) => !item.contains(overlay)) as HTMLElement[],
          ]),
    ]));
    const previousStates = backgroundTargets.map((item) => ({
      item,
      inert: item.inert,
      ariaHidden: item.getAttribute("aria-hidden"),
    }));
    const previousOverflow = document.body.style.overflow;

    backgroundTargets.forEach((item) => {
      item.inert = true;
      item.setAttribute("aria-hidden", "true");
    });
    document.body.style.overflow = "hidden";

    const getFocusable = () => Array.from(overlay.querySelectorAll<HTMLElement>(
      "button:not([disabled]), [href], select:not([disabled]), input:not([disabled]), [tabindex]:not([tabindex='-1'])",
    )).filter((item) => item.getClientRects().length > 0);

    (getFocusable()[0] ?? overlay).focus();
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape" && dismissible) {
        event.preventDefault();
        dismissRef.current();
        return;
      }
      if (event.key !== "Tab") return;
      const focusable = getFocusable();
      if (!focusable.length) {
        event.preventDefault();
        overlay.focus();
        return;
      }
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };
    document.addEventListener("keydown", onKeyDown, true);

    return () => {
      document.removeEventListener("keydown", onKeyDown, true);
      previousStates.forEach(({ item, inert, ariaHidden }) => {
        item.inert = inert;
        if (ariaHidden === null) item.removeAttribute("aria-hidden");
        else item.setAttribute("aria-hidden", ariaHidden);
      });
      document.body.style.overflow = previousOverflow;
      if (previousFocus?.isConnected) previousFocus.focus();
    };
  }, [dismissible]);

  return overlayRef;
}
