// @ts-check
import { israelLocalToUtcStamp } from "./event-ics";
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

/**
 * MEH-3219 B13: a `<input type="datetime-local">` value ("2026-11-20T23:59")
 * typed under a «לפי שעון ישראל» label → the UTC ISO instant it names in
 * Israel. `new Date(value)` read it in the DEVICE's zone instead, so a
 * deadline set from abroad, or on a device whose zone is not Israel, landed
 * hours off. Returns null for anything that is not that shape.
 */
export function israelWallClockToIso(value) {
  const m = /^(\d{4}-\d{2}-\d{2})T(\d{2}:\d{2})/.exec(typeof value === "string" ? value : "");
  if (!m) return null;
  const stamp = israelLocalToUtcStamp(m[1], m[2]);
  const iso = `${stamp.slice(0, 4)}-${stamp.slice(4, 6)}-${stamp.slice(6, 8)}T${stamp.slice(9, 11)}:${stamp.slice(11, 13)}:00.000Z`;
  return iso;
}
