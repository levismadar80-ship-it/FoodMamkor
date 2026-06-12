"use client";

import { useState, useRef, useCallback } from "react";
import { useTranslations } from "next-intl";
import ImageWithFallback from "./ImageWithFallback";
import FavoriteButton from "./FavoriteButton";
import Lightbox from "./Lightbox";

export default function ImageGallery({ images = [], producerId = null, producerInitials = "" }) {
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

  // MEH-76 chunk 3 — S6 state b: no photo renders a dignified typographic
  // monogram (display-serif initials on the cream surface), never the old
  // emoji-avatar. Initials come from getProducerInitials ("ג · ה" / one
  // deliberate letter, MEH-638).
  if (!images.length) {
    return (
      <div
        className="relative w-full h-[120px] md:h-[180px] rounded-md bg-background border border-border flex flex-col items-center justify-center gap-2 text-fg-muted"
        data-testid="gallery-empty-state"
      >
        {producerInitials && (
          <span
            className="font-headline-lg text-4xl md:text-5xl font-black text-primary-dark/60"
            aria-hidden="true"
          >
            {producerInitials}
          </span>
        )}
        {producerId && (
          <div className="absolute top-3 start-3 z-10">
            <FavoriteButton producerId={producerId} variant="gallery" />
          </div>
        )}
      </div>
    );
  }

  return (
    <>
    <div
      className="relative h-52 rounded-md overflow-hidden bg-gray-100"
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
      {producerId && (
        <div className="absolute top-3 start-3 z-10">
          <FavoriteButton producerId={producerId} variant="gallery" />
        </div>
      )}
      {images.length > 1 && (
        <>
          <button
            type="button"
            onClick={() => setCurrent((current - 1 + images.length) % images.length)}
            // eslint-disable-next-line no-restricted-syntax -- rtl-ok: carousel arrow (physical by design)
            className="absolute right-3 top-1/2 -translate-y-1/2 bg-white/80 rounded-full w-11 h-11 flex items-center justify-center hover:bg-white transition focus-visible:ring-2 focus-visible:ring-primary/40"
            aria-label={t("prev_aria")}
          >
            <span aria-hidden="true">←</span>
          </button>
          <button
            type="button"
            onClick={() => setCurrent((current + 1) % images.length)}
            // eslint-disable-next-line no-restricted-syntax -- rtl-ok: carousel arrow (physical by design)
            className="absolute left-3 top-1/2 -translate-y-1/2 bg-white/80 rounded-full w-11 h-11 flex items-center justify-center hover:bg-white transition focus-visible:ring-2 focus-visible:ring-primary/40"
            aria-label={t("next_aria")}
          >
            <span aria-hidden="true">→</span>
          </button>
          {/* eslint-disable-next-line no-restricted-syntax -- rtl-ok: horizontal centering idiom */}
          <div className="absolute bottom-3 left-1/2 -translate-x-1/2 flex gap-1">
            {images.map((_, i) => (
              <button
                key={i}
                type="button"
                onClick={() => setCurrent(i)}
                className="w-11 h-11 flex items-center justify-center focus-visible:ring-2 focus-visible:ring-primary/40 rounded-lg"
                aria-label={t("thumb_aria", { n: i + 1 })}
                aria-current={i === current ? "true" : undefined}
              >
                <span
                  className={`block w-2.5 h-2.5 rounded-full transition pointer-events-none ${
                    i === current ? "bg-white" : "bg-white/50 hover:bg-white/80"
                  }`}
                />
              </button>
            ))}
          </div>
        </>
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
