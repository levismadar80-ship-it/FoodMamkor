/**
 * Module:   lib/format
 * Purpose:  Locale-aware number formatting helpers shared across pages.
 * Touches:  nothing — pure functions over Intl.NumberFormat.
 * Does NOT: format dates (lib/format-date.js) or percentages (lib/percent.js).
 * Related:  app/[locale]/producer/dashboard/insights/page.js (windowed metric
 *           cards — the original home of formatCompact, MEH-1433);
 *           __tests__/formatCompact.test.js (unit pin).
 * History:  MEH-1433 (creation inside insights/page.js); MEH-1520 (moved here —
 *           App Router forbids non-reserved exports from page.js, and the
 *           export existed only so the test could import it).
 */

// MEH-1433: 4-digit windowed values (e.g. 2540/2540/2540) overflowed the card
// at fixed 4xl/2xl/xl sizes — in RTL the leading digit clipped on the start
// side. Compact notation caps every magnitude at a bounded width ("2.5K"),
// paired with min-w-0 on the flex row + tabular-nums so the trio always fits.
// he-IL renders the "K" suffix with a trailing RLM (U+200F) — a known,
// acceptable ICU behavior (the mark keeps the Latin suffix ordered correctly
// in RTL). Unit-pinned in __tests__/formatCompact.test.js (MEH-1433 follow-up).
export function formatCompact(n, locale) {
  return new Intl.NumberFormat(locale, {
    notation: "compact",
    maximumFractionDigits: 1,
  }).format(n ?? 0);
}
