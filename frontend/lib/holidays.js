/**
 * MEH-55: Israel food holiday calendar.
 * Holidays include advance window (7 days before) and active period.
 * Used by: HolidayBanner (homepage), producer dashboard hint.
 *
 * MEH-1988: "today" comes from lib/israel-date, not the browser clock — see
 * todayMs below. Do NOT reintroduce a local date primitive here.
 *
 * MEH-3017: dates are COMPUTED from the Hebrew calendar (lib/hebrew-holidays),
 * for whichever year is in force — no yearly roll. They used to be a
 * hand-typed 5787 table (MEH-2263) that had to be rolled every spring.
 * Convention: `start` = the eve (erev), `end` = the last festival day, both
 * inclusive. This file is the ONLY holiday source: chips, banners and the
 * dashboard hint import from here (MEH-1889 B) — never a second static list.
 *
 * MEH-2741: each holiday's words (name, tagline, cta, dashboard_hint) live in
 * messages/{he,en}.json under `holidays.<key>`. `searchParams.q` stays Hebrew on
 * purpose — it searches product names the businesses write in Hebrew.
 *
 * MEH-1687 D: `icon` names a Phosphor glyph rendered by components/HolidayIcon
 * (the holiday → icon table lives there). No emoji here — Emoji LOCK.
 */
import { israelToday } from "@/lib/israel-date";
import { holidayDatesOn } from "@/lib/hebrew-holidays";

// MEH-3017: everything here except the dates. The dates come from
// lib/hebrew-holidays.js, computed from the Hebrew calendar for the year in
// force — nobody types next year's table. Key order = calendar order.
const HOLIDAY_META = {
  rosh_hashana: { icon: "Jar", searchParams: { q: "דבש" }, color: "#B45309" },
  sukkot: { icon: "Leaf", searchParams: { q: "פירות" }, color: "#15803D" },
  chanuka: { icon: "Flame", searchParams: { q: "שמן זית" }, color: "#1D4ED8" },
  tu_bishvat: { icon: "Tree", searchParams: { q: "דבש" }, color: "#15803D" },
  pesach: { icon: "Sparkle", searchParams: { q: "כשר לפסח" }, color: "#B45309" }, // amber-700
  shavuot: { icon: "Cheese", searchParams: { q: "גבינות" }, color: "#1D4ED8" }, // blue-700
};

/**
 * The holiday table in force on an Israel day ("YYYY-MM-DD"): the six
 * holidays of the current Hebrew year until its Shavuot is over, then the
 * next year's. Same shape the hand-typed table had: { key: { icon, start,
 * end, searchParams, color } }. Empty when the runtime has no Hebrew calendar.
 */
export function holidaysOn(isoDay = israelToday()) {
  const dates = holidayDatesOn(isoDay);
  const out = {};
  for (const [key, meta] of Object.entries(HOLIDAY_META)) {
    if (dates[key]) out[key] = { ...meta, ...dates[key] };
  }
  return out;
}

// Keys, icons and colours only — NO dates, and no computation at import (a
// date snapshot taken at import goes stale across Shavuot, and costs a cold
// scan on every page load). Anything that needs dates calls holidaysOn(day).
export const HOLIDAYS = HOLIDAY_META;

const BANNER_ADVANCE_DAYS = 7;
const DASHBOARD_ADVANCE_DAYS = 14;

function parseLocalDate(dateStr) {
  const [y, m, d] = dateStr.split("-").map(Number);
  return new Date(y, m - 1, d);
}

// MEH-1988: "today" is the Israel calendar day, not the browser's.
//
// The holiday windows below are Israeli dates, so a viewer in a timezone whose
// calendar day differs from Israel's saw a banner appear or disappear up to a
// day off. Not the MEH-1983 defect — nothing here is compared against the
// server, so it could never offer a date the backend rejects — consistency
// rather than correctness, which is why this is a small change and not a fix.
//
// Routed through `parseLocalDate` ON PURPOSE: it is the same constructor the
// holiday `start`/`end` go through two lines below, so both sides of every
// comparison are built identically and only WHICH day counts as today moves.
// Reading `israelToday()` into a Date some other way would put the two sides
// on different constructions, which is a subtler bug than the one being fixed.
function todayMs(ref = new Date()) {
  return parseLocalDate(israelToday(ref)).getTime();
}

/**
 * Returns the active or upcoming holiday for the given date.
 * Pass overrideKey to force a specific holiday (admin testing).
 */
export function getActiveHoliday(overrideKey = null, today = new Date()) {
  const table = holidaysOn(israelToday(today));
  if (overrideKey && table[overrideKey]) {
    return { ...table[overrideKey], key: overrideKey, upcoming: false };
  }

  const now = todayMs(today);
  const advance = BANNER_ADVANCE_DAYS * 86400000;

  for (const [key, holiday] of Object.entries(table)) {
    const start = parseLocalDate(holiday.start).getTime();
    const end = parseLocalDate(holiday.end).getTime() + 86400000; // inclusive
    if (now >= start - advance && now < end) {
      return { ...holiday, key, upcoming: now < start };
    }
  }
  return null;
}

/**
 * Returns the next upcoming holiday within advanceDays, for the dashboard hint.
 * Also returns daysUntil (negative = already active).
 */
export function getUpcomingHoliday(advanceDays = DASHBOARD_ADVANCE_DAYS, today = new Date()) {
  const now = todayMs(today);
  const advance = advanceDays * 86400000;

  for (const [key, holiday] of Object.entries(holidaysOn(israelToday(today)))) {
    const start = parseLocalDate(holiday.start).getTime();
    const end = parseLocalDate(holiday.end).getTime() + 86400000;
    if (now >= start - advance && now < end) {
      const daysUntil = Math.ceil((start - now) / 86400000);
      return { ...holiday, key, upcoming: now < start, daysUntil };
    }
  }
  return null;
}
