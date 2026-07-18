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
 *   unit:"latin" (v4 LOCK CARD-18 / MEH-1035; English locale + BadgeRow): Latin
 *   unit inside an LRI…PDI (⁦…⁩) isolate + a trailing Hebrew "ממך" (RTL, outside
 *   the isolate):
 *     < 1 km  → "⁦{N} m⁩ ממך"    (nearest 50 m)
 *     1–9 km  → "⁦{x.x} km⁩ ממך" (one decimal)
 *     ≥ 10 km → "⁦{N} km⁩ ממך"   (no decimal — false precision)
 *
 *   unit:"he" (MEH-1243 🔒 §3 — MapProducerCard meta line; MEH-1301 — the Hebrew
 *   ProducerCard pill): Hebrew unit 'ק"מ', digits first. With `suffix:false`
 *   (map card) there is NO "ממך" tail; ProducerCard keeps the default " ממך".
 *   No isolate chars — the caller relies on <bdi>/bare-RTL digit isolation:
 *     < 1 km  → "{N} מ'"   ·   1–9 km → "{x.x} ק\"מ"   ·   ≥ 10 km → "{N} ק\"מ"
 *
 * Precision rule (MEH-1301 🔒 18/07 — supersedes the 100 km threshold of
 * MEH-1035 / MEH-1243 §3): < 10 km → one decimal, ≥ 10 km → integer. Applies to
 * both `unit` presentations. Which unit a card renders is chosen by the active
 * locale at the call site (next-intl `useLocale`), not hardcoded here.
 *
 * `suffix:false` drops the " ממך" tail (independent of `unit`). Returns null for
 * non-finite/negative inputs so callers can render conditionally.
 * REUSES: BadgeRow.jsx:79 (latin form).
 */
export function formatDistance(km, { unit = "latin", suffix = true } = {}) {
  if (!Number.isFinite(km) || km < 0) return null;

  const he = unit === "he";
  const sfx = suffix ? " ממך" : "";

  if (km < 1) {
    const meters = Math.round((km * 1000) / 50) * 50;
    if (meters === 0) {
      return he ? `פחות מ-50 מ'${sfx}` : `פחות מ-50 ⁦m⁩${sfx}`;
    }
    return he ? `${meters} מ'${sfx}` : `⁦${meters} m⁩${sfx}`;
  }

  // MEH-1301: < 10 km keeps one decimal; ≥ 10 km rounds to a whole number
  // (avoids "38.3 ק"מ" false precision on the card distance pill).
  const val = km < 10 ? km.toFixed(1) : String(Math.round(km));
  return he ? `${val} ק"מ${sfx}` : `⁦${val} km⁩${sfx}`;
}
