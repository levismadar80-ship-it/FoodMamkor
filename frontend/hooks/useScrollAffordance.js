"use client";

import { useEffect, useRef, useState } from "react";
import { CaretLeft, CaretRight } from "@phosphor-icons/react";

/**
 * Module:   useScrollAffordance
 * Purpose:  THE single source of truth for horizontal scroll affordance on
 *           RTL strips — per-direction can-scroll flags, an overall
 *           has-overflow flag, an ~80%-width pager, and the fine-pointer
 *           gate — plus the matching <ScrollArrows> pair so the consumers
 *           can't drift visually.
 * Does NOT: paint anything except the arrows. Consumers decide what to do
 *           with the flags (ChipScrollRow drives its mask-image fades and
 *           its end spacer from them). Does not handle wheel→horizontal
 *           translation — that stays in ChipScrollRow (its scroller only).
 * Related:  components/ChipScrollRow.jsx (source of the extracted logic);
 *           components/FridayDeliveryStrip.jsx, app/[locale]/home/
 *           HomeStaticBlocks.jsx (consumers).
 * History:  MEH-1383 (logic shipped inline in ChipScrollRow);
 *           MEH-1391 (extraction + card-strip adoption);
 *           MEH-1545 (trailingFillerPx — phantom-arrow fix);
 *           MEH-1572 (single authority: flags now compute on EVERY device,
 *             not just fine-pointer, because ChipScrollRow's fades read
 *             them too; `hasOverflow` exposed for the conditional spacer.
 *             This retires the MEH-1391 two-authority trade — the IO
 *             sentinels that used to own the fades are gone).
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
 * @param {{ trailingFillerPx?: number }} [options]
 *   trailingFillerPx — px of NON-CONTENT scroll extent at the strip's
 *   inline-end (spacer/sentinel flex children that exist for fade
 *   clearance, not to be seen). MEH-1545: ChipScrollRow's w-12 spacer +
 *   w-px sentinel inflate scrollWidth by ~65px, so at viewport widths
 *   where every chip already fits, maxScroll lands at ~50px > the 16px
 *   epsilon and a lone arrow rendered over the empty end of the row —
 *   clicking it revealed blank space (Sapir QA 26/07). Arrows now
 *   require the hidden extent to exceed this filler before rendering.
 * @returns {{
 *   scrollRef: import("react").MutableRefObject<HTMLElement|null>,
 *   canScrollStart: boolean,  // content hidden past the inline-start edge
 *   canScrollEnd: boolean,    // content hidden past the inline-end edge
 *   hasOverflow: boolean,     // real (filler-discounted) content overflow
 *   scrollByAmount: (towardEnd: boolean) => void,
 *   showArrows: boolean,      // fine-pointer device (matchMedia-gated)
 * }}
 */
// Direction of the scroller's context. Attribute-based rather than
// getComputedStyle: deterministic in jsdom AND it matches how this app
// switches direction (<html dir> in app/[locale]/layout.js:191 + local
// dir attrs on ChipScrollRow / FridayDeliveryStrip). Fallback "rtl" —
// the app is RTL-first and every real page carries an <html dir>.
function isRtlContext(el) {
  return (el.closest("[dir]")?.getAttribute("dir") || "rtl") !== "ltr";
}

export default function useScrollAffordance({ trailingFillerPx = 0 } = {}) {
  const scrollRef = useRef(null);
  const [showArrows, setShowArrows] = useState(false);
  const [canScrollStart, setCanScrollStart] = useState(false);
  const [canScrollEnd, setCanScrollEnd] = useState(false);
  // MEH-1572: overall "this strip really overflows" — ChipScrollRow renders
  // its end spacer only when true, so a row whose chips all fit carries no
  // trailing dead space.
  const [hasOverflow, setHasOverflow] = useState(false);
  // MEH-1391 review fix: /en renders dir="ltr" — HomeRecentlyViewed
  // follows the page direction, so sign and carets can't be hardcoded
  // RTL. True until the element reports otherwise (RTL-first app).
  const [rtl, setRtl] = useState(true);

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
    // MEH-1545: a strip whose only hidden extent is its own trailing
    // filler is not really scrollable — an arrow paging ~80% of the
    // container would just reveal blank spacer. With the default 0 the
    // condition reduces to the previous maxScroll>0 && ±epsilon checks
    // (scrolled > 16 already implied maxScroll > 16).
    const realOverflow = maxScroll > trailingFillerPx + EDGE_EPSILON_PX;
    setHasOverflow(realOverflow);
    setCanScrollStart(realOverflow && scrolled > EDGE_EPSILON_PX);
    setCanScrollEnd(realOverflow && scrolled < maxScroll - EDGE_EPSILON_PX);
    setRtl(isRtlContext(el));
  }

  // Scroll listener + ResizeObserver. MEH-1572: attached on EVERY device,
  // not just fine-pointer. `showArrows` still gates whether ARROWS render,
  // but ChipScrollRow's edge fades and its conditional end spacer now read
  // these same flags, and both must be correct on touch. NO dependency
  // array on purpose: async consumers (FridayDeliveryStrip fetches its
  // cards) grow scrollWidth without any scroll or container-resize event
  // firing, so the flags must re-derive after every commit. Same-value
  // setState bails out, so this cannot render-loop; re-attaching the two
  // listeners per commit is cheap and rules out stale closures.
  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
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
    // RTL: scrollLeft grows NEGATIVE toward inline-end, so toward-end is
    // a negative delta; LTR is the mirror. Read live (not from state) so
    // a click can never use a stale direction.
    const towardEndSign = isRtlContext(el) ? -1 : 1;
    el.scrollBy({
      left: (towardEnd ? towardEndSign : -towardEndSign) * delta,
      behavior: "smooth",
    });
  }

  return {
    scrollRef,
    canScrollStart,
    canScrollEnd,
    hasOverflow,
    scrollByAmount,
    showArrows,
    rtl,
  };
}

/**
 * The matching arrow pair — exact MEH-1383 ChipScrollRow styling so the
 * three strips can't drift. Render inside a `relative` wrapper that
 * contains the scroller. z-20 sits above ChipScrollRow's z-10 fades.
 * tabIndex=-1 + aria-hidden: pointer affordance only — the strip content
 * stays keyboard-reachable, and no i18n label is needed.
 */
export function ScrollArrows({ affordance }) {
  const { canScrollStart, canScrollEnd, scrollByAmount, showArrows, rtl } = affordance;
  if (!showArrows) return null;
  const cls =
    "absolute top-1/2 -translate-y-1/2 z-20 flex h-8 w-8 items-center justify-center rounded-full border border-border bg-white text-text shadow-sm transition hover:border-primary hover:text-primary";
  // Carets point at the hidden content past their edge. RTL: inline-start
  // is the physical RIGHT (CaretRight) and inline-end the LEFT; LTR mirrors.
  const StartCaret = rtl ? CaretRight : CaretLeft;
  const EndCaret = rtl ? CaretLeft : CaretRight;
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
          <StartCaret size={16} weight="bold" />
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
          <EndCaret size={16} weight="bold" />
        </button>
      )}
    </>
  );
}
