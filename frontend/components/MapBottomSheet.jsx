"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useTranslations } from "next-intl";

import { SkeletonStyles } from "@/components/Skeleton";

// S5 FINAL (MEH-763): split-view sheet — TWO snap points, peek + 45vh open.
// PEEK/HALF export names kept (useFirstVisitHints imports PEEK; useMapSync
// imports HALF for the marker-tap open) — only HALF's value moved 55→45.
// FULL is retained as an exported constant but no longer a snap stop.
const PEEK = 14;
const HALF = 45;
const FULL = 92;
const SNAPS = [PEEK, HALF];

function closest(value) {
  return SNAPS.reduce((a, b) => (Math.abs(b - value) < Math.abs(a - value) ? b : a));
}

// MEH-1054 (MAP-16): static list-row geometry shown while the feed's first
// fetch is in flight — reuses the global `skeleton-box` pulse util (CARD-26
// spec, globals.css), no new animation. Row height ≈ MobileSheetCard so the
// swap to real cards doesn't jump the sheet content.
function SheetListSkeleton({ label }) {
  return (
    // role="status" + existing common.skeleton.loading_businesses label —
    // mirrors SkeletonProducerGrid so AT hears "loading", not silence
    // (bars themselves stay aria-hidden).
    <div data-testid="sheet-list-skeleton" role="status" aria-label={label}>
      {[0, 1, 2, 3].map((i) => (
        <div key={i} className="skeleton-box rounded-[16px] h-20 mb-3" aria-hidden="true" />
      ))}
      {/* skeleton-box styles are NOT global CSS — they ship via styled-jsx
          from Skeleton.jsx; without this mount the bars render invisible. */}
      <SkeletonStyles />
    </div>
  );
}

// MEH-2148: gesture arbitration, extracted as a PURE function so the decision
// can be unit-tested without a touch device. Before this existed the drag
// listeners sat on the whole sheet with no arbitration at all, so every
// touchmove inside the list ALSO dragged the sheet height: a finger swiping
// down to read further collapsed the sheet to PEEK instead of scrolling.
//
// `dy` keeps the existing sign convention from the drag maths below
// (`startY - clientY`), so POSITIVE means the finger moved UP.
//
// The three claims, in the order they are checked:
//   1. the gesture did not start in the scroller (handle, header, count row)
//      -> the sheet always drags; there is nothing else those areas could do.
//   2. started in the scroller, sheet is at PEEK, finger up -> expand. At PEEK
//      the list is a few pixels tall and expanding is the only useful reading
//      of an upward swipe.
//   3. started in the scroller, list already at the top, finger down -> collapse.
//      This is the rubber-band position: there is no more content above, so the
//      sheet takes the gesture.
// Anything else belongs to the list, and the sheet must not call
// preventDefault() on it — that is what makes native scrolling work again.
export function sheetClaimsGesture({ startedInScroller, scrollTopAtStart, dy, snap }) {
  if (!startedInScroller) return true;
  if (snap === PEEK && dy > 0) return true;
  if (scrollTopAtStart === 0 && dy < 0) return true;
  return false;
}

// Direction is only meaningful once the finger has actually committed to one.
// Deciding on the first touchmove would read the 1-2px of jitter that starts
// every gesture and claim (or release) the sheet essentially at random.
const GESTURE_SLOP_PX = 4;

