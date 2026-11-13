/**
 * Module:   format-date
 * Purpose:  Locale-aware date formatting for event / experience surfaces.
 *           Single source replacing 4 duplicated formatDate helpers that
 *           hardcoded "he-IL" (so /en/* rendered Hebrew dates — MEH-753).
 * Related:  frontend/app/[locale]/events/EventsClient.jsx,
 *           frontend/app/[locale]/events/[id]/EventDetailClient.jsx,
 *           frontend/components/HomeProductCard.jsx
 * Does NOT: handle time-of-day — callers keep their own HH:MM string
 *           slice (locale-independent), and number/price formatting stays
 *           at the call site.
 * History:  MEH-753 (creation)
 */

// next-intl locale ("he" | "en") → BCP-47 tag for Intl.toLocaleDateString.
// "he" MUST resolve to "he-IL" so existing /he date output stays
// byte-identical; only the en surfaces change (they were Hebrew before).
const LOCALE_TAG = { he: "he-IL", en: "en-US" };

// Default = the event-card signature EventsClient renders for both events
// and experiences (one EntryRow since the route-as-tab merge).
const DEFAULT_OPTIONS = { weekday: "long", day: "numeric", month: "long" };

/**
 * Format an ISO date string in the active locale.
 * @param {string} iso - ISO date string (or empty/nullish → "").
 * @param {string} locale - next-intl locale from useLocale() ("he" | "en").
 * @param {Intl.DateTimeFormatOptions} [options] - defaults to weekday/day/month long.
 * @returns {string}
 */
export function formatEventDate(iso, locale, options = DEFAULT_OPTIONS) {
  if (!iso) return "";
  try {
    const d = new Date(iso);
    // HOT-018 (MEH-782): a malformed-but-non-empty string yields an Invalid
    // Date, whose toLocaleDateString returns the literal "Invalid Date" (it
    // does not throw). Guard it so callers render nothing instead of garbage.
    if (Number.isNaN(d.getTime())) return "";
    return d.toLocaleDateString(LOCALE_TAG[locale] ?? "he-IL", options);
  } catch {
    return iso;
  }
}

// MEH-3060: every displayed date goes through formatDate — one Israel-time
// reading, one Invalid-Date guard, one locale mapping. Styles:
//   numeric  → 05.11.2026      (admin tables, dashboards, expiry lines)
//   dayMonth → 5 בנובמבר        (vacation return, special opening days)
//   long     → יום חמישי, 5 בנובמבר (event signature)
const STYLES = {
  numeric: { day: "2-digit", month: "2-digit", year: "numeric" },
  dayMonth: { day: "numeric", month: "long" },
  long: DEFAULT_OPTIONS,
};
const DATE_ONLY = /^\d{4}-\d{2}-\d{2}$/;
const NOON_UTC = 12;

/**
 * @param {string|number|Date|null|undefined} value ISO instant, `YYYY-MM-DD`, epoch ms or Date.
 * @param {string} locale next-intl locale ("he" | "en") or a BCP-47 tag.
 * @param {"numeric"|"dayMonth"|"long"} [style]
 * @returns {string} "" for an empty or unparseable value.
 */
export function formatDate(value, locale, style = "numeric") {
  if (value === null || value === undefined || value === "") return "";
  let d;
  if (typeof value === "string" && DATE_ONLY.test(value)) {
    // A stored calendar day: pin it to noon UTC so no timezone moves it.
    const [y, m, day] = value.split("-").map(Number);
    d = new Date(Date.UTC(y, m - 1, day, NOON_UTC));
  } else {
    d = value instanceof Date ? value : new Date(value);
  }
  if (Number.isNaN(d.getTime())) return "";
  // guard-ok: display formatting of a stored date or server instant, not a clock read
  return new Intl.DateTimeFormat(LOCALE_TAG[locale] ?? locale ?? "he-IL", {
    ...(STYLES[style] ?? STYLES.numeric),
    timeZone: "Asia/Jerusalem", // guard-ok: display formatting, not a clock read
  }).format(d);
}
