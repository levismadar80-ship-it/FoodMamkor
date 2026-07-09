"use client";

import { useState, useRef, useCallback } from "react";
import { useTranslations } from "next-intl";
import { Images } from "@phosphor-icons/react";
import ImageWithFallback from "./ImageWithFallback";
import FavoriteButton from "./FavoriteButton";
import Lightbox from "./Lightbox";

export default function ImageGallery({ images = [], producerId = null, producerName = "" }) {
  const t = useTranslations("gallery");
  const [current, setCurrent] = useState(0);
  const [lightboxOpen, setLightboxOpen] = useState(false);
  const touchStartX = useRef(null);
  const touchEndX = useRef(null);
  // Keep a ref to the currently displayed image so Lightbox can return focus to it
  const imageButtonRef = useRef(null);

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
    const threshold = 50;
    if (Math.abs(diff) > threshold) {
      if (diff > 0) {
        // Swiped left → next (RTL: previous visual)
        setCurrent((c) => (c + 1) % images.length);
      } else {
        // Swiped right → previous (RTL: next visual)
        setCurrent((c) => (c - 1 + images.length) % images.length);
      }
    }
    touchStartX.current = null;
    touchEndX.current = null;
  }, [images.length]);

  // MEH-1047: open the lightbox at a specific image. The desktop editorial
  // grid cells open at their own index; the mobile carousel opens at `current`.
  const openLightbox = useCallback((index) => {
    setCurrent(index);
    setLightboxOpen(true);
  }, []);

  // MEH-815: imageless state renders the "Tinted Masthead" editorial hero
  // (Sapir-approved, Claude Design) instead of the old emoji+initials box.
  // Text-led, shorter than the imaged carousel. The producer name is the
  // page's sole <h1> here (ProducerHeader omits its own h1 when imageless,
  // so the name appears exactly once). Surface = green #2e6853 tint over
  // cream at 6% (ADR-019 opacity-on-cream — token + opacity, no hex token).
  // Recessive מ·ה brand monogram sits at the corner, gold, never dominant.
  if (!images.length) {
    return (
      <div
        className="relative w-full rounded-md bg-background border border-border overflow-hidden"
        data-testid="gallery-empty-state"
      >
        {/* 6% green tint over the cream surface beneath (ADR-019) */}
        <div
          className="relative bg-primary/[0.06] px-6 pb-6 pt-16 md:pt-20 flex items-end min-h-[120px] md:min-h-[150px]"
          data-testid="gallery-tint-layer"
        >
          {/* Recessive brand monogram — corner mark (end side, opposite the
              favorite control), gold, ~24px. Decorative, never dominant. */}
          <span
            className="absolute top-3 end-3 font-headline-lg text-2xl text-accent/40 leading-none select-none pointer-events-none"
            aria-hidden="true"
          >
            מ·ה
          </span>
          {/* MEH-815: h1 rendered unconditionally — ProducerHeader always omits
              its own name h1 when imageless, so the masthead must always supply
              the page's single h1 (guarantees exactly-one-h1 even for the
              backend-impossible empty-name case). */}
          <h1 className="font-headline-lg text-5xl md:text-6xl font-black text-text leading-tight">
            {producerName}
          </h1>
        </div>
        {producerId && (
          <div className="absolute top-3 start-3 z-10">
            <FavoriteButton producerId={producerId} variant="gallery" />
          </div>
        )}
      </div>
    );
  }

  // MEH-1047: a single image keeps the current full-width banner at every
  // breakpoint; 2+ images get the desktop editorial grid (md+) with the
  // mobile carousel kept below (chunk 2 restyles the mobile path).
  const single = images.length === 1;

  return (
    <>
    {/* MEH-1047: shared relative wrapper so a single FavoriteButton overlays
        the top-start corner of whichever layout is visible (desktop grid hero
        or mobile carousel) — one mount, one /users/me/favorites fetch. */}
    <div className="relative">
    {/* MEH-1047: desktop editorial grid (Direction B) — hero at inline-start
        + tall stacked secondary column (≤2 cells). The bottom cell of a
        stacked pair carries the single view_all (N) overlay pill (gallery.view_all). */}
    {!single && (
      <div
        className={`hidden md:grid gap-2 rounded-xl overflow-hidden border border-accent/30 h-[420px] lg:h-[460px] max-h-[460px] grid-cols-[62%_1fr] ${
          images.length >= 3 ? "grid-rows-2" : ""
        }`}
        data-testid="gallery-grid"
      >
        {/* Hero cell — inline-start; spans both rows when a stacked pair exists */}
        <button
          type="button"
          onClick={() => openLightbox(0)}
          aria-label={t("open_aria", { current: 1 })}
          className={`relative overflow-hidden bg-gray-100 focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-primary/60 ${
            images.length >= 3 ? "row-span-2" : ""
          }`}
          data-testid="gallery-grid-hero"
        >
          {/* MEH-1047 LCP: images[0] is the desktop LCP → eager `priority`.
              The mobile banner (below) is eager for its own breakpoint; every
              other image (secondary cells, off-screen slides) is lazy via
              next/image's default. Responsive dual-tree double-preloads the
              hero on the hidden breakpoint, but `sizes` bounds that fetch
              (~45vw mobile / ~60vw desktop) — accepted art-direction cost. */}
          <ImageWithFallback
            src={images[0]}
            alt={t("image_alt", { current: 1 })}
            fill
            priority
            className="object-cover"
            sizes="(min-width: 1024px) 40vw, 45vw"
          />
        </button>
        {/* Secondary cells — images[1] (+ images[2] when 3+). */}
        {images.slice(1, 3).map((src, i) => {
          const idx = i + 1;
          const isPillCell = images.length >= 3 && idx === 2;
          return (
            <button
              key={idx}
              type="button"
              onClick={() => openLightbox(idx)}
              aria-label={
                isPillCell
                  ? t("view_all", { n: images.length })
                  : t("open_aria", { current: idx + 1 })
              }
              className="relative overflow-hidden bg-gray-100 focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-primary/60"
              data-testid={isPillCell ? "gallery-grid-pill-cell" : "gallery-grid-cell"}
            >
              <ImageWithFallback
                src={src}
                alt={t("image_alt", { current: idx + 1 })}
                fill
                className="object-cover"
                sizes="(min-width: 1024px) 25vw, 30vw"
              />
              {isPillCell && (
                <span
                  className="absolute bottom-3 end-3 z-10 inline-flex items-center gap-1.5 rounded-full bg-accent px-3 py-1.5 text-sm font-label-md text-white shadow-md pointer-events-none"
                  data-testid="gallery-all-pill"
                >
                  <Images size={16} weight="bold" aria-hidden="true" />
                  {t("view_all", { n: images.length })}
                </span>
              )}
            </button>
          );
        })}
      </div>
    )}
    <div
      className={`relative h-52 rounded-md overflow-hidden bg-gray-100${single ? "" : " md:hidden"}`}
      onTouchStart={handleTouchStart}
      onTouchMove={handleTouchMove}
      onTouchEnd={handleTouchEnd}
    >
      <button
        ref={imageButtonRef}
        type="button"
        onClick={() => setLightboxOpen(true)}
        aria-label={t("open_aria", { current: current + 1 })}
        className="absolute inset-0 w-full h-full focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-primary/60"
      >
        <ImageWithFallback
          src={images[current]}
          alt={t("image_alt", { current: current + 1 })}
          fill
          priority={current === 0}
          className="object-cover"
          sizes="(max-width: 768px) 100vw, 60vw"
        />
      </button>
      {images.length > 1 && (
        <>
          {/* MEH-1047 chunk 2: counter chip (1/N) at top-end — opposite the
              favorite (top-start); dark scrim keeps it legible over any photo.
              .numeric bidi-isolates the fraction so RTL can't flip "1/5". */}
          <div
            className="absolute top-3 end-3 z-10 rounded-full bg-black/55 px-2.5 py-1 text-xs font-label-md text-white numeric pointer-events-none"
            data-testid="gallery-counter"
          >
            {current + 1}/{images.length}
          </div>
          {/* MEH-1047 chunk 2: thin gold progress bar (replaces the dots).
              Fill width tracks the current slide; decorative — swipe drives
              navigation, tap opens the lightbox for full arrow-key nav. */}
          <div
            className="absolute bottom-0 inset-x-0 h-1 bg-white/30"
            data-testid="gallery-progress"
            aria-hidden="true"
          >
            <div
              className="h-full bg-accent transition-[width] duration-base ease-quart"
              style={{ width: `${((current + 1) / images.length) * 100}%` }}
            />
          </div>
        </>
      )}
    </div>
    {/* MEH-1047: single FavoriteButton for the imaged state — pinned top-start
        (right, RTL) over the visible layout's hero corner. z-20 clears the
        counter chip / pill (z-10). */}
    {producerId && (
      <div className="absolute top-3 start-3 z-20">
        <FavoriteButton producerId={producerId} variant="gallery" />
      </div>
    )}
    </div>
    {lightboxOpen && (
      <Lightbox
        images={images}
        startIndex={current}
        onClose={() => {
          setLightboxOpen(false);
          imageButtonRef.current?.focus();
        }}
      />
    )}
    </>
  );
}
