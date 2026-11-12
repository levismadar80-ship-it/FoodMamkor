"use client";

import { useEffect, useRef, useState } from "react";
// MEH-2836: the same overflow signal ChipScrollRow uses for its edge fades.
import useScrollAffordance from "@/hooks/useScrollAffordance";
import { useLocale } from "next-intl";

// MEH-2836: ChipScrollRow's mask depths (MEH-1572), same approach — a CSS
// mask (.chip-scroll-fade-mask in globals.css) whose edge is transparent only
// on a side that has hidden tabs, so the bar shows it scrolls.
const START_FADE_PX = 12;
const END_FADE_PX = 48;

/**
 * Sticky in-page section anchor-nav (a row of underline tabs). Each tab is a real
 * `<a href="#id">` — keyboard-reachable, and it still jumps with JS off. The
 * landing offset is the TARGET's own `scroll-margin-top` (no JS offset math);
 * this component publishes its live height as `--section-nav-h` on :root so
 * those scroll-margins can clear it, the same way Header.jsx publishes
 * `--chrome-top`.
 *
 * Data gating is the caller's: items with `show: false` render no pill, and a
 * row with nothing to show renders nothing at all.
 *
 * Active pill: IntersectionObserver over the target sections (no scroll-spy
 * library). `aria-current="true"` marks it. prefers-reduced-motion → instant
 * jump instead of a smooth scroll.
 *
 * @param {{ items: Array<{id: string, label: string, show?: boolean}>,
 *           ariaLabel: string, className?: string }} props
 */
