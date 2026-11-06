/**
 * MEH-55: Israel food holiday calendar.
 * Holidays include advance window (7 days before) and active period.
 * Used by: HolidayBanner (homepage), producer dashboard hint.
 *
 * MEH-1988: "today" comes from lib/israel-date, not the browser clock — see
 * todayMs below. Do NOT reintroduce a local date primitive here.
 *
 * MEH-2263: dates are the 5787 calendar (Sep 2026 → Sep 2027), pinned entry by
 * entry in __tests__/holidays.test.js — roll the year there AND here, together.
 * Convention: `start` = the eve (erev), `end` = the last festival day, both
 * inclusive. This file is the ONLY date table: chips, banners and the dashboard
 * hint import from here (MEH-1889 B) — never a second static list.
 *
 * MEH-2741: each holiday's words (name, tagline, cta, dashboard_hint) live in
 * messages/{he,en}.json under `holidays.<key>`. `searchParams.q` stays Hebrew on
 * purpose — it searches product names the businesses write in Hebrew.
 *
 * MEH-1687 D: `icon` names a Phosphor glyph rendered by components/HolidayIcon
 * (the holiday → icon table lives there). No emoji here — Emoji LOCK.
 */
import { israelToday } from "@/lib/israel-date";

export const HOLIDAYS = {
  pesach: {
    icon: "Sparkle",
    start: "2027-04-21",
    end: "2027-04-28",
    searchParams: { q: "כשר לפסח" },
    color: "#B45309", // amber-700
  },
  shavuot: {
    icon: "Cheese",
    start: "2027-06-10",
    end: "2027-06-11",
    searchParams: { q: "גבינות" },
    color: "#1D4ED8", // blue-700
  },
  rosh_hashana: {
    icon: "Jar",
    start: "2026-09-11",
    end: "2026-09-13",
    searchParams: { q: "דבש" },
    color: "#B45309",
  },
  sukkot: {
    icon: "Leaf",
    start: "2026-09-25",
    end: "2026-10-03",
    searchParams: { q: "פירות" },
    color: "#15803D",
  },
  chanuka: {
    icon: "Flame",
    start: "2026-12-05",
    end: "2026-12-12",
    searchParams: { q: "שמן זית" },
    color: "#1D4ED8",
  },
  tu_bishvat: {
    icon: "Tree",
    start: "2027-01-23",
    end: "2027-01-23",
    searchParams: { q: "דבש" },
    color: "#15803D",
  },
};

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
  if (overrideKey && HOLIDAYS[overrideKey]) {
    return { ...HOLIDAYS[overrideKey], key: overrideKey, upcoming: false };
  }

  const now = todayMs(today);
  const advance = BANNER_ADVANCE_DAYS * 86400000;

  for (const [key, holiday] of Object.entries(HOLIDAYS)) {
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

  for (const [key, holiday] of Object.entries(HOLIDAYS)) {
    const start = parseLocalDate(holiday.start).getTime();
    const end = parseLocalDate(holiday.end).getTime() + 86400000;
    if (now >= start - advance && now < end) {
      const daysUntil = Math.ceil((start - now) / 86400000);
      return { ...holiday, key, upcoming: now < start, daysUntil };
    }
  }
  return null;
}
