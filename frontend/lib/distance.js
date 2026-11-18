// @ts-check
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
 * Distance formatter. Two presentations via the `unit` option, both whole
 * kilometres, minimum 1, marked approximate (MEH-3219 / B17, approved string 16):
 *
 *   unit:"latin" (DEFAULT, the English locale): "⁦about {n} km⁩" inside an
 *   LRI…PDI isolate so it stays intact in an RTL line.
 *
 *   unit:"he": "כ-{n} ק\"מ". No isolate chars — MapProducerCard wraps the
 *   token in <bdi>, ProducerCard relies on bare-RTL digit isolation. Which unit
 *   a card renders is chosen by the active locale at the call site.
 *
 * Before MEH-3219 this printed metres below 1 km and one decimal below 10 km
 * (MEH-1035, MEH-1298). The stored location is now rounded to ~1 km, so that
 * precision would be invented.
 *
 * MEH-1307: the trailing Hebrew " ממך" suffix was dropped from BOTH forms — the
 * label now reads as a bare magnitude with no "from you" tail. Returns null for
 * non-finite/negative inputs so callers can render conditionally.
 * REUSES: BadgeRow.jsx:79 (latin form).
 */
export function formatDistance(km, { unit = "latin" } = {}) {
  if (!Number.isFinite(km) || km < 0) return null;
  // MEH-3219 (B17): the visitor's point is rounded to ~1 km before it is
  // stored, so metres or a tenth of a km would be false precision. Whole km,
  // never below 1, marked as approximate (approved string 16).
  const n = Math.max(1, Math.round(km));
  return unit === "he" ? `כ-${n} ק"מ` : `⁦about ${n} km⁩`;
}
