"use client";

import { useEffect, useRef } from "react";
import { useTranslations } from "next-intl";

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
  const t = useTranslations("map.chip_scroll");
  const chipRefs = useRef(new Map());
  const scrollRef = useRef(null);
  const prevActiveKeysRef = useRef(null);

  function isActive(chip) {
    return variant === "category" ? chip.key === activeKey : !!activeKeys[chip.key];
  }

  function scrollChipIntoView(key) {
    chipRefs.current
      .get(key)
      ?.scrollIntoView({ behavior: "smooth", inline: "nearest", block: "nearest" });
  }

  // On mount — if no chip is actively filtering, pin the scroll
  // container to its inline-start position (scrollLeft:0, which maps
  // to the RIGHT edge in RTL). When a specific chip IS active, skip
  // the reset and let scrollIntoView place it — avoids the
  // instant-to-0 then smooth-scroll flicker on URL-seeded state.
  // "all" counts as no active filter (it's the reset sentinel).
  useEffect(() => {
    const hasActiveFilter =
      variant === "category"
        ? activeKey && activeKey !== "all"
        : Object.values(activeKeys).some(Boolean);
    if (!hasActiveFilter) {
      scrollRef.current?.scrollTo({ left: 0, behavior: "instant" });
    }
  }, []);

  // Category: scroll the active chip into view when it changes. On mount
  // the useEffect above already pins to scrollLeft:0; only pull a
  // non-first chip into view on later changes.
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
      {/* Inline-start (right in RTL) fade — slim so the first chip isn't
          hidden underneath. Purpose is a scroll hint, not a mask. */}
      <div
        className="pointer-events-none absolute inset-y-0 start-0 w-3 z-10"
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
        ref={scrollRef}
        className="flex gap-2 overflow-x-auto pb-1 scrollbar-hide min-w-0 ps-4"
        role={variant === "category" ? "radiogroup" : "toolbar"}
        aria-label={variant === "category" ? t("category_aria") : t("attribute_aria")}
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
              // MEH-764: chips are rounded-md + state-selected on ALL surfaces
              // (/home, /producers, /map) per DESIGN §Shapes / BRAND §3 (no pill on rectangles).
              className={`inline-flex items-center gap-1.5 whitespace-nowrap px-4 py-2.5 rounded-md text-sm font-medium border transition shrink-0 ${
                active
                  ? "bg-state-selected text-white border-state-selected"
                  : "bg-white text-text border-border hover:border-primary hover:text-primary"
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
