"use client";

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";

/**
 * Module:   Tooltip
 * Purpose:  Hover/focus/tap explainer bubble — the string-content sibling of
 *           ui/Popover (which owns rich click-opened content).
 * Does NOT: portal or float BY DEFAULT — without `overlay` it positions
 *           absolutely inside its own wrapper. Consumers that don't pass
 *           `overlay` are byte-identical to pre-MEH-1593.
 * Related:  components/ui/Popover.jsx (the click primitive this mirrors) ·
 *           components/TrustBadge.jsx (the only `overlay` consumer today).
 * History:  MEH-602 (atom); MEH-1459 ("bottom-start" — the clipping workaround
 *           this supersedes on the card surface); MEH-1593 (overlay mode);
 *           MEH-1871 (overlay dismisses on scroll/resize instead of
 *           repositioning — see the effect below).
 *
 * MEH-1593: `overlay` mirrors the MEH-1592 Popover fix exactly — portal to
 * <body>, `position: fixed`, flip above a caller-supplied boundary, shift into
 * the viewport. It is NOT a shared abstraction with Popover: the two primitives
 * stay separate and no consumer moves between them (MEH-792 deferral holds).
 */

// MEH-1593: overlay geometry — same constants and meaning as ui/Popover.
const OVERLAY_GAP = 8;
const OVERLAY_PAD = 8;

// `max` floored at `min` so a bubble wider than the viewport pins to the near
// edge instead of inverting the clamp.
const clamp = (min, value, max) => Math.min(Math.max(value, min), Math.max(min, max));

// TrustBadge renders inside ProducerCard, which is server-rendered on
// /producers — useLayoutEffect would warn once per card on the server.
const useIsomorphicLayoutEffect = typeof window === "undefined" ? useEffect : useLayoutEffect;

const POSITION_CLASSES = {
  top: "bottom-full left-1/2 -translate-x-1/2 mb-2", // rtl-ok: centering, not directional
  bottom: "top-full left-1/2 -translate-x-1/2 mt-2", // rtl-ok: centering, not directional
  // MEH-1459: start-anchored below the trigger — the bubble grows toward the
  // inline-end (into the card) instead of centering, so it never pokes past the
  // trigger's start edge. Needed on ProducerCard, whose overflow-hidden article
  // clips a centered bubble on the narrow 2-col mobile card.
  "bottom-start": "top-full start-0 mt-2",
  right: "end-full top-1/2 -translate-y-1/2 me-2",
  left: "start-full top-1/2 -translate-y-1/2 ms-2",
};

/**
 * @param {object} props
 * @param {import("react").ReactNode} props.content — bubble content.
 * @param {import("react").ReactNode} props.children — the trigger.
 * @param {"top"|"bottom"|"bottom-start"|"right"|"left"} [props.position="top"]
 * @param {boolean} [props.overlay=false] — MEH-1593. Render the bubble in an
 *   overlay layer (portal → document.body, `position: fixed`) placed against
 *   the viewport instead of absolutely inside the wrapper. Use when the default
 *   bubble would overlap siblings or be clipped by an ancestor's overflow.
 * @param {import("react").RefObject<HTMLElement>} [props.avoidRef] — overlay
 *   only. The bubble clears THIS element's box (above it, flipping below when
 *   there is no room). Defaults to the trigger, which clears only the trigger.
 */
