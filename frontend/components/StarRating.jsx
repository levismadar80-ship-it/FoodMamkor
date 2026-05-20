"use client";

import { useTranslations } from "next-intl";

export default function StarRating({ avg, count }) {
  const t = useTranslations("common.star_rating");
  if (!count || count === 0) return null;

  return (
    <div className="flex items-center gap-1 text-sm">
      <span className="text-yellow-500">⭐</span>
      <span className="font-medium">{avg?.toFixed(1)}</span>
      <span className="text-text-secondary">{t("count_aria", { count })}</span>
    </div>
  );
}
