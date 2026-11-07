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
 *           card can share the parser instead of duplicating it);
 *           MEH-2142 (added resolveStoreHours — the one place that decides
 *           WHICH hours string a consumer surface reads);
 *           MEH-2383 (computeStatus reads the Israel clock through
 *           lib/orderWindow.js `israelNowParts` and takes an injectable `now`);
 *           MEH-2803 (parseHours also reads owner-typed Hebrew — «א'-ה' 7:00-14:00»
 *           — and sameWeeklyHours decides when two sets are one fact).
 */

import { israelNowParts } from "@/lib/orderWindow";

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

// MEH-2803: the Hebrew owner grammar. The location form invites free Hebrew
// text (MEH-2604) and the demo business stores «א'-ה' 07:00-14:00, ו' 06:30-13:00».
//   day   = one letter א ב ג ד ה ו ש, then ' or ׳ or nothing
//   span  = day [- or –] day
//   time  = H:MM or HH:MM;  range = time [- or –] time;  ranges space-separated
//   groups split by comma (the English grammar's separator)
// Output is the English map shape exactly — times zero-padded to HH:MM.
// Code points, not glyphs: this is grammar, not copy, and HebrewLiteralRatchet
// (MEH-1687) keeps Hebrew string literals out of code. Index = Sun..Sat.
// U+05D0 alef … U+05D5 vav, U+05E9 shin; U+05F3 is the Hebrew geresh.
// eslint-disable-next-line no-magic-numbers -- the seven code points ARE the data
const HE_DAY_LETTERS = String.fromCharCode(0x5d0, 0x5d1, 0x5d2, 0x5d3, 0x5d4, 0x5d5, 0x5e9);
// Geresh U+05F3, plus the typographic ’ U+2019 phone keyboards substitute for '.
// Both sit inside a regex character class below — never add "]" or "\\" here.
const HE_GERESH = String.fromCharCode(0x5f3, 0x2019); // eslint-disable-line no-magic-numbers
const HE_DAY_INDEX = Object.fromEntries([...HE_DAY_LETTERS].map((letter, i) => [letter, i]));
const HE_DAY = `([${HE_DAY_LETTERS}])['${HE_GERESH}]?`;
const HE_RANGE = String.raw`\d{1,2}:\d{2}\s*[-–]\s*\d{1,2}:\d{2}`;
const HE_ENTRY_RE = new RegExp(
  String.raw`^${HE_DAY}(?:\s*[-–]\s*${HE_DAY})?\s+(${HE_RANGE}(?:\s+${HE_RANGE})*)$`,
);
const HE_RANGE_RE = /(\d{1,2}):(\d{2})\s*[-–]\s*(\d{1,2}):(\d{2})/g;
const HEBREW_LETTER_RE = /[\u05D0-\u05EA]/;
const MAX_HOUR = 24;
const MINUTES_PER_HOUR = 60;

const pad2 = (n) => String(n).padStart(2, "0");

/** One Hebrew group → { indices, ranges }, or null when it is not readable. */
function parseHebrewEntry(entry) {
  const match = entry.match(HE_ENTRY_RE);
  if (!match) return null;
  const [, startLetter, endLetter, rangesPart] = match;
  const startIdx = HE_DAY_INDEX[startLetter];
  const endIdx = endLetter ? HE_DAY_INDEX[endLetter] : startIdx;
  const ranges = [];
  for (const [, oh, om, ch, cm] of rangesPart.matchAll(HE_RANGE_RE)) {
    // 24:00 is a valid close ("until midnight"); 24:30 is not a time.
    const outOfDay = (h, m) => Number(h) > MAX_HOUR || (Number(h) === MAX_HOUR && Number(m) > 0);
    const bad = outOfDay(oh, om) || outOfDay(ch, cm) || [om, cm].some((m) => Number(m) >= MINUTES_PER_HOUR);
    // Closing at or before opening (an overnight «22:00-02:00») is not a range
    // this map can hold — shown as typed rather than as a wrong range.
    const backwards = Number(ch) * MINUTES_PER_HOUR + Number(cm) <= Number(oh) * MINUTES_PER_HOUR + Number(om);
    if (bad || backwards) return null;
    ranges.push({ open: `${pad2(oh)}:${om}`, close: `${pad2(ch)}:${cm}` });
  }
  // A reversed span («ו'-א'») wraps the week; reading it as its start day only
  // (the English branch's guard) would show confident, wrong hours. Strict: raw.
  if (endIdx < startIdx) return null;
  const indices = Array.from({ length: endIdx - startIdx + 1 }, (_, i) => startIdx + i);
  return { indices, ranges };
}

