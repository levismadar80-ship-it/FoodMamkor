"use client";

import { useEffect, useMemo, useRef } from "react";
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

// MEH-1545/MEH-1572: the row's trailing NON-CONTENT scroll extent while the
// end spacer is mounted — the w-12 spacer (48px, fade clearance) + its gap-2
// (8px). These flex children inflate scrollWidth, so at viewport widths where
// every chip fits, maxScroll still landed at ~50px and useScrollAffordance
// grew a lone "phantom" arrow over the empty end of the row (Sapir QA 26/07).
// Declared to the hook so affordance only fires on REAL chip overflow.
// MEH-1572 dropped the two w-px sentinels (65 → 56) and made the spacer
// itself conditional, so this is passed as 0 while the spacer is absent —
// the two states are mutually consistent (see END_SPACER note below).
// Keep in sync with the spacer width at the bottom of the JSX.
const TRAILING_FILLER_PX = 56;

// MEH-1572: edge-fade depths, now cut into the scroller with a CSS mask
// instead of painted gradient overlays. Same visual depths the MEH-1314 /
// MEH-1340 overlays used (w-3 start, w-12 end) so the overflow state is
// pixel-unchanged; the mask is transparent, so it reveals ANY surface behind
// it and no caller has to declare its background colour.
const START_FADE_PX = 12;
const END_FADE_PX = 48;

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
 * MEH-1340 made them DYNAMIC (each side shows only while content is hidden
 * past it). MEH-1572 changed HOW they are drawn: instead of two absolutely
 * positioned divs painted with the caller's background colour, the scroller
 * carries a `mask-image` whose edges are transparent. A mask reveals
 * whatever is actually behind the row, so the same component works on the
 * cream surfaces (/, /producers, /events, /map) and on white with no
 * per-caller colour — the `fadeBg` prop it needed is gone. (The prop was a
 * standing drift hazard: its default was #ffffff while every real caller
 * passed the cream #F5F0E8, and a white fade over cream reads as a clip
 * rather than a fade — MEH-1019/MEH-1108.)
 *
 * INLINE-START GUTTER (MEH-1572): the row sits flush with its section
 * container's inline-start edge — inset 0, `ps-0` / `scroll-ps-0` — so the
 * first chip lines up with the heading above it on / and /producers. This
 * is THE shared inset value; the micro-labels in ProducersClient align to
 * the same 0 (they used to carry a stray ms-1). Before this, three
 * different offsets stacked in one column: scroller ps-4 (16px), labels
 * ms-1 (4px), headings at 0 — read as dead space at the start of the row.
 *
 * END SPACER (MEH-1572): the w-12 spacer exists because padding-inline-end
 * is excluded from scrollWidth, so only a real flex child reserves that
 * scroll extent. It now renders ONLY when the row actually overflows —
 * a non-overflowing row carries zero trailing dead space (and cannot grow
 * phantom scroll extent out of its own filler). `scroll-pe-12` stays as the
 * scrollIntoView clearance mechanism either way.
 *
 * MEH-1383: desktop-pointer (hover:hover + pointer:fine) devices also get
 * round edge scroll-arrow buttons above the fades. Touch devices render
 * zero extra DOM. Vertical wheel over the row translates to horizontal
 * scroll (desktop only), passing through at the edges.
 *
 * AFFORDANCE AUTHORITY (MEH-1391 trade resolved by MEH-1572): fades,
 * arrows AND the end spacer all read ONE signal — useScrollAffordance's
 * scroll+ResizeObserver math. The MEH-1340 IntersectionObserver sentinels
 * that used to own the fades independently are deleted. They could not tell
 * "real chip overflow" from "only my own trailing spacer is off-screen",
 * which is the bug class MEH-1545 hit on the arrow side; sharing the hook's
 * filler-discounted math fixes both at once.
 */
export default function ChipScrollRow({
  chips,
  variant = "toggle",
  activeKey,
  activeKeys = {},
  onChipClick,
  className = "",
}) {
  const t = useTranslations("map.chip_scroll");
  const chipRefs = useRef(new Map());
  // MEH-1391/MEH-1572: scrollRef + the ONE affordance signal (fades, arrows
  // and the end spacer all read it) come from the shared hook.
  // MEH-1545: declare the trailing spacer px so a row whose chips all fit
  // doesn't grow phantom affordance out of its own filler. MEH-1572: the
  // spacer is itself conditional, so the filler is only declared while it is
  // actually mounted — otherwise a fitting row would discount 56px it isn't
  // rendering and could never report overflow again once it lost the spacer.
  const spacerMountedRef = useRef(false);
  const affordance = useScrollAffordance({
    trailingFillerPx: spacerMountedRef.current ? TRAILING_FILLER_PX : 0,
  });
  const { scrollRef, showArrows, canScrollStart, canScrollEnd, hasOverflow } = affordance;
  spacerMountedRef.current = hasOverflow;
  const prevActiveKeysRef = useRef(null);

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

  // MEH-1572: edge fades. The gradient itself lives in globals.css
  // (.chip-scroll-fade-mask); this component publishes only the two stop
  // depths. A side with nothing hidden past it publishes 0px, which collapses
  // that end of the mask to fully opaque — so a non-overflowing row shows no
  // fade at all, exactly as the MEH-1340 conditional divs did.
  const fadeVars = {
    "--chip-fade-start": `${canScrollStart ? START_FADE_PX : 0}px`,
    "--chip-fade-end": `${canScrollEnd ? END_FADE_PX : 0}px`,
  };

  return (
    <div className={`relative min-w-0 ${className}`} dir="rtl">
      {/* MEH-1383/MEH-1391: desktop-only edge scroll arrows. They sit
          OUTSIDE the masked scroller (siblings, not children), so the mask
          cannot fade the arrows themselves — the reason they stay here
          rather than moving inside. Per-direction visibility comes from the
          same hook signal that drives the mask. */}
      <ScrollArrows affordance={affordance} />
      <div
        ref={scrollRef}
        // MEH-1314: snap-proximity (NOT mandatory) so a chip rests aligned to
        // the edge at rest instead of clipped mid-way, while the partial peek
        // stays natural at the far edge and existing scrollIntoView is not
        // fought. snap-start / scroll-ps-* / scroll-pe-* are flow-relative —
        // RTL-safe.
        // MEH-1572: ps-0 / scroll-ps-0 — the shared inline-start inset (0),
        // so the first chip is flush with the section container edge and
        // lines up with the heading above it. Stated explicitly rather than
        // omitted so the value is greppable and deliberate.
        // MEH-1340: scroll-pe-12 matches the end fade width so scrollIntoView
        // on an active chip stops clear of the fade zone (no JS offset math).
        className="flex gap-2 overflow-x-auto pb-1 scrollbar-hide min-w-0 ps-0 snap-x snap-proximity scroll-ps-0 scroll-pe-12 chip-scroll-fade-mask"
        // MEH-1572: the two mask stop depths (the gradient is in globals.css).
        style={fadeVars}
        // MEH-1465: category is now MULTI-select (a toolbar of toggle buttons),
        // not a single-choice radiogroup — both variants use role="toolbar";
        // aria-pressed on each button carries the on/off state.
        role="toolbar"
        aria-label={variant === "category" ? t("category_aria") : t("attribute_aria")}
      >
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
            the last real chip clears the fade instead of sitting 16px under it.
            MEH-1572: conditional — a row whose chips all fit reserves nothing,
            which is the 48px of trailing dead space this ticket removes. */}
        {hasOverflow && <div className="shrink-0 w-12" aria-hidden="true" />}
      </div>
    </div>
  );
}
