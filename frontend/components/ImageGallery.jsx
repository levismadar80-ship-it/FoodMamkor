"use client";

import { useState, useRef, useCallback } from "react";
import ImageWithFallback from "./ImageWithFallback";
import FavoriteButton from "./FavoriteButton";

export default function ImageGallery({ images = [], producerId = null }) {
  const [current, setCurrent] = useState(0);
  const touchStartX = useRef(null);
  const touchEndX = useRef(null);

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

  if (!images.length) {
    return (
      <div
        className="relative h-64 md:h-96 rounded-[12px] flex items-center justify-center text-text-secondary"
        style={{ background: "linear-gradient(135deg, #EAF3DE 0%, #c9e2d3 100%)" }}
      >
        <span aria-hidden style={{ fontSize: 48 }}>🌿</span>
        {producerId && (
          <div className="absolute top-3 right-3 z-10">
            <FavoriteButton producerId={producerId} variant="gallery" />
          </div>
        )}
      </div>
    );
  }

  return (
    <div
      className="relative h-64 md:h-96 rounded-[12px] overflow-hidden bg-gray-100"
      onTouchStart={handleTouchStart}
      onTouchMove={handleTouchMove}
      onTouchEnd={handleTouchEnd}
    >
      <ImageWithFallback
        src={images[current]}
        alt={`תמונה ${current + 1}`}
        fill
        className="object-cover"
        sizes="(max-width: 768px) 100vw, 60vw"
      />
      {producerId && (
        <div className="absolute top-3 right-3 z-10">
          <FavoriteButton producerId={producerId} variant="gallery" />
        </div>
      )}
      {images.length > 1 && (
        <>
          <button
            type="button"
            onClick={() => setCurrent((current - 1 + images.length) % images.length)}
            className="absolute right-3 top-1/2 -translate-y-1/2 bg-white/80 rounded-full w-11 h-11 flex items-center justify-center hover:bg-white transition focus-visible:ring-2 focus-visible:ring-primary/40"
            aria-label="תמונה קודמת"
          >
            <span aria-hidden="true">←</span>
          </button>
          <button
            type="button"
            onClick={() => setCurrent((current + 1) % images.length)}
            className="absolute left-3 top-1/2 -translate-y-1/2 bg-white/80 rounded-full w-11 h-11 flex items-center justify-center hover:bg-white transition focus-visible:ring-2 focus-visible:ring-primary/40"
            aria-label="תמונה הבאה"
          >
            <span aria-hidden="true">→</span>
          </button>
          <div className="absolute bottom-3 left-1/2 -translate-x-1/2 flex gap-2">
            {images.map((_, i) => (
              <button
                key={i}
                type="button"
                onClick={() => setCurrent(i)}
                className={`w-3 h-3 rounded-full transition focus-visible:ring-2 focus-visible:ring-primary/40 ${i === current ? "bg-white" : "bg-white/50 hover:bg-white/80"}`}
                aria-label={`עבור לתמונה ${i + 1}`}
                aria-current={i === current ? "true" : undefined}
              />
            ))}
          </div>
        </>
      )}
    </div>
  );
}
