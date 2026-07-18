"use client";

import { useEffect, useRef, useState } from "react";
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
 * MEH-1340: the fades are DYNAMIC — each renders only when content is
 * hidden on its side (sentinel div + one IntersectionObserver rooted on
 * the scroller, the YouTube/Airbnb pattern). A row that doesn't overflow
 * shows no fades; an active chip scrolled to the far end never rests
 * washed-out under the end fade. The end spacer is w-12 (matches the end
 * fade width) and the scroller carries scroll-pe-12, so scrollIntoView on
 * an active chip stops clear of the fade zone with no JS offset math.
 * Shrink-0 spacer at scroll-end also fixes RTL padding-inline-end clipping.
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
  // MEH-1340: sentinels observed by one IntersectionObserver to drive the
  // dynamic edge fades. A fade shows only while its sentinel is off-screen
  // (= there is hidden content on that side). Both default off so a
  // non-overflowing row renders zero fades until the IO says otherwise.
  const startSentinelRef = useRef(null);
  const endSentinelRef = useRef(null);
  const [showStartFade, setShowStartFade] = useState(false);
  const [showEndFade, setShowEndFade] = useState(false);

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

  // MEH-1340: dynamic edge fades. One IntersectionObserver, root = the
  // scroll container, watches both edge sentinels. A sentinel that is
  // intersecting means that edge is reached → hide that side's fade; a
  // sentinel scrolled out of view means content is hidden past that edge
  // → show the fade. SSR-safe (runs in useEffect, guards missing IO) and
  // disconnects on cleanup. No scroll listeners.
  useEffect(() => {
    const root = scrollRef.current;
    const startEl = startSentinelRef.current;
    const endEl = endSentinelRef.current;
    if (!root || !startEl || !endEl || typeof IntersectionObserver === "undefined") {
      return;
    }
    const io = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.target === startEl) setShowStartFade(!entry.isIntersecting);
          else if (entry.target === endEl) setShowEndFade(!entry.isIntersecting);
        }
      },
      { root, threshold: 0 },
    );
    io.observe(startEl);
    io.observe(endEl);
    return () => io.disconnect();
  }, []);

  return (
    <div className={`relative min-w-0 ${className}`} dir="rtl">
      {/* Inline-start (right in RTL) fade — slim so the first chip isn't
          hidden underneath. Purpose is a scroll hint, not a mask.
          MEH-1340: rendered only while the start edge has hidden content. */}
      {showStartFade && (
        <div
          className="pointer-events-none absolute inset-y-0 start-0 w-3 z-10"
          style={{ background: `linear-gradient(to left, ${fadeBg}, transparent)` }}
          aria-hidden="true"
        />
      )}
      {/* Inline-end (left in RTL) fade — signals more chips off-screen.
          Widened (w-12) so the scroll hint reads on a cream background
          (/map) where a slimmer gradient was near-invisible (MEH-1314).
          MEH-1340: rendered only while the end edge has hidden content, so
          an active chip resting at the far end is never washed out. */}
      {showEndFade && (
        <div
          className="pointer-events-none absolute inset-y-0 end-0 w-12 z-10"
          style={{ background: `linear-gradient(to right, ${fadeBg}, transparent)` }}
          aria-hidden="true"
        />
      )}
      <div
        ref={scrollRef}
        // MEH-1314: snap-proximity (NOT mandatory) so a chip rests aligned to
        // the edge at rest instead of clipped mid-way, while the partial peek
        // stays natural at the far edge and existing scrollIntoView is not
        // fought. scroll-ps-4 keeps the snap target clear of the ps-4 inset.
        // snap-start / scroll-ps-* / scroll-pe-* are flow-relative — RTL-safe.
        // MEH-1340: scroll-pe-12 matches the end fade width so scrollIntoView
        // on an active chip stops clear of the fade zone (no JS offset math).
        className="flex gap-2 overflow-x-auto pb-1 scrollbar-hide min-w-0 ps-4 snap-x snap-proximity scroll-ps-4 scroll-pe-12"
        role={variant === "category" ? "radiogroup" : "toolbar"}
        aria-label={variant === "category" ? t("category_aria") : t("attribute_aria")}
      >
        {/* MEH-1340: inline-start sentinel — visible ⇒ at the start edge ⇒
            hide the start fade. w-px so it never affects layout/scroll math. */}
        <div ref={startSentinelRef} className="shrink-0 w-px" aria-hidden="true" />
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
              className={`inline-flex items-center gap-1.5 whitespace-nowrap px-4 py-2.5 rounded-md text-sm font-medium border transition shrink-0 snap-start ${
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
            so a real flex child is the only reliable way to reserve this space.
            MEH-1340: widened w-8 → w-12 to match the end fade, so at max scroll
            the last real chip clears the fade instead of sitting 16px under it. */}
        <div className="shrink-0 w-12" aria-hidden="true" />
        {/* MEH-1340: inline-end sentinel — visible ⇒ scrolled to the true end
            (past the w-12 spacer) ⇒ hide the end fade. */}
        <div ref={endSentinelRef} className="shrink-0 w-px" aria-hidden="true" />
      </div>
    </div>
  );
}
