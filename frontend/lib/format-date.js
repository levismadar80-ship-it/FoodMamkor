/**
 * Module:   format-date
 * Purpose:  Locale-aware date formatting for event / experience surfaces.
 *           Single source replacing 4 duplicated formatDate helpers that
 *           hardcoded "he-IL" (so /en/* rendered Hebrew dates — MEH-753).
 * Related:  frontend/app/[locale]/events/EventsClient.jsx,
 *           frontend/app/[locale]/events/[id]/EventDetailClient.jsx,
 *           frontend/components/ExperienceCard.jsx,
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

// Default = the event-card signature shared by EventsClient + ExperienceCard.
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
    return new Date(iso).toLocaleDateString(LOCALE_TAG[locale] ?? "he-IL", options);
  } catch {
    return iso;
  }
}
