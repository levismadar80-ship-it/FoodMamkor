"use client";

const TIER_CONFIG = {
  2: {
    label: "✓ מספר מאומת",
    className: "bg-gray-100 text-gray-600 border-gray-200",
    tooltip: "מספר הטלפון של בעלת העסק אומת באמצעות קוד חד-פעמי",
  },
  3: {
    label: "✅ עסק מאומת",
    className: "bg-primary/10 text-primary border-primary/20",
    tooltip: "בית העסק עבר אימות ידני על ידי צוות מהמקור",
  },
  4: {
    label: "⭐ מובילת קהילה",
    className: "bg-amber-50 text-amber-700 border-amber-200",
    tooltip: "10+ ביקורות עם דירוג ממוצע 4.5 ומעלה",
  },
  5: {
    label: "🏅 שגרירת מהמקור",
    className: "bg-[#2E4A2E]/10 text-[#2E4A2E] border-[#2E4A2E]/20",
    tooltip: "היצרנית המובילה באזור — נבחרה ידנית על ידי מהמקור",
  },
};

export default function TrustBadge({ tier, compact = false }) {
  if (!tier || tier < 2) return null;
  const config = TIER_CONFIG[tier] || TIER_CONFIG[2];

  return (
    <span
      title={config.tooltip}
      className={[
        "inline-flex items-center rounded-full border font-medium",
        compact ? "text-[10px] px-1.5 py-0.5" : "text-xs px-2 py-0.5",
        config.className,
      ].join(" ")}
      aria-label={config.tooltip}
    >
      {config.label}
    </span>
  );
}
