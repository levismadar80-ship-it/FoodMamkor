"use client";

import { useState } from "react";

export default function StarSelector({ value, onChange }) {
  const [hover, setHover] = useState(0);

  return (
    <div className="flex gap-2 justify-center" dir="ltr">
      {[1, 2, 3, 4, 5].map((star) => (
        <button
          key={star}
          type="button"
          className="text-4xl transition hover:scale-110"
          onMouseEnter={() => setHover(star)}
          onMouseLeave={() => setHover(0)}
          onClick={() => onChange(star)}
        >
          {star <= (hover || value) ? "⭐" : "☆"}
        </button>
      ))}
    </div>
  );
}