export default function SectionAnchorNav({ items, ariaLabel, className = "" }) {
  const visible = items.filter((item) => item.show !== false);
  const ids = visible.map((item) => item.id);
  const idsKey = ids.join("|");

  const [activeId, setActiveId] = useState(null);
  const navRef = useRef(null);
  // MEH-2836: the hook owns the row ref (rowRef is the same object) and
  // reports whether tabs are hidden past either edge.
  const { scrollRef: rowRef, canScrollStart, canScrollEnd } = useScrollAffordance();
  // .chip-scroll-fade-mask's gradient runs `to left`: its --chip-fade-start
  // stop is the physical RIGHT edge. ChipScrollRow pins dir="rtl", so right is
  // always its start; this row follows the page's direction instead (/en is
  // LTR, where the start is the LEFT edge), so the two depths swap sides there.
  const isRtl = useLocale() !== "en";
  const startPx = canScrollStart ? START_FADE_PX : 0;
  const endPx = canScrollEnd ? END_FADE_PX : 0;
  const fadeVars = {
    "--chip-fade-start": `${isRtl ? startPx : endPx}px`,
    "--chip-fade-end": `${isRtl ? endPx : startPx}px`,
  };
  const pillRefs = useRef(new Map());

  // Publish the bar's live height for the targets' scroll-margin-top.
  // display:none (desktop) measures 0, which the md: scroll-margins ignore.
  useEffect(() => {
    const el = navRef.current;
    if (!el || typeof ResizeObserver === "undefined") return undefined;
    const root = document.documentElement;
    const publish = () =>
      root.style.setProperty("--section-nav-h", `${Math.round(el.getBoundingClientRect().height)}px`);
    publish();
    const ro = new ResizeObserver(publish);
    ro.observe(el);
    return () => {
      ro.disconnect();
      root.style.removeProperty("--section-nav-h");
    };
  }, [idsKey]);

  // Active section: the first section (in page order) inside a band near the
  // top of the viewport (25%–35% of its height).
  // MEH-3006: when none is in the band, the reader is either between two
  // tabbed sections or in a section that has no tab (recipes, events). The
  // last answer used to stand, so scrolling UP from reviews into the recipes
  // left «ביקורות» underlined over the recipes. Now: if the last tabbed
  // section above the band has fully ended above it too, no tab is current.
  useEffect(() => {
    if (typeof IntersectionObserver === "undefined") return undefined;
    const targets = ids.map((id) => document.getElementById(id)).filter(Boolean);
    if (targets.length === 0) return undefined;
    const inBand = new Map();
    const io = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) inBand.set(entry.target.id, entry.isIntersecting);
        const first = ids.find((id) => inBand.get(id));
        if (first) {
          setActiveId(first);
          return;
        }
        if (inUntabbedGap(targets)) setActiveId(NO_ACTIVE);
      },
      { rootMargin: `-${BAND_TOP * 100}% 0px -65% 0px`, threshold: 0 },
    );
    targets.forEach((el) => io.observe(el));
    return () => io.disconnect();
    // idsKey stands for `ids` (a fresh array each render).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [idsKey]);

  const effectiveActive =
    activeId === NO_ACTIVE ? null : ids.includes(activeId) ? activeId : ids[0];

  // Keep the active pill inside the (horizontally scrolling) row. scrollBy on
  // the row only — never scrollIntoView, which would also move the page and
  // cancel a smooth scroll in progress. Visual-px delta, so RTL needs no sign
  // handling.
  useEffect(() => {
    const row = rowRef.current;
    const pill = pillRefs.current.get(effectiveActive);
    if (!row || !pill || typeof row.scrollBy !== "function") return;
    const r = row.getBoundingClientRect();
    const p = pill.getBoundingClientRect();
    let delta = 0;
    if (p.left < r.left) delta = p.left - r.left;
    else if (p.right > r.right) delta = p.right - r.right;
    if (delta !== 0) row.scrollBy({ left: delta, behavior: prefersReducedMotion() ? "auto" : "smooth" });
  }, [effectiveActive]);

  if (visible.length === 0) return null;

  function onPillClick(event, id) {
    const target = document.getElementById(id);
    if (!target) return; // let the native anchor do whatever it can
    event.preventDefault();
    target.scrollIntoView({
      behavior: prefersReducedMotion() ? "auto" : "smooth",
      block: "start",
    });
    setActiveId(id);
  }

  return (
    <nav
      ref={navRef}
      aria-label={ariaLabel}
      data-testid="section-anchor-nav"
      style={{ top: "var(--chrome-top, 82px)" }}
      // MEH-2593: the page's own cream (not a white band) under a hairline,
      // so the bar reads as part of the page rather than a separate strip.
      // Opaque: at /95 the text scrolling underneath showed through.
      className={`sticky z-30 bg-background border-b border-primary/15 ${className}`}
    >
      <div
        ref={rowRef}
        data-testid="section-nav-row"
        className="flex gap-1 overflow-x-auto scrollbar-hide min-w-0 snap-x snap-proximity chip-scroll-fade-mask"
        style={fadeVars}
      >
        {visible.map(({ id, label }) => {
          const active = id === effectiveActive;
          return (
            <a
              key={id}
              ref={(el) => {
                if (el) pillRefs.current.set(id, el);
                else pillRefs.current.delete(id);
              }}
              href={`#${id}`}
              onClick={(e) => onPillClick(e, id)}
              aria-current={active ? "true" : undefined}
              data-testid={`section-nav-pill-${id}`}
              // MEH-2593: underline tabs (Google Maps / Airbnb place pages) in
              // place of the boxed ChipScrollRow pills — text only, the active
              // tab is green with a bar under it. min-h-[48px] keeps the touch
              // target; pt-[3px] balances the 3px bottom border so the label
              // stays optically centred.
              className={`inline-flex items-center whitespace-nowrap px-3 pt-[3px] min-h-[48px] text-base font-semibold border-b-[3px] transition shrink-0 snap-start focus-ring ${
                active
                  ? "text-primary border-primary"
                  : "text-fg-muted border-transparent hover:text-text"
              }`}
            >
              {label}
            </a>
          );
        })}
      </div>
    </nav>
  );
}

// MEH-3006: the active band's top edge, as a fraction of the viewport height
// (the IntersectionObserver rootMargin above is built from it).
const BAND_TOP = 0.25;
// activeId value for "the reader is in a part of the page that has no tab".
const NO_ACTIVE = "__none__";

/**
 * True when the last tabbed section that starts above the active band also
 * ENDS above it, i.e. the reader has scrolled past it into content no tab
 * names. False at the top of the page (no section above the band yet).
 * @param {HTMLElement[]} targets  the tabbed sections, in page order
 */
function inUntabbedGap(targets) {
  if (typeof window === "undefined") return false;
  const bandTop = window.innerHeight * BAND_TOP;
  // A section that is not laid out (display:none, an empty wrapper) measures
  // 0/0 and would read as "ended above the band" — skip it.
  const rects = targets
    .map((el) => el.getBoundingClientRect())
    .filter((r) => r.bottom - r.top > 0);
  const above = rects.filter((r) => r.top < bandTop);
  if (above.length === 0) return false;
  return above[above.length - 1].bottom < bandTop;
}

function prefersReducedMotion() {
  return (
    typeof window !== "undefined" &&
    typeof window.matchMedia === "function" &&
    !!window.matchMedia("(prefers-reduced-motion: reduce)")?.matches
  );
}
