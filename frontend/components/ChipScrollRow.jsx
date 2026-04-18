"use client";

import { useEffect, useRef } from "react";

/**
 * Scrollable chip row for filter bars.
 *
 * variant="category" — radio semantics; one chip active at a time.
 *   activeKey: string key of the selected chip.
 *
 * variant="toggle" — boolean; any combination can be active.
 *   activeKeys: object { chipKey: boolean }.
 *
 * Active chips are scrolled into view on mount and whenever activation
 * changes — keeps the user's current selection visible even when the
 * row overflows.
 *
 * Inline-start + inline-end edge fades signal the row is scrollable.
 * Shrink-0 w-8 spacer at scroll-end fixes RTL padding-inline-end clipping.
 */
export default function ChipScrollRow({
  chips,
  variant = "toggle",
  activeKey,
  activeKeys = {},
  onChipClick,
  fadeBg = "#ffffff",
  className = "",
}) {
  const chipRefs = useRef(new Map());
  const prevActiveKeysRef = useRef(null);

  function isActive(chip) {
    return variant === "category" ? chip.key === activeKey : !!activeKeys[chip.key];
  }

  function scrollChipIntoView(key) {
    chipRefs.current
      .get(key)
      ?.scrollIntoView({ behavior: "smooth", inline: "nearest", block: "nearest" });
  }

  // Category: scroll the active chip into view on mount + whenever it changes.
  useEffect(() => {
    if (variant !== "category" || !activeKey) return;
    scrollChipIntoView(activeKey);
  }, [variant, activeKey]);

  // Toggle: scroll the newly activated chip into view. On mount, scroll to
  // the first already-active chip (e.g. pre-set from URL state).
  useEffect(() => {
    if (variant !== "toggle") return;
    const prev = prevActiveKeysRef.current;
    const keyToScroll =
      prev === null
        ? Object.keys(activeKeys).find((k) => activeKeys[k])
        : Object.keys(activeKeys).find((k) => activeKeys[k] && !prev[k]);
    if (keyToScroll) scrollChipIntoView(keyToScroll);
    prevActiveKeysRef.current = activeKeys;
  }, [variant, activeKeys]);

  return (
    <div className={`relative min-w-0 ${className}`} dir="rtl">
      {/* Inline-start (right in RTL) fade — signals row is scrollable */}
      <div
        className="pointer-events-none absolute inset-y-0 start-0 w-8 z-10"
        style={{ background: `linear-gradient(to left, ${fadeBg}, transparent)` }}
        aria-hidden="true"
      />
      {/* Inline-end (left in RTL) fade — signals more chips off-screen */}
      <div
        className="pointer-events-none absolute inset-y-0 end-0 w-8 z-10"
        style={{ background: `linear-gradient(to right, ${fadeBg}, transparent)` }}
        aria-hidden="true"
      />
      <div
        className="flex gap-2 overflow-x-auto pb-1 scrollbar-hide min-w-0"
        role={variant === "category" ? "radiogroup" : "toolbar"}
        aria-label={variant === "category" ? "סינון לפי קטגוריה" : "סינון לפי תכונה"}
      >
        {chips.map((chip) => {
          const active = isActive(chip);
          return (
            <button
              key={chip.key}
              ref={(el) => {
                if (el) chipRefs.current.set(chip.key, el);
                else chipRefs.current.delete(chip.key);
              }}
              type="button"
              onClick={() => onChipClick(chip.key)}
              aria-pressed={active}
              className={`inline-flex items-center gap-1.5 whitespace-nowrap px-4 py-2.5 rounded-full text-sm font-medium border transition shrink-0 ${
                active
                  ? "bg-primary text-white border-primary"
                  : "bg-white text-site-text border-border hover:border-primary hover:text-primary"
              }`}
            >
              {chip.icon && <span aria-hidden="true">{chip.icon}</span>}
              {chip.label}
            </button>
          );
        })}
        {/* RTL scroll-end spacer: padding-inline-end is excluded from scrollWidth,
            so a real flex child is the only reliable way to reserve this space. */}
        <div className="shrink-0 w-8" aria-hidden="true" />
      </div>
    </div>
  );
}
