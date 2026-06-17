/**
 * Module:   hours
 * Purpose:  Parse a producer's `opening_hours` string and compute the
 *           current open/closed status in Asia/Jerusalem time. Pure
 *           functions — no React — so both the full <OpeningHours/> section
 *           (producer detail) and the compact /map card line reuse one parser.
 * Does NOT: render anything (callers own JSX) and does NOT fetch — it only
 *           transforms the `opening_hours` string the API already returns.
 * Related:  frontend/components/OpeningHours.jsx (detail-page consumer),
 *           frontend/components/MapProducerCard.jsx (compact card consumer).
 * History:  MEH-826 Gap2-hours (extracted from OpeningHours.jsx so the map
 *           card can share the parser instead of duplicating it).
 */

// Day name constants. DAY_ABBR (English) is the API axis — used to parse
// backend strings like "Sun-Thu 09:00-18:00". DAY_KEYS maps each index to
// its translation key so display labels follow the active locale.
export const DAY_ABBR = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
export const DAY_KEYS = ["sun", "mon", "tue", "wed", "thu", "fri", "sat"];

// Parse "Sun-Thu 09:00-18:00, Fri 09:00-14:00" into a map of
// dayIndex → { open: "09:00", close: "18:00" } (closed days simply absent).
export function parseHours(raw) {
  if (!raw) return null;
  const map = {};
  const entries = raw.split(",").map((s) => s.trim()).filter(Boolean);

  for (const entry of entries) {
    const match = entry.match(/^([A-Za-z]+)(?:-([A-Za-z]+))?\s+(\d{2}:\d{2})-(\d{2}:\d{2})$/);
    if (!match) continue;
    const [, startDay, endDay, open, close] = match;
    const startIdx = DAY_ABBR.findIndex((d) => d.toLowerCase() === startDay.toLowerCase());
    if (startIdx === -1) continue;
    const endIdx = endDay
      ? DAY_ABBR.findIndex((d) => d.toLowerCase() === endDay.toLowerCase())
      : startIdx;
    if (endIdx === -1) continue;
    // Handle week wrap (e.g. Thu-Sun would be odd but guard it)
    const indices = endIdx >= startIdx
      ? Array.from({ length: endIdx - startIdx + 1 }, (_, i) => startIdx + i)
      : [startIdx];
    for (const i of indices) map[i] = { open, close };
  }
  return Object.keys(map).length > 0 ? map : null;
}

// Convert "HH:MM" string to minutes since midnight.
export function toMinutes(hhmm) {
  const [h, m] = hhmm.split(":").map(Number);
  return h * 60 + m;
}

// Given a parsed map, compute current status in Israel timezone.
// Returns { isOpen, openTime?, closeTime?, nextDayKey?, nextTime?, nextIsTomorrow? }.
// `openTime` (added MEH-826) lets the compact card render "open · HH:MM–HH:MM";
// the detail section ignores it. Day labels resolve at the JSX layer via t().
export function computeStatus(map) {
  const now = new Date();
  // MEH-845: derive Israel-local weekday + wall-clock via Intl parts. The prior
  // `new Date(now.toLocaleString("en-US", { timeZone }))` re-parse relied on an
  // implementation-defined, non-ISO date string — V8 parses it, other engines /
  // SSR contexts can return Invalid Date. formatToParts is portable.
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "Asia/Jerusalem",
    weekday: "short",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).formatToParts(now);
  const part = (type) => parts.find((p) => p.type === type)?.value;
  const dayIdx = DAY_ABBR.indexOf(part("weekday")); // "Sun"…"Sat" → 0…6
  // hour12:false emits "24" for midnight on some engines; normalise to 0.
  const nowMin = (Number(part("hour")) % 24) * 60 + Number(part("minute"));

  const todayHours = map[dayIdx];
  if (todayHours) {
    const openMin = toMinutes(todayHours.open);
    const closeMin = toMinutes(todayHours.close);
    if (nowMin >= openMin && nowMin < closeMin) {
      return { isOpen: true, openTime: todayHours.open, closeTime: todayHours.close };
    }
  }

  // Find next open slot
  for (let d = 1; d <= 7; d++) {
    const nextIdx = (dayIdx + d) % 7;
    if (map[nextIdx]) {
      return {
        isOpen: false,
        nextDayKey: DAY_KEYS[nextIdx],
        nextTime: map[nextIdx].open,
        nextIsTomorrow: d === 1,
      };
    }
  }
  return { isOpen: false };
}
