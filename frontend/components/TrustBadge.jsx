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

export default function TrustBadge({ tier, compact = false, avoidRef = null }) {
  const t = useTranslations("trust");
  // < 4 → nothing (tiers 2/3 verification live in BadgeRow/ADR-022 now).
  if (!tier || tier < 4) return null;
  const tierKey = TIER_CLASSNAME[tier] ? tier : 4;
  const tooltip = t(`tier_${tierKey}.tooltip`);

  // MEH-792: explainer routes through the ui/Tooltip primitive (hover/focus/
  // click) instead of the native `title` attr — title never surfaced on touch
  // devices. aria-label kept so the explainer still reaches screen readers.
  return (
    // MEH-1459: position "bottom-start" (not centered) + the Tooltip primitive's
    // responsive width keep the social-proof strip ("10+ ביקורות…") inside the
    // narrow 2-col mobile card — a centered w-52 bubble was clipped horizontally
    // by the card's overflow-hidden. Recognition-only render (tiers 4/5) is
    // unchanged.
    // MEH-1593: on the card surface ProducerCard passes the badge strip as
    // `avoidRef`, which switches the bubble to overlay mode (portal + fixed).
    // MEH-1459 chose "bottom-start" + a responsive width to stop the bubble
    // being CLIPPED by the card's overflow-hidden — measured 27/07, that did
    // stop the clipping but the bubble still landed ON the card title and
    // rating row (2 intersections at both 375px and 1440px). Overlay clears
    // the whole strip instead. `position` is kept for the non-overlay callers,
    // which are unchanged.
    <Tooltip content={tooltip} position="bottom-start" overlay={Boolean(avoidRef)} avoidRef={avoidRef}>
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
