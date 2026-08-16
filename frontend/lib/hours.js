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

// MEH-1870: within a day group, extra ranges are separated by a SPACE:
//   "Sun-Thu 09:00-18:00, Fri 09:00-13:00 16:00-19:00"
// The comma still separates day groups. One range per day stays exactly the
// string it always was, so every value already in the database re-parses
// unchanged — the grammar is extended, not replaced.
//
// `RANGE` is the single-range atom; `ENTRY` is a day label followed by one or
// more of them. Anchored, so a malformed tail still makes the whole entry fail
// rather than silently parsing a prefix.
const RANGE = String.raw`\d{2}:\d{2}-\d{2}:\d{2}`;
const ENTRY_RE = new RegExp(
  String.raw`^([A-Za-z]+)(?:-([A-Za-z]+))?\s+(${RANGE}(?:\s+${RANGE})*)$`,
);

/**
 * Parse "Sun-Thu 09:00-18:00, Fri 09:00-13:00 16:00-19:00" into a map of
 * dayIndex → [{ open: "09:00", close: "18:00" }, …] (closed days simply
 * absent). Closed BETWEEN two ranges of the same day is a real state — that is
 * the lunch break this grammar exists for.
 *
 * MEH-1870: values are LISTS. A legacy single-range day yields a one-element
 * list, so flattening this output reproduces the pre-1870 map exactly.
 */
export function parseHours(raw) {
  if (!raw) return null;
  const map = {};
  const entries = raw.split(",").map((s) => s.trim()).filter(Boolean);

  for (const entry of entries) {
    const match = entry.match(ENTRY_RE);
    if (!match) continue;
    const [, startDay, endDay, rangesPart] = match;
    const startIdx = DAY_ABBR.findIndex((d) => d.toLowerCase() === startDay.toLowerCase());
    if (startIdx === -1) continue;
    const endIdx = endDay
      ? DAY_ABBR.findIndex((d) => d.toLowerCase() === endDay.toLowerCase())
      : startIdx;
    if (endIdx === -1) continue;
    const ranges = rangesPart.split(/\s+/).map((r) => {
      const [open, close] = r.split("-");
      return { open, close };
    });
    // Handle week wrap (e.g. Thu-Sun would be odd but guard it)
    const indices = endIdx >= startIdx
      ? Array.from({ length: endIdx - startIdx + 1 }, (_, i) => startIdx + i)
      : [startIdx];
    // A later entry for the same day still REPLACES an earlier one, exactly as
    // before — this grammar has no notion of accumulating across groups.
    for (const i of indices) map[i] = ranges.map((r) => ({ ...r }));
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

  // MEH-1870: a day holds a LIST of ranges, so "am I open?" is a scan. Ranges
  // are emitted in source order; sort defensively so a hand-edited string with
  // them out of order still yields the earliest upcoming opening.
  const todayRanges = [...(map[dayIdx] ?? [])].sort(
    (a, b) => toMinutes(a.open) - toMinutes(b.open),
  );
  const current = todayRanges.find(
    (r) => nowMin >= toMinutes(r.open) && nowMin < toMinutes(r.close),
  );
  if (current) {
    return { isOpen: true, openTime: current.open, closeTime: current.close };
  }

  // Still closed — but the next opening may be LATER TODAY, after a break.
  // Reporting tomorrow here would be wrong for every split-hours business.
  const laterToday = todayRanges.find((r) => nowMin < toMinutes(r.open));
  if (laterToday) {
    return {
      isOpen: false,
      nextDayKey: DAY_KEYS[dayIdx],
      nextTime: laterToday.open,
      nextIsTomorrow: false,
    };
  }

  // Find next open slot
  for (let d = 1; d <= 7; d++) {
    const nextIdx = (dayIdx + d) % 7;
    const ranges = map[nextIdx];
    if (ranges?.length) {
      const first = [...ranges].sort((a, b) => toMinutes(a.open) - toMinutes(b.open))[0];
      return {
        isOpen: false,
        nextDayKey: DAY_KEYS[nextIdx],
        nextTime: first.open,
        nextIsTomorrow: d === 1,
      };
    }
  }
  return { isOpen: false };
}
