"use client";

import { useEffect, useRef, useState } from "react";
import { CaretLeft, CaretRight } from "@phosphor-icons/react";

/**
 * Module:   useScrollAffordance
 * Purpose:  Shared desktop scroll-affordance state for horizontal RTL
 *           strips — per-direction can-scroll flags, an ~80%-width pager,
 *           and the fine-pointer gate — plus the matching <ScrollArrows>
 *           pair so the three consumers can't drift visually.
 * Does NOT: own edge fades — ChipScrollRow's fades stay on their own IO
 *           sentinels (they also feed scrollIntoView clearance). Does not
 *           handle wheel→horizontal translation — that stays in
 *           ChipScrollRow (its scroller only).
 * Related:  components/ChipScrollRow.jsx (source of the extracted logic);
 *           components/FridayDeliveryStrip.jsx, app/[locale]/home/
 *           HomeStaticBlocks.jsx (consumers).
 * History:  MEH-1383 (logic shipped inline in ChipScrollRow);
 *           MEH-1391 (extraction + card-strip adoption).
 */

// Arrow click / scrollByAmount pages ~80% of the visible strip per press.
const SCROLL_STEP_RATIO = 0.8;
const DESKTOP_POINTER_QUERY = "(hover: hover) and (pointer: fine)";
// Treat positions within 16px of an edge as AT the edge. Covers both
// sub-pixel settle AND snap-rest offsets: ChipScrollRow's snap-proximity
// + scroll-ps-4 rests the row at scrollLeft ≈ -9 (observed live on /map,
// MEH-1391 QA), which a 1px epsilon misread as "scrolled" and grew a
// start arrow at rest that the MEH-1383 sentinel version never showed.
// An arrow that pages ~80% of the container is useless within 16px
// anyway.
const EDGE_EPSILON_PX = 16;

/**
 * @returns {{
 *   scrollRef: import("react").MutableRefObject<HTMLElement|null>,
 *   canScrollStart: boolean,  // content hidden past the inline-start edge
 *   canScrollEnd: boolean,    // content hidden past the inline-end edge
 *   scrollByAmount: (towardEnd: boolean) => void,
 *   showArrows: boolean,      // fine-pointer device (matchMedia-gated)
 * }}
 */
export default function useScrollAffordance() {
  const scrollRef = useRef(null);
  const [showArrows, setShowArrows] = useState(false);
  const [canScrollStart, setCanScrollStart] = useState(false);
  const [canScrollEnd, setCanScrollEnd] = useState(false);

  // matchMedia gates everything; the `change` listener keeps hybrids
  // (convertible laptops, mouse plugged into a tablet) live-correct.
  useEffect(() => {
    if (typeof window === "undefined" || typeof window.matchMedia !== "function") {
      return;
    }
    const mq = window.matchMedia(DESKTOP_POINTER_QUERY);
    setShowArrows(mq.matches);
    const onChange = (e) => setShowArrows(e.matches);
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, []);

  // Recompute per-direction availability. dir="rtl" everywhere in this
  // app: scrollLeft is 0 at inline-start and grows NEGATIVE toward the
  // inline-end (Chrome/Firefox) — Math.abs also tolerates legacy
  // positive-RTL engines. Verified live in MEH-1383 (Playwright:
  // scrollLeft -9 → -44), not assumed.
  function recompute() {
    const el = scrollRef.current;
    if (!el) return;
    const maxScroll = el.scrollWidth - el.clientWidth;
    const scrolled = Math.abs(el.scrollLeft);
    setCanScrollStart(maxScroll > 0 && scrolled > EDGE_EPSILON_PX);
    setCanScrollEnd(maxScroll > 0 && scrolled < maxScroll - EDGE_EPSILON_PX);
  }

  // Scroll listener + ResizeObserver, attached only on fine-pointer
  // devices (touch pays zero). NO dependency array on purpose: async
  // consumers (FridayDeliveryStrip fetches its cards) grow scrollWidth
  // without any scroll or container-resize event firing, so the flags
  // must re-derive after every commit. Same-value setState bails out,
  // so this cannot render-loop; re-attaching the two listeners per
  // commit is cheap and rules out stale closures.
  useEffect(() => {
    const el = scrollRef.current;
    if (!showArrows || !el) return;
    recompute();
    el.addEventListener("scroll", recompute, { passive: true });
    let ro;
    if (typeof ResizeObserver !== "undefined") {
      ro = new ResizeObserver(recompute);
      ro.observe(el);
    }
    return () => {
      el.removeEventListener("scroll", recompute);
      ro?.disconnect();
    };
  });

  function scrollByAmount(towardEnd) {
    const el = scrollRef.current;
    if (!el) return;
    const delta = Math.round(el.clientWidth * SCROLL_STEP_RATIO);
    // RTL: negative left delta moves toward the inline-end (see above).
    el.scrollBy({ left: towardEnd ? -delta : delta, behavior: "smooth" });
  }

  return { scrollRef, canScrollStart, canScrollEnd, scrollByAmount, showArrows };
}

/**
 * The matching arrow pair — exact MEH-1383 ChipScrollRow styling so the
 * three strips can't drift. Render inside a `relative` wrapper that
 * contains the scroller. z-20 sits above ChipScrollRow's z-10 fades.
 * tabIndex=-1 + aria-hidden: pointer affordance only — the strip content
 * stays keyboard-reachable, and no i18n label is needed.
 */
export function ScrollArrows({ affordance }) {
  const { canScrollStart, canScrollEnd, scrollByAmount, showArrows } = affordance;
  if (!showArrows) return null;
  const cls =
    "absolute top-1/2 -translate-y-1/2 z-20 flex h-8 w-8 items-center justify-center rounded-full border border-border bg-white text-text shadow-sm transition hover:border-primary hover:text-primary";
  return (
    <>
      {canScrollStart && (
        <button
          type="button"
          tabIndex={-1}
          aria-hidden="true"
          onClick={() => scrollByAmount(false)}
          className={`${cls} start-1`}
        >
          {/* Inline-start = physical RIGHT in RTL — caret points at the hidden content. */}
          <CaretRight size={16} weight="bold" />
        </button>
      )}
      {canScrollEnd && (
        <button
          type="button"
          tabIndex={-1}
          aria-hidden="true"
          onClick={() => scrollByAmount(true)}
          className={`${cls} end-1`}
        >
          {/* Inline-end = physical LEFT in RTL. */}
          <CaretLeft size={16} weight="bold" />
        </button>
      )}
    </>
  );
}
