"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { X, ImageBroken } from "@phosphor-icons/react";
import { useTranslations } from "next-intl";

/**
 * MEH-1931: shared class string for the three overlay controls (close, prev,
 * next). One owner so the contrast fix cannot drift between them.
 *
 * All four ratios below are MEASURED from composited pixels by
 * e2e/qa-meh1931-lightbox-visibility.mjs, not computed by hand. An earlier
 * draft of this comment carried hand-arithmetic (1.17 / 7.3) that the
 * measurement contradicted; the probe is the source of truth.
 *
 *   bg-white/10 (prior)  -> rgb(38,38,37)    = 1.29:1  FAILS WCAG 1.4.11 (3:1)
 *   bg-white/40 (now)    -> rgb(110,110,110) = 3.84:1  passes on the fill
 *   ring-white/70 @1px   -> rgb(182,182,182) = 9.65:1  passes again on the border
 *   focus-visible        -> 1px white/70 becomes 2px opaque white
 *
 * Sizes (w-11/w-12 = 44/48px) are unchanged — the hit area was never the bug.
 * The focus row matters because the base ring is NEW: focus-visible now has to
 * distinguish itself from a ring rather than from nothing, so it is asserted
 * rather than assumed.
 */
const OVERLAY_CONTROL_CLS =
  "rounded-full bg-white/40 hover:bg-white/60 ring-1 ring-white/70 " +
  "flex items-center justify-center text-white transition " +
  "focus-visible:ring-2 focus-visible:ring-white";

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
  // MEH-1931: a raw <img> with no onError renders the browser's broken-image
  // glyph — the one thing this surface must never show. Stored as the index
  // that failed rather than a boolean, so navigating away clears it during
  // render; a reset useEffect would work too but trips
  // react-hooks/set-state-in-effect and costs a cascading render.
  const [errorIndex, setErrorIndex] = useState(null);
  const imgError = errorIndex === index;
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
          className={`absolute top-4 end-4 z-10 w-11 h-11 ${OVERLAY_CONTROL_CLS}`}
        >
          <X size={22} weight="bold" aria-hidden="true" />
        </button>

        {/* Main image */}
        <div className="px-16 flex items-center justify-center w-full h-full">
          {/* raw img: full-bleed lightbox. Sized by its own intrinsic ratio
              under max-w-[95vw]/max-h-[90vh] + object-contain — there is no
              fixed box for next/image, and `fill` would change the layout
              contract on a public surface this ticket requires to be visually
              unchanged. Not an LCP image: it mounts on user click. */}
          {imgError ? (
            /* MEH-1931: neutral fallback in place of the browser's broken-image
               glyph. ring-white/40 is the same composite as the control fill
               above — measured 3.84:1 over the bg-black/95 scrim — so the box
               has a boundary a sighted user can actually find; role="img" +
               aria-label carry the same news to a screen reader. */
            <div
              role="img"
              aria-label={t("image_error")}
              data-testid="lightbox-image-error"
              className="flex flex-col items-center justify-center gap-3 rounded-xl bg-white/10 ring-1 ring-white/40 px-8 text-center text-white/90 w-[min(90vw,420px)] h-[min(60vh,320px)]"
            >
              <ImageBroken size={48} aria-hidden="true" />
              <span className="text-sm">{t("image_error")}</span>
            </div>
          ) : (
            /* eslint-disable-next-line @next/next/no-img-element */
            <img
              key={index}
              src={images[index]}
              alt={t("image_alt", { current: index + 1, total: images.length })}
              className="max-w-[95vw] max-h-[90vh] object-contain"
              style={{ animation: "lightboxImgFade 150ms ease" }}
              onError={() => setErrorIndex(index)}
            />
          )}
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
              className={`absolute top-1/2 -translate-y-1/2 end-4 w-12 h-12 text-xl ${OVERLAY_CONTROL_CLS}`}
            >
              <span aria-hidden="true">→</span>
            </button>
            {/* start-4 = visual left in RTL = "next" */}
            <button
              type="button"
              onClick={goNext}
              aria-label={t("next_aria")}
              className={`absolute top-1/2 -translate-y-1/2 start-4 w-12 h-12 text-xl ${OVERLAY_CONTROL_CLS}`}
            >
              <span aria-hidden="true">←</span>
            </button>

            {/* Counter — horizontal center */}
            {/* MEH-1931: rendered "3 / 2" before this. In an RTL paragraph the
                neutral run " / " sits between two EN runs, so UBA rule N1 gives
                it R direction and the whole fraction reverses. `.numeric`
                (unicode-bidi: isolate, globals.css:132) alone does NOT fix that
                — an isolate still resolves its contents under the inherited
                `direction: rtl`. The repo's working sites pair it with an
                explicit dir="ltr" (ProducerHeader.jsx:191,:244 ·
                ContactCard.jsx:320 · EventsClient.jsx:448,:475); that pair is
                what is used here. ImageGallery.jsx:318 gets away with `.numeric`
                alone only because its "1/5" has no spaces, so UBA rule W4 folds
                the slash into a single number run. */}
            {/* eslint-disable-next-line no-restricted-syntax -- rtl-ok: horizontal centering idiom */}
            <div dir="ltr" data-testid="lightbox-counter" className="absolute bottom-6 left-1/2 -translate-x-1/2 text-white/80 text-sm tabular-nums numeric select-none">
              {index + 1} / {images.length}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
