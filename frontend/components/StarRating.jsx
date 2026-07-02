"use client";

import { useTranslations } from "next-intl";
import { Star } from "@phosphor-icons/react";

export default function StarRating({ avg, count }) {
  const t = useTranslations("common.star_rating");
  if (!count || count === 0) return null;

  return (
    <div className="flex items-center gap-1 text-sm">
      <Star size={16} weight="fill" className="text-yellow-500" aria-hidden="true" />
      <span className="font-medium">{avg?.toFixed(1)}</span>
      <span className="text-muted">{t("count_aria", { count })}</span>
    </div>
  );
}
