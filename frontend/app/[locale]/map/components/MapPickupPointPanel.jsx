// @ts-check
"use client";

/**
 * Module:   MapPickupPointPanel
 * Purpose:  MEH-3756 — under the picked-business card on the phone map, when
 *           the tapped pin is a pickup point or a market stand: when and how to
 *           collect there (its hours, pickup days, next pickup, «הוראות
 *           איסוף»), Waze / Google Maps to the point, and a plain «לדף בית
 *           העסק» button.
 * Does NOT: render the business card (MapProducerCard.jsx, central, untouched)
 *           or decide when it is shown (MobileSheetSelectedCard.jsx). Does not
 *           compute the days or the next date (components/PickupSchedule.jsx),
 *           or build a nav URL (lib/nav-links.js).
 * States:   a point with nothing set → only the nav links and the button. An
 *           approximate point → no nav links (its pin is not where she
 *           collects) and no note (the API withholds it, MEH-3593).
 * Related:  components/DeliveryBlock.jsx PickupRow (the same point on the
 *           business page), components/NavAppGlyphs.jsx AddressNavLinks.
 * History:  MEH-3756 (creation).
 */

import { useTranslations } from "next-intl";

import { Link } from "@/i18n/navigation";
import { AddressNavLinks } from "@/components/NavAppGlyphs";
import PickupSchedule from "@/components/PickupSchedule";
import { MAP_REFERRER } from "@/lib/map-view-state";
import { coordsNavLinks } from "@/lib/nav-links";
import { producerPath } from "@/lib/producer-path";

const SECONDARY_KINDS = new Set(["pickup", "market_stand"]);

/** True when the tapped location is a pickup point or a market stand. */
export function isPickupPoint(/** @type {any} */ location) {
  return Boolean(location && SECONDARY_KINDS.has(location.kind));
}

/** @param {{ producer: any, location: any }} props */
export default function MapPickupPointPanel({ producer, location }) {
  const tr = useTranslations("map.producer_card");
  if (!isPickupPoint(location)) return null;
  // `precision` missing = an old row, which the API serialises as exact.
  const exact = (location.precision ?? "exact") === "exact";
  const navLinks = exact ? coordsNavLinks(location.lat, location.lng) : null;
  const path = producerPath(producer);
  const hours = location.opening_hours || "";
  return (
    <div className="border-t border-border pt-3" data-testid="map-pickup-panel">
      <div className="px-4 pb-2 space-y-1">
        <PickupSchedule loc={location} producer={producer} hours={hours || null} hoursText={hours} />
        {location.pickup_note && (
          <p className="text-xs text-fg-muted" data-testid="map-pickup-note">{location.pickup_note}</p>
        )}
      </div>
      {navLinks && <AddressNavLinks links={navLinks} testId="map-pickup-nav" />}
      {path && (
        <div className="px-4 pb-3">
          <Link
            href={`${path}?from=${MAP_REFERRER}`}
            className="flex items-center justify-center min-h-touch rounded-full border border-action-primary text-sm font-semibold text-action-primary hover:bg-primary/5 focus-ring"
            data-testid="map-pickup-business-link"
          >
            {tr("business_page")}
          </Link>
        </div>
      )}
    </div>
  );
}