export default function Tooltip({ content, children, position = "top", overlay = false, avoidRef = null }) {
  const [visible, setVisible] = useState(false);
  const triggerRef = useRef(null);
  const bubbleRef = useRef(null);
  const [pos, setPos] = useState(null);
  const overlayActive = visible && overlay;

  const reposition = useCallback(() => {
    const triggerEl = triggerRef.current;
    const bubbleEl = bubbleRef.current;
    if (!triggerEl || !bubbleEl) return;

    const t = triggerEl.getBoundingClientRect();
    const boundary = avoidRef?.current?.getBoundingClientRect() ?? t;
    const rect = bubbleEl.getBoundingClientRect();
    const vw = window.innerWidth;
    const vh = window.innerHeight;

    // FLIP — prefer above the boundary; on a card the badge strip sits at the
    // photo's bottom edge, so everything that could collide is below it.
    let top = boundary.top - OVERLAY_GAP - rect.height;
    if (top < OVERLAY_PAD) top = boundary.bottom + OVERLAY_GAP;
    top = clamp(OVERLAY_PAD, top, vh - rect.height - OVERLAY_PAD);

    // SHIFT — align to the trigger's inline-start, then clamp into the viewport.
    // Direction is read from the BUBBLE, not the trigger: `insetInlineStart`
    // resolves against the bubble's containing block (<body> after portalling),
    // and a trigger can carry its own `dir` (the MEH-1592 982px-drift bug).
    const rtl = getComputedStyle(bubbleEl).direction === "rtl";
    const rawStart = rtl ? vw - t.right : t.left;
    const start = clamp(OVERLAY_PAD, rawStart, vw - rect.width - OVERLAY_PAD);

    setPos({ top, start });
  }, [avoidRef]);

  // MEH-1871: measured ONCE per open, then dismissed on the first
  // scroll/resize/orientationchange — mirrors ui/Popover exactly (the two stay
  // separate primitives, MEH-792). The reposition-on-scroll loop this replaces
  // clamped `top` into the viewport, so a bubble whose anchor had scrolled away
  // pinned at OVERLAY_PAD and rode the viewport instead of leaving with it.
  useIsomorphicLayoutEffect(() => {
    if (!overlayActive) {
      setPos(null);
      return undefined;
    }
    reposition();
    const dismiss = () => setVisible(false);
    // Position at open — a scroll dismisses only once the page has actually
    // moved. Same reasoning (and the same measured 150ms late event) as
    // ui/Popover; see the comment there.
    const openX = window.scrollX;
    const openY = window.scrollY;
    const dismissOnScroll = () => {
      if (window.scrollX !== openX || window.scrollY !== openY) setVisible(false);
    };
    // Capture phase catches scrolling ancestors (scroll does not bubble).
    window.addEventListener("scroll", dismissOnScroll, { capture: true, passive: true });
    window.addEventListener("resize", dismiss);
    window.addEventListener("orientationchange", dismiss);
    return () => {
      window.removeEventListener("scroll", dismissOnScroll, { capture: true });
      window.removeEventListener("resize", dismiss);
      window.removeEventListener("orientationchange", dismiss);
    };
  }, [overlayActive, reposition]);

  const bubble = visible && (
    <span
      ref={bubbleRef}
      role="tooltip"
      // MEH-1593: measured viewport coordinates are applied inline;
      // `insetInlineStart` keeps the horizontal axis logical (RTL-correct).
      style={
        overlayActive
          ? {
              top: pos ? `${pos.top}px` : 0,
              insetInlineStart: pos ? `${pos.start}px` : 0,
              visibility: pos ? "visible" : "hidden",
            }
          : undefined
      }
      className={
        overlayActive
          ? // Same visual as the anchored bubble; `fixed` + measured offsets
            // replace `absolute` + the placement classes.
            "pointer-events-none fixed z-[9999] whitespace-normal break-words w-max max-w-[8.5rem] sm:max-w-[13rem] bg-[#1C1A17] text-white text-[11px] leading-relaxed rounded-[8px] px-[10px] py-[6px] shadow-lg"
          : `pointer-events-none absolute z-[9999] whitespace-normal break-words w-max max-w-[8.5rem] sm:max-w-[13rem] bg-[#1C1A17] text-white text-[11px] leading-relaxed rounded-[8px] px-[10px] py-[6px] shadow-lg ${POSITION_CLASSES[position] ?? POSITION_CLASSES.top}`
      }
    >
      {content}
    </span>
  );

  return (
    <span className="relative inline-block">
      <span
        ref={triggerRef}
        onMouseEnter={() => setVisible(true)}
        onMouseLeave={() => setVisible(false)}
        onFocus={() => setVisible(true)}
        onBlur={() => setVisible(false)}
        onClick={() => setVisible((v) => !v)}
      >
        {children}
      </span>
      {/* MEH-1593: overlay mode portals the bubble to <body> so no ancestor's
          overflow-hidden can clip it. Every other mode keeps it in place. */}
      {overlayActive && typeof document !== "undefined"
        ? createPortal(bubble, document.body)
        : bubble}
    </span>
  );
}
