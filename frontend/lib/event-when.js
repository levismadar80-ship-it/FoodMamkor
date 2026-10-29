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
 * "this_week" = later in the same Israeli calendar week (Sunday–Saturday),
 * from the day after tomorrow — what «השבוע» means to a Hebrew reader. On a
 * Thursday, next Tuesday is not «השבוע» (review #3813).
 */
export function eventWhen(date, today = israelToday()) {
  const d = daysUntil(date, today);
  if (d === null) return null;
  if (d < 0) return "past";
  if (d === 0) return "today";
  if (d === 1) return "tomorrow";
  const dow = new Date(`${String(today).slice(0, 10)}T00:00:00Z`).getUTCDay(); // 0 = Sunday
  if (dow + d <= 6) return "this_week";
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
