"use client";

import { useTranslations } from "next-intl";

// Visual classes per tier — display-only metadata. Labels + tooltips
// resolve via t(`trust.tier_${tier}.{label,tooltip}`) so tier voice
// follows the active locale.
const TIER_CLASSNAME = {
  2: "bg-gray-100 text-gray-600 border-gray-200",
  3: "bg-primary/10 text-primary border-primary/20",
  4: "bg-amber-50 text-amber-700 border-amber-200",
  5: "bg-[#2E4A2E]/10 text-[#2E4A2E] border-[#2E4A2E]/20",
};

export default function TrustBadge({ tier, compact = false }) {
  const t = useTranslations("trust");
  if (!tier || tier < 2) return null;
  const tierKey = TIER_CLASSNAME[tier] ? tier : 2;
  const tooltip = t(`tier_${tierKey}.tooltip`);

  return (
    <span
      title={tooltip}
      className={[
        "inline-flex items-center rounded-full border font-medium",
        compact ? "text-[10px] px-1.5 py-0.5" : "text-xs px-2 py-0.5",
        TIER_CLASSNAME[tierKey],
      ].join(" ")}
      aria-label={tooltip}
    >
      {t(`tier_${tierKey}.label`)}
    </span>
  );
}
