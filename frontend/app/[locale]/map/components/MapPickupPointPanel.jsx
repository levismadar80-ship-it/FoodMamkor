// @ts-check
"use client";

/**
 * Module:   MapPickupPointPanel
 * Purpose:  The action panel under the picked-business card on the phone map,
 *           for EVERY pin (one card for all pins, Sapir 25/11 — Google Maps /
 *           Apple Maps give every place the same card with directions):
 *           Waze / Google Maps to the point when it is exact, and a plain «לדף
 *           בית העסק» button. When the tapped pin is a pickup point or a market
 *           stand it also says when and how to collect there (its hours, pickup
 *           days, next pickup, «הוראות איסוף») — MEH-3756.
 * Does NOT: render the business card (MapProducerCard.jsx, central, untouched)
 *           or decide when it is shown (MobileSheetSelectedCard.jsx). Does not
 *           compute the days or the next date (components/PickupSchedule.jsx),
 *           or build a nav URL (lib/nav-links.js). No phone / WhatsApp: contact
 *           stays on the profile (MEH-1243).
 * States:   no tapped location (picked from the list) → the business's first
 *           non-secondary point, else its first point; no usable point → only
 *           the button. An approximate point → no nav links (its pin is not
 *           where she goes) and no note (the API withholds it, MEH-3593). A
 *           pickup point with nothing set → only the nav links and the button.
 * Related:  components/DeliveryBlock.jsx PickupRow (the same point on the
 *           business page), components/NavAppGlyphs.jsx AddressNavLinks.
 * History:  MEH-3756 (creation, pickup points only); every pin (Sapir 25/11).
 */

import { useTranslations } from "next-intl";

import { Link } from "@/i18n/navigation";
import { AddressNavLinks } from "@/components/NavAppGlyphs";
import PickupSchedule from "@/components/PickupSchedule";
import { MAP_REFERRER } from "@/lib/map-view-state";
import { coordsNavLinks } from "@/lib/nav-links";
import { producerPath } from "@/lib/producer-path";
import { producerPoints } from "@/lib/producer-points";

const SECONDARY_KINDS = new Set(["pickup", "market_stand"]);

/** True when the tapped location is a pickup point or a market stand. */
export function isPickupPoint(/** @type {any} */ location) {
  return Boolean(location && SECONDARY_KINDS.has(location.kind));
}

/**
 * The point the panel navigates to: the tapped one, else (a pick from the list)
 * the business's first non-secondary point, else its first point, else null.
 * @param {any} producer @param {any} location
 */
export function panelPoint(producer, location) {
  if (location) return location;
  return (
    producerPoints(producer, { includeSecondary: false })[0]?.location
    ?? producerPoints(producer)[0]?.location
    ?? null
  );
}

/** @param {{ producer: any, location: any }} props */
export default function MapPickupPointPanel({ producer, location }) {
  const tr = useTranslations("map.producer_card");
  const point = panelPoint(producer, location);
  // Pickup details only for a pickup pin she actually tapped.
  const pickup = isPickupPoint(location);
  // `precision` missing = an old row, which the API serialises as exact.
  const exact = Boolean(point) && (point.precision ?? "exact") === "exact";
  const navLinks = exact ? coordsNavLinks(point.lat, point.lng) : null;
  const path = producerPath(producer);
  const hours = pickup ? location.opening_hours || "" : "";
  if (!navLinks && !path) return null;
  return (
    <div className="border-t border-border pt-3" data-testid="map-pickup-panel">
      {pickup && (
        <div className="px-4 pb-2 space-y-1">
          <PickupSchedule loc={location} producer={producer} hours={hours || null} hoursText={hours} />
          {location.pickup_note && (
            <p className="text-xs text-fg-muted" data-testid="map-pickup-note">{location.pickup_note}</p>
          )}
        </div>
      )}
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
