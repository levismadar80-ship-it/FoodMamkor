import Tooltip from "./Tooltip";

/**
 * Badge — category / quality pill (MEH-602).
 *
 * Module:   Badge
 * Purpose:  Presentational category/quality chip mirroring the shipped BadgeRow
 *           pill VERBATIM. Net-new atom — nothing consumes it yet.
 * Does NOT: fold in trust-tier badges. TrustBadge.jsx (ADR-022) is a SEPARATE
 *           system with its own tier palette — deliberately excluded here.
 * Related:  BadgeRow.jsx:36-41,80 (source of truth), lib/badges.js (data layer,
 *           untouched).
 * History:  MEH-602 (creation); MEH-801 (re-sync to the MEH-730 v4 recolor).
 *
 * Bounded to the category/quality role ONLY. The 3 live "badge" surfaces don't
 * agree; this atom mirrors BadgeRow as-is and does NOT resolve the conflicts
 * (tracked as known-debt in the MEH-602 PR body):
 *   1. variant="secondary" renders identical to "primary" (bg-primary) — there
 *      is no `secondary` color token, so BadgeRow collapses it the same way.
 *   2. (trust) TrustBadge tier-5 carries a raw hex — part of why the trust-tier
 *      system is excluded from this atom rather than folded in.
 *   3. tooltip mechanism differs across the 3 surfaces (BadgeRow click-popover,
 *      TrustBadge native title, ui/Tooltip) — this atom standardizes on
 *      ui/Tooltip.jsx.
 *
 * @example
 * <Badge variant="primary">מאומת</Badge>
 * <Badge variant="muted" size="sm" tooltip="בית העסק מחזיק בתעודת אורגני">אורגני</Badge>
 */

// VERBATIM from BadgeRow.jsx COLOR_CLASSES — mirrored, not re-derived.
// MEH-801: re-synced to the #1075 (MEH-730) v4 recolor — green chips carry
// cream text, gold keeps white (AA — see the BadgeRow comment), neutral
// moves to surface-card + green-700 ink.
const VARIANT_CLASSES = {
  primary: "bg-primary text-background",
  accent: "bg-accent text-white",
  secondary: "bg-primary text-background", // KNOWN DEBT #1 — collapses to primary.
  muted: "bg-surface-card text-green-700 border border-border",
};

const SIZE_CLASSES = {
  md: "text-xs px-2.5 py-0.5", // BadgeRow.jsx:80 shipped size.
  sm: "text-[10px] px-1.5 py-0.5",
};

export default function Badge({
  variant = "muted",
  size = "md",
  tooltip,
  className = "",
  children,
}) {
  const pill = (
    <span
      className={[
        "inline-flex items-center rounded-full font-medium whitespace-nowrap",
        VARIANT_CLASSES[variant] || VARIANT_CLASSES.muted,
        SIZE_CLASSES[size] || SIZE_CLASSES.md,
        className,
      ].join(" ")}
    >
      {children}
    </span>
  );

  return tooltip ? <Tooltip content={tooltip}>{pill}</Tooltip> : pill;
}
