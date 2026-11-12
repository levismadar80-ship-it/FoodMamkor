/**
 * Module:   nav-links
 * Purpose:  The one place that builds "navigate there" links (Waze + Google
 *           Maps) — from a map point, or from a text address when there is no
 *           point. Every surface that offers navigation calls these.
 * Does NOT: render the buttons (components/NavAppGlyphs.jsx AddressNavLinks,
 *           MiniMap, DeliveryBlock PickupRow do) or decide when to show them.
 * History:  MEH-2592 C (Google beside Waze) · MEH-2548 (address links for
 *           events) · MEH-2994 (three copies → this module; URLs unchanged).
 */

/** Links to a lat/lng point, or null when either coordinate is missing/NaN. */
export function coordsNavLinks(lat, lng) {
  if (lat == null || lng == null || isNaN(Number(lat)) || isNaN(Number(lng))) return null;
  return {
    waze: `https://waze.com/ul?ll=${lat},${lng}&navigate=yes`,
    google: `https://www.google.com/maps/dir/?api=1&destination=${lat},${lng}`,
  };
}

/** Waze / Google Maps links built from a text address, for an event or
 *  experience with no map point. Empty parts are dropped; none left → null. */
export function addressNavLinks(...parts) {
  const q = parts.map((p) => (p || "").trim()).filter(Boolean).join(", ");
  if (!q) return null;
  const e = encodeURIComponent(q);
  return {
    waze: `https://waze.com/ul?q=${e}&navigate=yes`,
    google: `https://www.google.com/maps/search/?api=1&query=${e}`,
  };
}
