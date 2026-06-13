"use client";

import { useTranslations } from "next-intl";
import Tooltip from "@/components/ui/Tooltip";

// Visual classes per tier — display-only metadata. Labels + tooltips
// resolve via t(`trust.tier_${tier}.{label,tooltip}`) so tier voice
// follows the active locale.
// MEH-792: tier 5 binds to the state-selected token (#970; same value as
// primary-dark/green-700) instead of a raw hex literal — rendered color
// identical.
const TIER_CLASSNAME = {
  2: "bg-gray-100 text-gray-600 border-gray-200",
  3: "bg-primary/10 text-primary border-primary/20",
  4: "bg-amber-50 text-amber-700 border-amber-200",
  5: "bg-state-selected/10 text-state-selected border-state-selected/20",
};

export default function TrustBadge({ tier, compact = false }) {
  const t = useTranslations("trust");
  if (!tier || tier < 2) return null;
  const tierKey = TIER_CLASSNAME[tier] ? tier : 2;
  const tooltip = t(`tier_${tierKey}.tooltip`);

  // MEH-792: explainer routes through the ui/Tooltip primitive (hover/focus/
  // click) instead of the native `title` attr — title never surfaced on touch
  // devices. aria-label kept so the explainer still reaches screen readers.
  return (
    <Tooltip content={tooltip} position="bottom">
      <span
        className={[
          "inline-flex items-center rounded-full border font-medium",
          compact ? "text-[10px] px-1.5 py-0.5" : "text-xs px-2 py-0.5",
          TIER_CLASSNAME[tierKey],
        ].join(" ")}
        aria-label={tooltip}
      >
        {t(`tier_${tierKey}.label`)}
      </span>
    </Tooltip>
  );
}
