"use client";

import { useEffect, useId, useRef, useState } from "react";

/**
 * Module:   FeatureTip
 * Purpose:  The "?" toggletip beside a /join checklist item that carries a
 *           `tip` in the business-features registry. One tap opens a short
 *           explanation; it closes on a second tap, a tap outside, or Esc.
 * Does NOT: own the words (the caller passes the translated label + text), or
 *           move layout — the bubble is absolutely positioned against the item
 *           (the caller's `relative` <li>), so opening it never reflows the list.
 * Related:  components/join/JoinFeatures.jsx (the only caller);
 *           components/ui/InfoTooltip.jsx (the hover tooltip — a different
 *           pattern: a toggletip is a button that shows content on activation,
 *           which works on touch, where hover does not exist).
 * History:  MEH-2799 (creation).
 *
 * a11y: the button keeps its name («מה זה?») and reports state through
 * aria-expanded; the bubble is a live region so the text is announced when it
 * appears (Heydon Pickering's toggletip pattern). No animation at all, so
 * there is nothing for prefers-reduced-motion to switch off.
 */
export default function FeatureTip({ label, text }) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef(null);
  const tipId = useId();

  useEffect(() => {
    if (!open) return undefined;
    const onPointerDown = (event) => {
      if (rootRef.current && !rootRef.current.contains(event.target)) setOpen(false);
    };
    const onKeyDown = (event) => {
      if (event.key === "Escape") setOpen(false);
    };
    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);

  return (
    <span ref={rootRef} className="inline-block align-middle">
      <button
        type="button"
        aria-label={label}
        aria-expanded={open}
        aria-controls={tipId}
        onClick={() => setOpen((v) => !v)}
        data-testid="join-feature-tip-button"
        className="ms-1.5 inline-flex h-6 w-6 items-center justify-center rounded-full border border-primary/40 text-xs font-bold text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40"
      >
        ?
      </button>
      {/* Always rendered so aria-controls resolves; `hidden` while closed.
          inset-x-0 is symmetric (left + right), so it needs no logical twin. */}
      <span
        id={tipId}
        role="status"
        hidden={!open}
        data-testid="join-feature-tip"
        className="absolute inset-x-0 top-full z-10 mt-1.5 rounded-md border border-border bg-surface-card px-3 py-2 text-sm leading-relaxed text-text"
      >
        {open ? text : null}
      </span>
    </span>
  );
}
