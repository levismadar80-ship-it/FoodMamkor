"use client";

/**
 * RecipeStatusBadge — MEH-590 chunk 3/4 of the producer-recipes epic.
 *
 * Renders the moderation state of a producer recipe as a small pill.
 * Four states mirror the DB CHECK constraint declared in MEH-588
 * migration f4c8a91e2b07: pending / approved / rejected / needs_revision.
 *
 * Pattern mirrored from STATUS_LABELS at
 * frontend/app/[locale]/producer/dashboard/group-buys/page.js:11-16
 * (color + label dict keyed on backend status string).
 *
 * RTL-safe: no physical positional classes; the pill is a single
 * inline-flex container with logical padding.
 */

import { useTranslations } from "next-intl";

const STATUS_CLS = {
  pending: "bg-gray-100 text-gray-700 border-gray-200",
  approved: "bg-[#EAF3DE] text-primary border-primary/30",
  rejected: "bg-red-50 text-red-700 border-red-200",
  needs_revision: "bg-orange-50 text-orange-700 border-orange-200",
};

export default function RecipeStatusBadge({ status }) {
  const t = useTranslations("recipes.status");
  const cls = STATUS_CLS[status];
  const label = cls ? t(status) : status || "—";
  return (
    <span
      className={`inline-flex items-center text-xs border px-2 py-0.5 rounded-full whitespace-nowrap ${cls || "bg-gray-100 text-gray-600 border-gray-200"}`}
    >
      {label}
    </span>
  );
}
