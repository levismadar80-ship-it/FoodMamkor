/**
 * Distance helpers (MEH-12). JS port of the Haversine formula that the
 * backend uses in raw SQL on producers.lat/lng (see CLAUDE.md "no
 * PostGIS" decision). Pure functions — no React, no DOM, no I/O.
 */

const EARTH_RADIUS_KM = 6371;

function toRad(deg) {
  return (deg * Math.PI) / 180;
}

/**
 * Great-circle distance between two lat/lng points in kilometers.
 * Returns NaN if any coordinate is null/undefined or non-numeric so
 * callers can guard with Number.isFinite() before formatting.
 */
export function haversineKm(lat1, lng1, lat2, lng2) {
  if (
    lat1 == null ||
    lng1 == null ||
    lat2 == null ||
    lng2 == null ||
    Number.isNaN(Number(lat1)) ||
    Number.isNaN(Number(lng1)) ||
    Number.isNaN(Number(lat2)) ||
    Number.isNaN(Number(lng2))
  ) {
    return NaN;
  }

  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) *
      Math.cos(toRad(lat2)) *
      Math.sin(dLng / 2) ** 2;
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return EARTH_RADIUS_KM * c;
}

/**
 * Hebrew formatter for distance:
 *   < 1 km  → "{N} מ' ממך"     (rounded to nearest 50 m)
 *   1–99 km → "{x.x} ק"מ ממך"  (one decimal)
 *   ≥ 100 km → "{N} ק"מ ממך"    (no decimal — false precision)
 *
 * Returns null for non-finite inputs so callers can render conditionally.
 */
export function formatDistance(km) {
  if (!Number.isFinite(km) || km < 0) return null;

  if (km < 1) {
    const meters = Math.round((km * 1000) / 50) * 50;
    if (meters === 0) return "פחות מ-50 מ' ממך";
    return `${meters} מ' ממך`;
  }

  if (km < 100) {
    return `${km.toFixed(1)} ק"מ ממך`;
  }

  return `${Math.round(km)} ק"מ ממך`;
}
