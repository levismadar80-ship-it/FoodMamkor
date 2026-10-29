/**
 * Module:   event-when
 * Purpose:  How close an event's date is to today in Israel — the «היום» /
 *           «מחר» / «השבוע» chip beside the date, and whether the event is
 *           already over (MEH-2548).
 * Touches:  Nothing — pure date arithmetic on `YYYY-MM-DD` strings.
 * Related:  lib/israel-date.js (`israelToday`, the clock this compares with).
 */
import { israelToday } from "@/lib/israel-date";

const DAY_MS = 86_400_000;

/** Whole calendar days from `today` to `date` (both `YYYY-MM-DD`). */
function daysUntil(date, today = israelToday()) {
  const a = Date.parse(`${String(date).slice(0, 10)}T00:00:00Z`);
  const b = Date.parse(`${String(today).slice(0, 10)}T00:00:00Z`);
  if (Number.isNaN(a) || Number.isNaN(b)) return null;
  return Math.round((a - b) / DAY_MS);
}

/**
 * "past" | "today" | "tomorrow" | "this_week" | null.
 * "this_week" = the next 2–6 days (a rolling week, as Eventbrite's «this
 * week» filter reads), not the calendar week — no Sunday/Monday ambiguity.
 */
export function eventWhen(date, today = israelToday()) {
  const d = daysUntil(date, today);
  if (d === null) return null;
  if (d < 0) return "past";
  if (d === 0) return "today";
  if (d === 1) return "tomorrow";
  if (d <= 6) return "this_week";
  return null;
}

/** Waze / Google Maps links built from a text address, for an event or
 *  experience with no map point (MiniMap builds them from coords only). */
export function addressNavLinks(...parts) {
  const q = parts.map((p) => (p || "").trim()).filter(Boolean).join(", ");
  if (!q) return null;
  const e = encodeURIComponent(q);
  return {
    waze: `https://waze.com/ul?q=${e}&navigate=yes`,
    google: `https://www.google.com/maps/search/?api=1&query=${e}`,
  };
}
