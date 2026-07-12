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
 * Positioned at bottom-[16vh] to clear the PEEK=14vh collapsed bottom sheet.
 * MEH-1133: moved start-4 → end-4. MEH-1135 then migrated the chat FAB itself
 * to logical `insetInlineEnd` (was physical `right:16`), resolving end-4's
 * LTR-fragility — the FAB and this pill now track the SAME inline-END corner in
 * BOTH locales. The MEH-1135 convention assigns the bottom-end corner to the
 * FAB; the two are offset on the vertical axis (pill bottom-[16vh] · FAB
 * safe-area+88px). RTL: end-4 / ps / pe logical props only.
 */
export default function NearMePill({ onClick }) {
  const t = useTranslations();
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={t("map.near_me_pill.aria")}
      className="lg:hidden absolute bottom-[16vh] end-4 z-[1000] flex items-center gap-1.5 rounded-full bg-background border border-border shadow-md ps-3 pe-3.5 py-2 text-sm font-medium text-text hover:bg-green-50 transition focus-visible:ring-2 focus-visible:ring-primary/40"
    >
      <Crosshair size={16} weight="bold" className="text-primary" aria-hidden="true" />
      {t("map.near_me_pill.label")}
    </button>
  );
}