/**
 * Strict on Hebrew, unlike the English per-entry skip below: an owner who
 * wrote «א'-ה' 9:00-17:00, ו' בתיאום» must not have Friday silently shown as
 * closed. One unreadable group → null → the whole string renders as typed
 * (OpeningHours' MEH-2604 raw fallback).
 */
function parseHebrewHours(entries) {
  const map = {};
  for (const entry of entries) {
    const parsed = parseHebrewEntry(entry);
    if (!parsed) return null;
    for (const i of parsed.indices) map[i] = parsed.ranges.map((r) => ({ ...r }));
  }
  return Object.keys(map).length > 0 ? map : null;
}

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
  // MEH-2803: a string with Hebrew letters in it is read by the Hebrew grammar.
  if (HEBREW_LETTER_RE.test(raw)) return parseHebrewHours(entries);

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

/**
 * MEH-2803 — are two parsed weekly maps (dayIndex → [{open, close}]) the same
 * fact? Same open days, same ranges, compared in minutes and in time order, so
 * «7:00» and «07:00», or two ranges typed in either order, still match. Either
 * side null (unparseable or absent) → false: an unreadable set is never merged.
 */
export function sameWeeklyHours(a, b) {
  if (!a || !b) return false;
  const key = (map, day) =>
    (map[day] ?? [])
      .map((r) => `${toMinutes(r.open)}-${toMinutes(r.close)}`)
      .sort()
      .join(",");
  return DAY_ABBR.every((_, day) => key(a, day) === key(b, day));
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
// `now` is injectable (MEH-2383) so a boundary case is a plain argument, not a
// fake-timers setup; production callers pass nothing.
export function computeStatus(map, now = new Date()) {
  // MEH-2383: the Israel-local weekday + wall-clock come from the one owner,
  // lib/orderWindow.js `israelNowParts` (Intl formatToParts — portable, unlike
  // the toLocaleString re-parse MEH-845 removed). This function used to carry
  // a line-for-line private copy; israel-clock-guard.sh flagged it.
  const { dayIndex: dayIdx, minutes: nowMin } = israelNowParts(now);
  // Same guard as orderWindow.js / order-status.js `israelDayKey`: an ICU
  // weekday abbreviation that matches nothing is "unknown", not Saturday-1.
  if (dayIdx < 0) return { isOpen: false };

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


/**
 * MEH-2142 (MEH-1938 batch B3) — the single answer to "which store-hours
 * string does a consumer surface show?".
 *
 * Store hours are becoming a PER-LOCATION fact. The owner edits
 * `ProducerLocation.opening_hours` in LocationsEditor; the business-level
 * `Producer.opening_hours` editor was removed from the dashboard in this
 * change and its owner write path closed. The column stays as a fallback for
 * every business that filled it in before the switch, which is a readers-first
 * Parallel Change (Fowler): the readers move now, the column is removed later.
 *
 * The primary location wins when it has hours; otherwise the legacy column;
 * otherwise nothing. It never merges the two — half a week from one row and
 * half from another would be worse than either, and unreadable to the owner
 * who is trying to work out where to edit.
 *
 * LEGACY(2026-11-30, MEH-1938) — the `producer.opening_hours` arm below is the
 * Expand-phase overlap. Deleting it is the contract step: by then every
 * business's hours live on her primary location row, and this function reduces
 * to reading that row. The date is enforced by
 * scripts/checks/legacy-expiry-check.sh, so it cannot quietly become permanent.
 *
 * Deliberately does NOT touch a non-primary row's own `opening_hours`. Pickup
 * points and market stands render their individual hours in DeliveryBlock and
 * MiniMap (MEH-1509) and are unaffected — this answers only "when is the shop
 * itself open", which is a property of the main location.
 *
 * @param {object} producer - a serialized producer; `locations[]` optional.
 * @returns {string|null} the hours string to render, or null when there is none.
 */
export function resolveStoreHours(producer) {
  const locations = Array.isArray(producer?.locations) ? producer.locations : [];
  // `find`, not `[0]`: the array is ordered by the API for display, and
  // relying on position here would make this correct by coincidence.
  const primary = locations.find((loc) => loc?.is_primary);
  const fromPrimary = primary?.opening_hours;
  if (typeof fromPrimary === "string" && fromPrimary.trim()) return fromPrimary;

  // LEGACY(2026-11-30, MEH-1938) — see the note above.
  const legacy = producer?.opening_hours;
  if (typeof legacy === "string" && legacy.trim()) return legacy;

  return null;
}