export default function MapBottomSheet({ snap, onSnapChange, children, count, loading = false }) {
  const t = useTranslations("map.bottom_sheet");
  // MEH-1054: existing key reused for the skeleton's AT label (no new copy).
  const tSkeleton = useTranslations("common.skeleton");
  const sheetRef = useRef(null);
  // MEH-2148: the scroller, so a touch can be attributed to the list or to the
  // sheet chrome. `sheetRef` cannot answer that — it contains both.
  const contentRef = useRef(null);
  const startY = useRef(0);
  const startSnap = useRef(snap);
  const dragging = useRef(false);
  // MEH-2148: per-touch arbitration state. `claimed` is deliberately tri-state:
  // undefined = not yet past the slop, true/false = decided ONCE for this touch
  // and never revisited, so a gesture cannot change owner mid-swipe.
  const startedInScroller = useRef(false);
  const scrollTopAtStart = useRef(0);
  const claimed = useRef(undefined);
  const [transient, setTransient] = useState(null);

  const heightVh = transient ?? snap;

  // MEH-970 R2: publish the sheet's live visible height as the `--map-sheet-h`
  // CSS var on <html> — the `--cookie-banner-h` precedent (MEH-850). Map
  // controls that must ride the sheet edge (the NearMePill) self-position via
  // calc(var(--map-sheet-h) + gap) instead of guessing a fixed offset. `heightVh`
  // is `transient ?? snap`, so this updates on every drag frame AND every snap —
  // the pill tracks the edge continuously through both. Published as a `vh`
  // string to match the sheet's own `height: ${heightVh}vh`.
  //
  // `--map-sheet-anim` publishes the sheet's OWN transition mode (this same
  // `transient != null ? "none" : 0.3s` split the sheet uses on its height, line
  // ~110) so the pill animates its `bottom` in LOCKSTEP: 0ms during a drag →
  // instant finger-tracking, 300ms on a snap → the pill glides with the sheet
  // instead of teleporting to the target while the sheet is still animating (that
  // teleport briefly floated the pill over the collapsing cards on a button/marker
  // HALF→PEEK collapse — the very overlap class this ticket fixes).
  useEffect(() => {
    const root = document.documentElement;
    root.style.setProperty("--map-sheet-h", `${heightVh}vh`);
    root.style.setProperty("--map-sheet-anim", transient != null ? "0ms" : "300ms");
  }, [heightVh, transient]);
  // Clean up ONLY on unmount so a non-/map page never inherits a stale offset
  // (mirrors CookieBanner.jsx:50). Kept separate from the publish effect so the
  // per-frame drag updates don't churn a remove/re-add cycle.
  useEffect(() => {
    return () => {
      const root = document.documentElement;
      root.style.removeProperty("--map-sheet-h");
      root.style.removeProperty("--map-sheet-anim");
    };
  }, []);

  const onTouchStart = useCallback((e) => {
    startY.current = e.touches[0].clientY;
    startSnap.current = snap;
    dragging.current = true;
    // MEH-2148: sampled at touchstart, not at touchmove. By the time the finger
    // has moved, `scrollTop` may already have changed under a native scroll,
    // and "was the list at the top when this gesture began" is the question
    // the arbiter actually needs answered.
    const scroller = contentRef.current;
    startedInScroller.current = Boolean(scroller && scroller.contains(e.target));
    scrollTopAtStart.current = scroller ? scroller.scrollTop : 0;
    claimed.current = undefined;
  }, [snap]);

  const onTouchMove = useCallback((e) => {
    if (!dragging.current) return;
    const dy = startY.current - e.touches[0].clientY;

    // MEH-2148: decide once, past the slop, then stop asking.
    if (claimed.current === undefined) {
      if (Math.abs(dy) < GESTURE_SLOP_PX) return;
      claimed.current = sheetClaimsGesture({
        startedInScroller: startedInScroller.current,
        scrollTopAtStart: scrollTopAtStart.current,
        dy,
        // startSnap, not the live `snap` prop: the snap this gesture BEGAN at
        // is what the user aimed from, and `snap` can change mid-drag.
        snap: startSnap.current,
      });
      if (!claimed.current) {
        // The list owns this touch. Do nothing at all — no preventDefault, no
        // transient height — and stand down for the rest of it, so the native
        // scroll runs exactly as if this component had no listeners.
        dragging.current = false;
        return;
      }
    }

    // Claimed: suppress the native scroll/rubber-band for this gesture. The
    // listener is registered non-passive precisely so this call is honoured;
    // under the previous `{ passive: true }` it would have been a console
    // warning and a no-op. `cancelable` is checked because a browser that has
    // already committed to scrolling reports the event as non-cancelable.
    if (e.cancelable) e.preventDefault();
    const dvh = (dy / window.innerHeight) * 100;
    const next = Math.max(PEEK, Math.min(HALF, startSnap.current + dvh));
    setTransient(next);
  }, []);

  const onTouchEnd = useCallback(() => {
    const wasClaimed = claimed.current === true;
    claimed.current = undefined;
    if (!dragging.current) return;
    dragging.current = false;
    // MEH-2148: snap only for a gesture the sheet actually took. Without this,
    // a plain list scroll would still land in closest() and re-snap the sheet
    // on every finger lift -- the same bug one layer down.
    if (!wasClaimed) return;
    const snapped = closest(transient ?? snap);
    setTransient(null);
    onSnapChange(snapped);
  }, [transient, snap, onSnapChange]);

  useEffect(() => {
    const el = sheetRef.current;
    if (!el) return;
    el.addEventListener("touchstart", onTouchStart, { passive: true });
    // MEH-2148: NON-passive. preventDefault() inside a passive listener is
    // ignored by the browser, so the arbitration above would decide correctly
    // and then fail to act on it.
    el.addEventListener("touchmove", onTouchMove, { passive: false });
    el.addEventListener("touchend", onTouchEnd);
    return () => {
      el.removeEventListener("touchstart", onTouchStart);
      el.removeEventListener("touchmove", onTouchMove);
      el.removeEventListener("touchend", onTouchEnd);
    };
  }, [onTouchStart, onTouchMove, onTouchEnd]);

  return (
    <div
      ref={sheetRef}
      className="fixed inset-x-0 bottom-0 z-[600] bg-background rounded-t-3xl border-t border-border flex flex-col"
      style={{
        height: `${heightVh}vh`,
        transition: transient != null ? "none" : "height 0.3s cubic-bezier(0.32,0.72,0,1)",
        paddingBottom: "64px",
      }}
    >
      {/* Drag handle — MEH-1029 (MAP-11): S5 chrome 44×5 (was 32×4). Warm tan
          (#D4C5A9) kept as-is — tokenization is a separate token-additions issue.
          `justify-center` is the direction-neutral centering idiom (no physical prop). */}
      <div className="flex justify-center py-2 cursor-grab shrink-0" aria-hidden="true">
        <div className="w-11 h-[5px] rounded-full bg-[#D4C5A9]" />
      </div>

      {/* Peek header */}
      <div className="px-4 pb-2 shrink-0 flex items-center justify-between">
        {/* MEH-935: ICU plural — count=1 singular, count=2 Hebrew dual, ≥3 plural.
            Was `{count} {t("title")}` (static noun → "1 בתי עסק מקומיים באזור").
            MEH-1029 (MAP-11): gold accent token (styling only; count string unchanged). */}
        {loading ? (
          // MEH-1054: while loading, a short pulse bar holds the count's slot —
          // rendering "0 בתי עסק" before the first response would read as a
          // (false) empty result. Count string itself unchanged (MAP-16
          // constraint: geometry only, no copy change).
          <span
            data-testid="sheet-count-skeleton"
            className="skeleton-box rounded-lg inline-block"
            style={{ width: "120px", height: "14px" }}
            aria-hidden="true"
          />
        ) : (
          <p className="text-sm font-medium text-accent numeric">
            {t("count", { count })}
          </p>
        )}
      </div>

      {/* Scrollable content — MEH-1133: `pt-1` gives the first card a little
          breathing room under the peek header (the header's `pb-2` alone left the
          first card's top edge visually touching the count row). Small so it
          doesn't eat the already-short PEEK content area.
          MEH-1298: `[overflow-anchor:none]` disables the browser's scroll
          anchoring for this container so the MobileSheetSelectedCard mount ->
          scrollTop compensation (MobileSheetSelectedCard.jsx) is deterministic
          across browsers. Chromium anchors natively (so the manual comp would
          double-shift); iOS Safari's anchoring is weaker (so it would shift with
          no comp). Turning anchoring OFF makes the manual comp the single,
          consistent mechanism -> zero list shift everywhere. */}
      {/* MEH-2148: `[overscroll-behavior-y:contain]` stops a scroll that reaches
          either end of this list from chaining to the document underneath —
          the effect visible in the 21/08 captures as the page itself moving
          behind the sheet (RTL scrollbar, clipped chip row). `contain` and not
          `none`: it blocks the chaining, keeps the local rubber-band. */}
      <div
        ref={contentRef}
        className="flex-1 overflow-y-auto overscroll-y-contain [overflow-anchor:none] px-4 pt-1"
      >
        {loading ? <SheetListSkeleton label={tSkeleton("loading_businesses")} /> : children}
      </div>
    </div>
  );
}

export { PEEK, HALF, FULL };
