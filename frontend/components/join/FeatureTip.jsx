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
export default function FeatureTip({ label, text, describedBy }) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef(null);
  const tipId = useId();

  useEffect(() => {
    if (!open) return undefined;
    const closeIfOutside = (event) => {
      if (rootRef.current && !rootRef.current.contains(event.target)) setOpen(false);
    };
    const onKeyDown = (event) => {
      if (event.key === "Escape") setOpen(false);
    };
    // pointerdown = a tap outside; focusin = keyboard focus moved elsewhere
    // (e.g. Tab to the next «?»), so two tips are never open at once.
    document.addEventListener("pointerdown", closeIfOutside);
    document.addEventListener("focusin", closeIfOutside);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("pointerdown", closeIfOutside);
      document.removeEventListener("focusin", closeIfOutside);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);

  return (
    <span ref={rootRef} className="inline-block align-middle">
      <button
        type="button"
        aria-label={label}
        // Every «?» shares one name; the item it explains tells them apart.
        aria-describedby={describedBy}
        aria-expanded={open}
        aria-controls={tipId}
        onClick={() => setOpen((v) => !v)}
        data-testid="join-feature-tip-button"
        className="ms-1.5 inline-flex h-6 w-6 items-center justify-center rounded-full border border-primary/40 text-xs font-bold text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40"
      >
        ?
      </button>
      {/* The live region is ALWAYS in the accessibility tree and only its text
          changes — a region that appears together with its content is often
          not announced. The visible bubble lives inside it.
          inset-x-0 is symmetric (left + right), so it needs no logical twin. */}
      <span id={tipId} role="status" data-testid="join-feature-tip-region">
        <span
          hidden={!open}
          data-testid="join-feature-tip"
          className="absolute inset-x-0 top-full z-10 mt-1.5 rounded-md border border-border bg-surface-card px-3 py-2 text-sm leading-relaxed text-text"
        >
          {open ? text : null}
        </span>
      </span>
    </span>
  );
}
