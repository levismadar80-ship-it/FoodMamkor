"use client";

import { useTranslations } from "next-intl";
import { Crosshair } from "@phosphor-icons/react";

/**
 * NearMePill — MEH-970 chunk 2-lite.
 *
 * Quiet, persistent "קרוב אליי" affordance for the gateless /map (mobile).
 * Pure presentational button — owns NO geolocation logic. onClick routes to
 * the EXISTING goToMyLocation imperative path in MapClient (single GPS logic
 * path); the empty-near-me guard lives there too.
 *
 * Does NOT: call navigator.geolocation, filter producers, or pan the map —
 * see MapClient.jsx (handleGoToMyLocation). Desktop has its own GPS circle in
 * MapPane.jsx; this pill is mounted inside the mobile (lg:hidden) shell AND
 * carries its own lg:hidden as a belt-and-suspenders gate so it can never
 * render on desktop alongside that circle even if re-mounted elsewhere.
 *
 * Z-index 1000 = controls tier (above bottom-sheet:600), below cookie:1100.
 * MEH-970 R2: anchored to `calc(var(--map-sheet-h) + 12px)` so it RIDES the
 * bottom sheet's live edge through drags and both snaps (Google-Maps pattern:
 * map controls track the sheet's visible height). MapBottomSheet publishes its
 * live height to `--map-sheet-h` (the --cookie-banner-h precedent, MEH-850); the
 * `14vh` fallback == PEEK so the first paint (before the var is set) still clears
 * the collapsed sheet. The prior fixed `bottom-[16vh]` cleared PEEK=14vh but the
 * sheet's HALF=45vh snap rose well past it, floating this pill OVER the cards'
 * WhatsApp button + "פרופיל מלא" (Sapir 12/07 QA, IMG_9351).
 * MEH-1135 corner ownership: this pill sits on the START corner (`start-4`) —
 * the bottom-END corner belongs to the chat FAB (now logical `insetInlineEnd`;
 * convention in .claude/rules/rtl.md). With both elements logical they occupy
 * OPPOSITE corners in every locale (/he: FAB left, near-me right; /en:
 * mirrored), so there is no shared-corner collision. This supersedes the
 * MEH-1133 move to the FAB's corner, which was only needed while the FAB was
 * physical-right. RTL: start-4 / ps / pe logical props only.
 */
export default function NearMePill({ onClick }) {
  const t = useTranslations();
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={t("map.near_me_pill.aria")}
      // MEH-970 R2: `bottom` rides the sheet edge (--map-sheet-h) and animates in
      // lockstep with the sheet via --map-sheet-anim (0ms drag / 300ms snap,
      // published by MapBottomSheet). The explicit transition-property list keeps
      // the hover background fade (replaces the Tailwind `transition` utility,
      // which did not cover `bottom`); fallbacks make it inert (0ms) before the
      // sheet mounts and publishes the vars.
      style={{
        bottom: "calc(var(--map-sheet-h, 14vh) + 12px)",
        transitionProperty: "bottom, background-color",
        transitionDuration: "var(--map-sheet-anim, 0ms), 150ms",
        transitionTimingFunction: "cubic-bezier(0.32,0.72,0,1), ease",
      }}
      className="lg:hidden absolute start-4 z-[1000] flex items-center gap-1.5 rounded-full bg-background border border-border shadow-md ps-3 pe-3.5 py-2 text-sm font-medium text-text hover:bg-green-50 focus-visible:ring-2 focus-visible:ring-primary/40"
    >
      <Crosshair size={16} weight="bold" className="text-primary" aria-hidden="true" />
      {t("map.near_me_pill.label")}
    </button>
  );
}
