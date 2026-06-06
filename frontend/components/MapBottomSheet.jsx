"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useTranslations } from "next-intl";

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

export default function MapBottomSheet({ snap, onSnapChange, children, count }) {
  const t = useTranslations("map.bottom_sheet");
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
      className="fixed inset-x-0 bottom-0 z-[600] bg-background rounded-t-lg border-t border-border flex flex-col"
      style={{
        height: `${heightVh}vh`,
        transition: transient != null ? "none" : "height 0.3s cubic-bezier(0.32,0.72,0,1)",
        paddingBottom: "64px",
      }}
    >
      {/* Drag handle — S5 FINAL 32×4, warm tan (#D4C5A9, FINAL-specified; not yet tokenized) */}
      <div className="flex justify-center py-2 cursor-grab shrink-0" aria-hidden="true">
        <div className="w-8 h-1 rounded-full bg-[#D4C5A9]" />
      </div>

      {/* Peek header */}
      <div className="px-4 pb-2 shrink-0 flex items-center justify-between">
        <p className="text-sm font-medium text-text">
          <span className="numeric">{count}</span> {t("title")}
        </p>
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
        {children}
      </div>
    </div>
  );
}

export { PEEK, HALF, FULL };
