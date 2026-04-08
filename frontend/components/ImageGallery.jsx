"use client";

import { useState } from "react";
import Image from "next/image";

export default function ImageGallery({ images = [] }) {
  const [current, setCurrent] = useState(0);

  if (!images.length) {
    return (
      <div className="h-64 md:h-96 bg-gray-100 rounded-[12px] flex items-center justify-center text-text-secondary">
        אין תמונות
      </div>
    );
  }

  return (
    <div className="relative h-64 md:h-96 rounded-[12px] overflow-hidden bg-gray-100">
      <Image
        src={images[current]}
        alt={`תמונה ${current + 1}`}
        fill
        className="object-cover"
        sizes="(max-width: 768px) 100vw, 60vw"
      />
      {images.length > 1 && (
        <>
          <button
            onClick={() => setCurrent((current - 1 + images.length) % images.length)}
            className="absolute right-3 top-1/2 -translate-y-1/2 bg-white/80 rounded-full w-10 h-10 flex items-center justify-center hover:bg-white transition"
          >
            ←
          </button>
          <button
            onClick={() => setCurrent((current + 1) % images.length)}
            className="absolute left-3 top-1/2 -translate-y-1/2 bg-white/80 rounded-full w-10 h-10 flex items-center justify-center hover:bg-white transition"
          >
            →
          </button>
          <div className="absolute bottom-3 left-1/2 -translate-x-1/2 flex gap-2">
            {images.map((_, i) => (
              <button
                key={i}
                onClick={() => setCurrent(i)}
                className={`w-2 h-2 rounded-full transition ${i === current ? "bg-white" : "bg-white/50"}`}
              />
            ))}
          </div>
        </>
      )}
    </div>
  );
}
