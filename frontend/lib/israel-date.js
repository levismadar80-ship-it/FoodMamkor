/**
 * Module:   israel-date
 * Purpose:  One owner for "what calendar day is it in Israel" on the client,
 *           so a date the UI offers is a date the server will accept.
 * Touches:  Nothing — pure Intl, no I/O, no network.
 * Does NOT: own clock-time decisions (day-of-week / hour-of-day). Those are
 *           `lib/orderWindow.js` (`israelNowParts`) and
 *           `components/OpeningHours.jsx` (`todayIndex`). This module is the
 *           *date* primitive only.
 * Related:  backend/app/utils/clock.py (`israel_today` — the server half of
 *           this same clock), frontend/lib/orderWindow.js:57 (the Intl idiom).
 * History:  MEH-1983 (creation — extracted from components/OfferBadge.jsx so
 *           the two vacation-date pickers stop using the UTC date).
 */

const ISO_DATE_LEN = 10;

/**
 * Today's date in Asia/Jerusalem as `YYYY-MM-DD`.
 *
 * NOT `new Date().toISOString().slice(0, 10)` — that is the *UTC* date, and
 * Israel runs UTC+2/+3, so for the first two-to-three hours of an Israel day
 * UTC is still on yesterday. The backend compares against `israel_today()`
 * (`backend/app/utils/clock.py`), so any client that uses the UTC date will,
 * in that window, offer the owner a date the server then rejects.
 *
 * REUSES: frontend/lib/orderWindow.js:57 — same Asia/Jerusalem Intl idiom.
 *
 * @param {Date} [now] injectable clock, so boundary cases are testable.
 * @returns {string} `YYYY-MM-DD` in Israel local terms.
 */
export function israelToday(now = new Date()) {
  try {
    // formatToParts, not a formatted string: it is separator-agnostic, so an
    // ICU build that renders the locale with "/" cannot silently produce a
    // value that no longer compares against an ISO date.
    const parts = new Intl.DateTimeFormat("en-CA", {
      timeZone: "Asia/Jerusalem",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).formatToParts(now);
    const get = (type) => parts.find((part) => part.type === type)?.value ?? "";
    const [year, month, day] = [get("year"), get("month"), get("day")];
    if (!year || !month || !day) return now.toISOString().slice(0, ISO_DATE_LEN);
    return `${year}-${month}-${day}`;
  } catch {
    // An environment without the Asia/Jerusalem tz database is wrong by at
    // most one day; throwing here would take out the whole form instead.
    return now.toISOString().slice(0, ISO_DATE_LEN);
  }
}
