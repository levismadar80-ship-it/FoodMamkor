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

export default function MapBottomSheet({ snap, onSnapChange, children, count, loading = false }) {
  const t = useTranslations("map.bottom_sheet");
  // MEH-1054: existing key reused for the skeleton's AT label (no new copy).
  const tSkeleton = useTranslations("common.skeleton");
  const sheetRef = useRef(null);
  const startY = useRef(0);
  const startSnap = useRef(snap);
  const dragging = useRef(false);
  const [transient, setTransient] = useState(null);

  const heightVh = transient ?? snap;

  const onTouchStart = useCallback((e) => {
    startY.current = e.touches[0].clientY;
    startSnap.current = snap;
    dragging.current = true;
  }, [snap]);

  const onTouchMove = useCallback((e) => {
    if (!dragging.current) return;
    const dy = startY.current - e.touches[0].clientY;
    const dvh = (dy / window.innerHeight) * 100;
    const next = Math.max(PEEK, Math.min(HALF, startSnap.current + dvh));
    setTransient(next);
  }, []);

  const onTouchEnd = useCallback(() => {
    if (!dragging.current) return;
    dragging.current = false;
    const snapped = closest(transient ?? snap);
    setTransient(null);
    onSnapChange(snapped);
  }, [transient, snap, onSnapChange]);

  useEffect(() => {
    const el = sheetRef.current;
    if (!el) return;
    el.addEventListener("touchstart", onTouchStart, { passive: true });
    el.addEventListener("touchmove", onTouchMove, { passive: true });
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
        {snap === HALF && (
          <button
            type="button"
            onClick={() => onSnapChange(PEEK)}
            className="text-sm text-primary font-medium hover:underline"
          >
            {t("show_map")}
          </button>
        )}
      </div>

      {/* Scrollable content */}
      <div className="flex-1 overflow-y-auto px-4">
        {loading ? <SheetListSkeleton label={tSkeleton("loading_businesses")} /> : children}
      </div>
    </div>
  );
}

export { PEEK, HALF, FULL };
