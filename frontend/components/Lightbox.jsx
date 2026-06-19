"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { X } from "@phosphor-icons/react";
import { useTranslations } from "next-intl";

/**
 * Lightbox — full-screen image viewer opened from ImageGallery.
 *
 * Props:
 *   images: string[]       — image URL array
 *   startIndex: number     — which image opens first
 *   onClose: () => void
 *
 * RTL: ArrowLeft=next, ArrowRight=prev (Hebrew reading direction).
 * z-index 9000 — below chat (9999) + cookie (9998) + login-prompt (9500).
 */
export default function Lightbox({ images = [], startIndex = 0, onClose }) {
  const t = useTranslations("modals.lightbox");
  const [index, setIndex] = useState(startIndex);
  const closeRef = useRef(null);
  const dialogRef = useRef(null);
  const touchStartX = useRef(null);
  const touchEndX = useRef(null);

  useEffect(() => {
    closeRef.current?.focus();
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => { document.body.style.overflow = prev; };
  }, []);

  const goNext = useCallback(
    () => setIndex((i) => (i + 1) % images.length),
    [images.length]
  );
  const goPrev = useCallback(
    () => setIndex((i) => (i - 1 + images.length) % images.length),
    [images.length]
  );

  // ESC closes; ArrowLeft=next, ArrowRight=prev (RTL-aware); Tab cycles within dialog
  useEffect(() => {
    const FOCUSABLE = 'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])';
    const onKey = (e) => {
      if (e.key === "Escape") { onClose(); return; }
      if (e.key === "ArrowLeft") { goNext(); return; }
      if (e.key === "ArrowRight") { goPrev(); return; }
      if (e.key === "Tab") {
        const els = Array.from(dialogRef.current?.querySelectorAll(FOCUSABLE) ?? []);
        if (!els.length) return;
        const first = els[0];
        const last = els[els.length - 1];
        if (e.shiftKey && document.activeElement === first) {
          e.preventDefault(); last.focus();
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault(); first.focus();
        }
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose, goNext, goPrev]);

  const handleTouchStart = useCallback((e) => {
    touchStartX.current = e.touches[0].clientX;
    touchEndX.current = null;
  }, []);
  const handleTouchMove = useCallback((e) => {
    touchEndX.current = e.touches[0].clientX;
  }, []);
  const handleTouchEnd = useCallback(() => {
    if (touchStartX.current === null || touchEndX.current === null) return;
    const diff = touchStartX.current - touchEndX.current;
    if (Math.abs(diff) > 50) { if (diff > 0) goNext(); else goPrev(); }
    touchStartX.current = null;
    touchEndX.current = null;
  }, [goNext, goPrev]);

  if (!images.length) return null;

  return (
    <div
      className="fixed inset-0 z-[9000] bg-black/95 flex items-center justify-center"
      style={{ animation: "lightboxFadeIn 200ms ease" }}
      onClick={onClose}
      role="presentation"
      onTouchStart={handleTouchStart}
      onTouchMove={handleTouchMove}
      onTouchEnd={handleTouchEnd}
    >
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-label={t("aria_label")}
        onClick={(e) => e.stopPropagation()}
        className="relative flex items-center justify-center w-full h-full"
      >
        {/* Close */}
        <button
          ref={closeRef}
          type="button"
          onClick={onClose}
          aria-label={t("close_aria")}
          className="absolute top-4 end-4 z-10 w-11 h-11 rounded-full bg-white/10 hover:bg-white/20 flex items-center justify-center text-white transition focus-visible:ring-2 focus-visible:ring-white/40"
        >
          <X size={22} weight="bold" aria-hidden="true" />
        </button>

        {/* Main image */}
        <div className="px-16 flex items-center justify-center w-full h-full">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            key={index}
            src={images[index]}
            alt={t("image_alt", { current: index + 1, total: images.length })}
            className="max-w-[95vw] max-h-[90vh] object-contain"
            style={{ animation: "lightboxImgFade 150ms ease" }}
          />
        </div>

        {images.length > 1 && (
          // MEH-877: carousel prev/next glyph arrows — RTL-correct as-is via
          // logical end-4/start-4 positioning. Intentionally NOT bidi-flipped
          // (documented rtl.md exception "Carousel prev/next arrows"); do not
          // re-flag in future bidi sweeps.
          <>
            {/* end-4 = visual right in RTL = "previous" */}
            <button
              type="button"
              onClick={goPrev}
              aria-label={t("prev_aria")}
              className="absolute top-1/2 -translate-y-1/2 end-4 w-12 h-12 rounded-full bg-white/10 hover:bg-white/20 flex items-center justify-center text-white text-xl transition focus-visible:ring-2 focus-visible:ring-white/40"
            >
              <span aria-hidden="true">→</span>
            </button>
            {/* start-4 = visual left in RTL = "next" */}
            <button
              type="button"
              onClick={goNext}
              aria-label={t("next_aria")}
              className="absolute top-1/2 -translate-y-1/2 start-4 w-12 h-12 rounded-full bg-white/10 hover:bg-white/20 flex items-center justify-center text-white text-xl transition focus-visible:ring-2 focus-visible:ring-white/40"
            >
              <span aria-hidden="true">←</span>
            </button>

            {/* Counter — horizontal center */}
            {/* eslint-disable-next-line no-restricted-syntax -- rtl-ok: horizontal centering idiom */}
            <div className="absolute bottom-6 left-1/2 -translate-x-1/2 text-white/80 text-sm tabular-nums select-none">
              {index + 1} / {images.length}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
