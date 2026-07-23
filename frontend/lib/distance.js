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
 * Distance formatter. Two presentations via the `unit` option:
 *
 *   unit:"latin" (DEFAULT — v4 LOCK CARD-18 / MEH-1035, used by ProducerCard +
 *   BadgeRow): Latin unit inside an LRI…PDI (⁦…⁩) isolate:
 *     < 1 km   → "⁦{N} m⁩"    (nearest 50 m)
 *     1–9.9 km → "⁦{x.x} km⁩" (one decimal)
 *     ≥ 10 km  → "⁦{N} km⁩"   (no decimal — false precision, MEH-1298)
 *
 *   unit:"he" (MEH-1243 🔒 §3 — MapProducerCard meta line; MEH-1301 — the Hebrew
 *   ProducerCard distance pill): Hebrew unit 'ק"מ', digits first. No isolate
 *   chars — MapProducerCard wraps the token in <bdi>, ProducerCard relies on
 *   bare-RTL digit isolation (the Latin number self-isolates inside the RTL
 *   span). Which unit a card renders is chosen by the active locale at the call
 *   site (next-intl `useLocale`), not hardcoded here:
 *     < 1 km  → "{N} מ'"   ·   1–9.9 km → "{x.x} ק\"מ"   ·   ≥ 10 km → "{N} ק\"מ"
 *
 * MEH-1307: the trailing Hebrew " ממך" suffix was dropped from BOTH forms — the
 * label now reads as a bare magnitude with no "from you" tail. Returns null for
 * non-finite/negative inputs so callers can render conditionally.
 * REUSES: BadgeRow.jsx:79 (latin form).
 */
export function formatDistance(km, { unit = "latin" } = {}) {
  if (!Number.isFinite(km) || km < 0) return null;

  const he = unit === "he";

  if (km < 1) {
    const meters = Math.round((km * 1000) / 50) * 50;
    if (meters === 0) {
      return he ? `פחות מ-50 מ'` : `פחות מ-50 ⁦m⁩`;
    }
    return he ? `${meters} מ'` : `⁦${meters} m⁩`;
  }

  // MEH-1298: one decimal only below 10 km ("1.2 ק"מ"); ≥ 10 km rounds to a whole
  // number ("38 ק"מ") — a tenth of a km is false precision at that range.
  const val = km < 10 ? km.toFixed(1) : String(Math.round(km));
  return he ? `${val} ק"מ` : `⁦${val} km⁩`;
}
