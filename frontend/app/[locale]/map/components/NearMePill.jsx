"use client";

import { useTranslations } from "next-intl";
import { Crosshair, X } from "@phosphor-icons/react";

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
 * MEH-1194: circular icon button (Crosshair, 44×44) in the bottom-END corner
 * (`end-4`), matching the desktop GPS circle's token set (MapPane.jsx) and the
 * Google/Apple Maps "my location" convention — no wide text pill floating
 * mid-canvas. The bottom-END corner is free on /map because MEH-1180 pathname-
 * gated the chat FAB off this route, so the prior MEH-1135 START-corner
 * placement (chosen only to avoid the FAB) is no longer needed. RTL: `end-4`
 * logical prop only — mirrors correctly in /en.
 *
 * MEH-2506: the pill also NAMES the active distance origin. It used to be a
 * separate full-width row in the mobile filter bar («מרחק מהמיקום שלכם ✕»),
 * which cost the map 54px and read as one more filter (Sapir 28/10). The pill
 * is what sets the origin, so it is where the origin is shown and cleared —
 * Google Maps' "your location" chip. With no origin it is the bare 44px circle,
 * unchanged. With one, a chip grows from the circle toward the inline-start:
 * label (same `sort-origin-label` testid) + ✕ (`clear-user-location`, the
 * existing clear_location name). While a city is being located the chip shows
 * the locating_city status instead, with no ✕. No new copy.
 */
export default function NearMePill({ onClick, originLabel = null, originPending = false, onClearOrigin }) {
  const t = useTranslations();
  const hasChip = originPending || !!originLabel;
  return (
    <div
      // MEH-970 R2: `bottom` rides the sheet edge (--map-sheet-h) and animates in
      // lockstep with the sheet via --map-sheet-anim (0ms drag / 300ms snap,
      // published by MapBottomSheet); fallbacks make it inert (0ms) before the
      // sheet mounts and publishes the vars. MEH-2506 moved the positioning from
      // the button onto this wrapper so the origin chip rides with it.
      // globals.css `[data-origin-chip] .leaflet-control-attribution` lifts the
      // map credit by this +12px plus the pill's 46px height — change one, change both.
      style={{
        bottom: "calc(var(--map-sheet-h, 14vh) + 12px)",
        transitionProperty: "bottom",
        transitionDuration: "var(--map-sheet-anim, 0ms)",
        transitionTimingFunction: "cubic-bezier(0.32,0.72,0,1)",
      }}
      data-testid="map-near-me"
      // With no origin the wrapper is bare and the button keeps its own border
      // + background, so the default circle renders exactly as before (44px).
      // With an origin the wrapper carries them and the button goes borderless,
      // so chip + circle read as one pill.
      className={`lg:hidden absolute end-4 z-[1000] flex items-center max-w-[calc(100vw-2rem)] rounded-full ${
        hasChip ? "bg-background border border-border shadow-sm" : ""
      }`}
    >
      {hasChip && (
        <div data-testid="sort-origin" className="flex min-w-0 items-center ps-3 text-xs text-fg-muted">
          {originPending ? (
            <span role="status" className="min-w-0 truncate pe-2">
              {t("map.client.sort.locating_city")}
            </span>
          ) : (
            <>
              <span className="min-w-0 truncate" data-testid="sort-origin-label">
                {originLabel}
              </span>
              <button
                type="button"
                onClick={onClearOrigin}
                data-testid="clear-user-location"
                aria-label={t("map.client.sort.clear_location")}
                title={t("map.client.sort.clear_location")}
                className="inline-flex shrink-0 items-center justify-center w-11 h-11 rounded-full text-fg-muted hover:text-primary focus-ring"
              >
                <X size={14} weight="bold" aria-hidden="true" />
              </button>
            </>
          )}
        </div>
      )}
      <button
        type="button"
        onClick={onClick}
        data-testid="map-near-me-pill"
        aria-label={t("map.near_me_pill.aria")}
        // MEH-1194: circular icon button in the map's bottom-END corner — same
        // token set as the desktop GPS circle (MapPane.jsx: w-11 h-11 rounded-full,
        // hover, focus ring), Crosshair glyph, no text label.
        className={`shrink-0 w-11 h-11 rounded-full flex items-center justify-center text-primary hover:bg-green-50 transition-colors focus-visible:ring-2 focus-visible:ring-primary/40 ${
          hasChip ? "" : "bg-background border border-border"
        }`}
      >
        <Crosshair size={20} weight="bold" aria-hidden="true" />
      </button>
    </div>
  );
}
