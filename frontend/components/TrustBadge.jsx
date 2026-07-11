"use client";

import { useTranslations } from "next-intl";
import Tooltip from "@/components/ui/Tooltip";

// Visual classes per tier — display-only metadata. Labels + tooltips
// resolve via t(`trust.tier_${tier}.{label,tooltip}`) so tier voice
// follows the active locale.
// MEH-792: tier 5 binds to the state-selected token (#970; same value as
// primary-dark/green-700) instead of a raw hex literal — rendered color
// identical.
// MEH-1120 (MEH-1074 Task B): TrustBadge now renders ONLY the recognition
// tiers — 4 ("⭐ מובילת קהילה") and 5 ("🏅 שגרירת מהמקור"). The verification
// tiers 2 ("✓ מספר מאומת" — phone) and 3 ("✅ עסק מאומת" — business) were
// dropped from every reader surface: verification is owned by BadgeRow /
// verification_tier (ADR-022), so rendering tier 3 next to the BadgeRow
// "מאומת" seal duplicated the same signal in two styles (MEH-602 debt), and
// "מספר מאומת" read as business verification (ADR-022 gate 1).
const TIER_CLASSNAME = {
  4: "bg-amber-50 text-amber-700 border-amber-200",
  5: "bg-state-selected/10 text-state-selected border-state-selected/20",
};

export default function TrustBadge({ tier, compact = false }) {
  const t = useTranslations("trust");
  // < 4 → nothing (tiers 2/3 verification live in BadgeRow/ADR-022 now).
  if (!tier || tier < 4) return null;
  const tierKey = TIER_CLASSNAME[tier] ? tier : 4;
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
