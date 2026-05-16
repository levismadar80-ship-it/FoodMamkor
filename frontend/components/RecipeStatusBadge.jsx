"use client";

/**
 * RecipeStatusBadge — MEH-590 chunk 3/4 of the producer-recipes epic.
 *
 * Renders the moderation state of a producer recipe as a small pill.
 * Four states mirror the DB CHECK constraint declared in MEH-588
 * migration f4c8a91e2b07:
 *   pending          → gray   "ממתין לאישור"
 *   approved         → green  "אושר ופורסם"
 *   rejected         → red    "נדחה"
 *   needs_revision   → orange "צריך תיקון"
 *
 * Pattern mirrored from STATUS_LABELS at
 * frontend/app/[locale]/producer/dashboard/group-buys/page.js:11-16
 * (color + label dict keyed on backend status string).
 *
 * RTL-safe: no physical positional classes; the pill is a single
 * inline-flex container with logical padding.
 */

const STATUS = {
  pending: {
    label: "ממתין לאישור",
    cls: "bg-gray-100 text-gray-700 border-gray-200",
  },
  approved: {
    label: "אושר ופורסם",
    cls: "bg-[#EAF3DE] text-primary border-primary/30",
  },
  rejected: {
    label: "נדחה",
    cls: "bg-red-50 text-red-700 border-red-200",
  },
  needs_revision: {
    label: "צריך תיקון",
    cls: "bg-orange-50 text-orange-700 border-orange-200",
  },
};

export default function RecipeStatusBadge({ status }) {
  const s = STATUS[status] || {
    label: status || "—",
    cls: "bg-gray-100 text-gray-600 border-gray-200",
  };
  return (
    <span
      className={`inline-flex items-center text-xs border px-2 py-0.5 rounded-full whitespace-nowrap ${s.cls}`}
    >
      {s.label}
    </span>
  );
}
