"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import useScrollAffordance, { ScrollArrows } from "@/hooks/useScrollAffordance";

// Firefox mouse wheels report deltaMode=DOM_DELTA_LINE (units = lines,
// ~3/notch) — normalize to px or the wheel-scroll crawls. 16px/line is
// the conventional equivalence.
const WHEEL_LINE_PX = 16;

// MEH-1465: fallback --cat-ring for a SELECTED category chip whose descriptor
// carries no iconColor (an admin category with no CATEGORY_STYLES entry). The
// DEFAULT category green (= primary / DEFAULT_CATEGORY_STYLE.color) — never a
// new palette colour (MEH-763 lock).
const DEFAULT_CAT_RING = "#2e6853";

/**
 * Scrollable chip row for filter bars.
 *
 * variant="category" — MULTI-select (MEH-1465). Callers pass EITHER the
 *   legacy single-key `activeKey` string (length-1 selection — /events + the
 *   pre-1465 rows) OR an `activeKeys` Set of the selected category keys. Both
 *   normalise to one Set internally, so a selection of any size renders the
 *   MEH-1181-A "Direction A" language (category-colour ring + faint wash +
 *   neutral label) on each selected chip. "כל" is the reset sentinel.
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
 *
 * MEH-1383: desktop-pointer (hover:hover + pointer:fine) devices also get
 * round edge scroll-arrow buttons above the fades. Touch devices render
 * zero extra DOM. Vertical wheel over the row translates to horizontal
 * scroll (desktop only), passing through at the edges.
 *
 * MEH-1391: the arrow logic moved to the shared useScrollAffordance hook
 * (also used by FridayDeliveryStrip + HomeRecentlyViewed). Arrows are now
 * driven by the hook's scroll+ResizeObserver math; the FADES stay on the
 * MEH-1340 IO sentinels (they also feed the scrollIntoView clearance
 * design). Two signals for overlapping facts is a known, deliberate
 * trade: the hook is the single authority for ARROW affordance across
 * all strips, the sentinels remain the single authority for fades here.
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
  // MEH-1391: scrollRef + arrow state come from the shared hook.
  const affordance = useScrollAffordance();
  const { scrollRef, showArrows } = affordance;
  const prevActiveKeysRef = useRef(null);
  // MEH-1340: sentinels observed by one IntersectionObserver to drive the
  // dynamic edge fades. A fade shows only while its sentinel is off-screen
  // (= there is hidden content on that side). Both default off so a
  // non-overflowing row renders zero fades until the IO says otherwise.
  const startSentinelRef = useRef(null);
  const endSentinelRef = useRef(null);
  const [showStartFade, setShowStartFade] = useState(false);
  const [showEndFade, setShowEndFade] = useState(false);

  // MEH-1465: normalise the category selection to one Set regardless of which
  // prop the caller passed — an `activeKeys` Set (multi-select) or the legacy
  // `activeKey` string (length-1). "all" is never a member: it is the reset
  // sentinel, styled separately (solid primary baseline / ghost when ≥1 active).
  const categorySet = useMemo(() => {
    if (variant !== "category") return null;
    if (activeKeys instanceof Set) return activeKeys;
    return new Set(activeKey && activeKey !== "all" ? [activeKey] : []);
  }, [variant, activeKeys, activeKey]);

  // A chip reads as "pressed" when it is the current active affordance:
  //   - toggle variant: its key is on in activeKeys
  //   - category chip:  its key is in the selected Set
  //   - "כל" reset:     nothing is selected (the baseline active state)
  function isActive(chip) {
    if (variant !== "category") return !!activeKeys[chip.key];
    if (chip.key === "all") return categorySet.size === 0;
    return categorySet.has(chip.key);
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
        ? categorySet.size > 0
        : Object.values(activeKeys).some(Boolean);
    if (!hasActiveFilter) {
      scrollRef.current?.scrollTo({ left: 0, behavior: "instant" });
    }
  }, []);

  // Category: scroll the LAST-ACTIVATED chip into view (MEH-1465 — mirrors the
  // toggle-variant diff below now that categories are multi-select). On mount,
  // pull the first already-selected chip in (URL-seeded state); on later changes
  // pull whichever key was just added to the Set.
  const prevCategorySetRef = useRef(null);
  useEffect(() => {
    if (variant !== "category") return;
    const prev = prevCategorySetRef.current;
    const keys = [...categorySet];
    const keyToScroll = prev === null ? keys[0] : keys.find((k) => !prev.has(k));
    if (keyToScroll) scrollChipIntoView(keyToScroll);
    prevCategorySetRef.current = categorySet;
  }, [variant, categorySet]);

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

  // MEH-1383 bonus: vertical wheel over the row → horizontal scroll,
  // desktop-pointer only (showArrows = the hook's matchMedia gate).
  // Native listener because React's root-attached wheel handler is
  // passive — preventDefault would be ignored. At either edge the event
  // is left alone so the page keeps scrolling normally. Stays here (not
  // in the hook): ChipScrollRow-only behavior per MEH-1391 scope.
  useEffect(() => {
    const el = scrollRef.current;
    if (!showArrows || !el) return;
    const onWheel = (e) => {
      if (Math.abs(e.deltaY) <= Math.abs(e.deltaX)) return;
      const maxScroll = el.scrollWidth - el.clientWidth;
      if (maxScroll <= 0) return;
      const dy = e.deltaMode === WheelEvent.DOM_DELTA_LINE ? e.deltaY * WHEEL_LINE_PX : e.deltaY;
      // dir="rtl": scrollLeft is 0 at inline-start and grows NEGATIVE
      // toward inline-end (Chrome/Firefox), hence Math.abs + negated delta.
      const scrolled = Math.abs(el.scrollLeft);
      const towardEnd = dy > 0;
      if (towardEnd ? scrolled >= maxScroll - 1 : scrolled <= 1) return;
      e.preventDefault();
      el.scrollBy({ left: -dy });
    };
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
  }, [showArrows]);

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
      {/* MEH-1383/MEH-1391: desktop-only edge scroll arrows, above the
          fades (z-20 > fade z-10), rendered by the shared hook pair —
          per-direction visibility from the hook's scroll+RO math. */}
      <ScrollArrows affordance={affordance} />
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
        // MEH-1465: category is now MULTI-select (a toolbar of toggle buttons),
        // not a single-choice radiogroup — both variants use role="toolbar";
        // aria-pressed on each button carries the on/off state.
        role="toolbar"
        aria-label={variant === "category" ? t("category_aria") : t("attribute_aria")}
      >
        {/* MEH-1340: inline-start sentinel — visible ⇒ at the start edge ⇒
            hide the start fade. w-px so it never affects layout/scroll math. */}
        <div ref={startSentinelRef} className="shrink-0 w-px" aria-hidden="true" />
        {chips.map((chip) => {
          const active = isActive(chip);
          // MEH-1465 + MEH-1181-A "Direction A": a SELECTED category chip carries
          // its category colour as a ring + 12% wash with a neutral dark label
          // (the ring/glyph carry the colour, the label stays ≥4.5:1) — NOT the
          // solid state-selected fill. The solid fill is kept for toggle chips
          // and the "כל" reset baseline; "כל" drops to a ghost once ≥1 category
          // is selected, so the coloured selection reads as the active state and
          // "כל" reads as the escape. Spec: docs/DESIGN.md:478-506.
          const isReset = variant === "category" && chip.key === "all";
          const isCategorySelected = variant === "category" && !isReset && active;
          // --cat-ring = the category's registry tint (textColor ?? color) — the
          // exact value declared as the chip's `iconColor` (map-chips.js /
          // ProducersClient). Fallback to the DEFAULT category green for an admin
          // category with no registry style.
          const catRing = chip.iconColor || DEFAULT_CAT_RING;
          let stateClass;
          let stateStyle;
          if (isCategorySelected) {
            stateClass = "text-text"; // neutral dark label (token = #1c1a17)
            stateStyle = {
              background: `color-mix(in srgb, ${catRing} 12%, #fff)`,
              border: `1.5px solid ${catRing}`,
              fontWeight: 600,
            };
          } else if (isReset && !active) {
            // "כל" ghost — ≥1 category selected → it is the escape, not the state.
            stateClass = "bg-white text-muted border-border";
          } else if (active) {
            // solid fill: toggle-active chips + the "כל" baseline.
            stateClass = "bg-state-selected text-white border-state-selected";
          } else {
            stateClass =
              "bg-white text-text border-border hover:border-primary hover:text-primary";
          }
          // Glyph tint: keep the category colour on the glyph UNLESS the chip is a
          // solid white-fill state (toggle-active / "כל" baseline), where the
          // glyph inherits the button's white currentColor. A SELECTED category
          // chip (Direction A) KEEPS the tint — the glyph carries the colour.
          const glyphSolidWhite = active && !isCategorySelected;
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
              // MEH-764: chips are rounded-md on ALL surfaces (/home, /producers,
              // /map) per DESIGN §Shapes / BRAND §3 (no pill on rectangles).
              className={`inline-flex items-center gap-1.5 whitespace-nowrap px-4 py-2.5 rounded-md text-sm font-medium border transition shrink-0 snap-start ${stateClass}`}
              style={stateStyle}
            >
              {chip.icon && (
                <span
                  aria-hidden="true"
                  style={!glyphSolidWhite && chip.iconColor ? { color: chip.iconColor } : undefined}
                >
                  {chip.icon}
                </span>
              )}
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
