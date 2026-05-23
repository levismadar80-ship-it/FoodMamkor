"use client";

import { useState } from "react";
import { Star } from "@phosphor-icons/react";
import { useTranslations } from "next-intl";

export default function StarSelector({ value, onChange }) {
  // Reuse reviews.star_aria — same semantic + ICU plural shape.
  const t = useTranslations("reviews");
  const [hover, setHover] = useState(0);

  return (
    <div className="flex gap-2 justify-center" dir="ltr">
      {[1, 2, 3, 4, 5].map((star) => {
        const filled = star <= (hover || value);
        return (
          <button
            key={star}
            type="button"
            className="transition hover:scale-110"
            onMouseEnter={() => setHover(star)}
            onMouseLeave={() => setHover(0)}
            onClick={() => onChange(star)}
            aria-label={t("star_aria", { value: star })}
          >
            <Star
              size={36}
              weight={filled ? "fill" : "regular"}
              color={filled ? "#8B6914" : "#e8e0d0"}
            />
          </button>
        );
      })}
    </div>
  );
}
