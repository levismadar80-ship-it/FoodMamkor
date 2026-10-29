/**
 * The backend stores timestamps as naive UTC and serialises them WITHOUT a zone
 * ("2027-03-31T20:59:59.999999"). `new Date()` reads such a string as the
 * viewer's LOCAL time, which moves an instant by the viewer's UTC offset —
 * a kashrut certificate then read as expired ~3h early in Israel and ~4h late
 * in New York (MEH-2518 review). Parse through here instead.
 *
 * A string that already carries a zone (Z / ±HH:MM) or is a bare date is passed
 * through unchanged. Returns null for anything unparseable.
 */
export function parseNaiveUtc(value) {
  if (typeof value !== "string") return null;
  const hasZone = /(?:Z|[+-]\d{2}:?\d{2})$/.test(value);
  const d = new Date(hasZone || !value.includes("T") ? value : `${value}Z`);
  return Number.isNaN(d.getTime()) ? null : d;
}
