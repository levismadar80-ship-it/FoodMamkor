"use client";

import { useRef, useState } from "react";
import ImageWithFallback from "./ImageWithFallback";

export default function ImageGallery({ images = [] }) {
  const [current, setCurrent] = useState(0);
  // Touch-swipe state — no library needed, just track start vs end X.
  const touchRef = useRef({ startX: 0, startY: 0 });

  const goNext = () => setCurrent((c) => (c + 1) % images.length);
  const goPrev = () => setCurrent((c) => (c - 1 + images.length) % images.length);

  const onTouchStart = (e) => {
    touchRef.current.startX = e.touches[0].clientX;
    touchRef.current.startY = e.touches[0].clientY;
  };
  const onTouchEnd = (e) => {
    const dx = e.changedTouches[0].clientX - touchRef.current.startX;
    const dy = e.changedTouches[0].clientY - touchRef.current.startY;
    // Only trigger if horizontal swipe > 50px and more horizontal than vertical
    if (Math.abs(dx) < 50 || Math.abs(dx) < Math.abs(dy)) return;
    // RTL: swipe right (positive dx) = previous, swipe left = next
    if (dx > 0) goPrev();
    else goNext();
  };

  if (!images.length) {
    return (
      <div
        className="h-64 md:h-96 rounded-[12px] flex items-center justify-center text-text-secondary"
        style={{ background: "linear-gradient(135deg, #EAF3DE 0%, #c9e2d3 100%)" }}
      >
        <span aria-hidden style={{ fontSize: 48 }}>🌿</span>
      </div>
    );
  }

  return (
    <div
      className="relative h-64 md:h-96 rounded-[12px] overflow-hidden bg-gray-100"
      onTouchStart={images.length > 1 ? onTouchStart : undefined}
      onTouchEnd={images.length > 1 ? onTouchEnd : undefined}
    >
      <ImageWithFallback
        src={images[current]}
        alt={`תמונה ${current + 1}`}
        fill
        className="object-cover"
        sizes="(max-width: 768px) 100vw, 60vw"
      />
      {images.length > 1 && (
        <>
          <button
            type="button"
            onClick={goPrev}
            className="absolute right-3 top-1/2 -translate-y-1/2 bg-white/80 rounded-full w-11 h-11 flex items-center justify-center hover:bg-white transition focus-visible:ring-2 focus-visible:ring-primary/40"
            aria-label="תמונה קודמת"
          >
            <span aria-hidden="true">←</span>
          </button>
          <button
            type="button"
            onClick={goNext}
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
