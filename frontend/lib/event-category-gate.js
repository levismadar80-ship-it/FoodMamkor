// @ts-check
/**
 * Module:   event-category-gate
 * Purpose:  Decide which category chips /events and /experiences show — only
 *           categories that have at least one result in the current city, so
 *           no chip leads to «לא נמצאו תוצאות».
 * Touches:  nothing — pure functions.
 * Does NOT: gate the business filters on home, /producers and /map — that is
 *           visibleAxisChips (lib/producer-filters.js:252, MEH-2767), which
 *           this mirrors: a selected chip always stays, and an unknown set
 *           fails open.
 * Related:  app/[locale]/events/EventsClient.jsx (the only caller),
 *           lib/event-categories.js (the fixed vocabularies).
 * History:  MEH-3124 (creation, 14/11/2026 — Sapir: «למה להציג סינונים שלא
 *           מביאים לשום מקום»).
 */

/** Fewer real categories than this → no category chip at all: with one
 * category present, its chip returns the same list as «הכל». */
const MIN_CATEGORIES_TO_FILTER = 2;

/**
 * The categories present in a category-less list for the current tab + city.
 * @param {Array<{ category?: string | null }> | null | undefined} rows
 * @returns {Set<string> | null} null when the rows are unknown
 */
export function presentCategories(rows) {
  if (!Array.isArray(rows)) return null;
  const out = new Set();
  for (const r of rows) if (r && r.category) out.add(r.category);
  return out;
}

/**
 * Filter the chip row. A chip whose key is not in `vocabulary` (the «הכל»
 * sentinel, or any other kind of chip sharing the row) is never touched.
 * @param {{
 *   chips: Array<{ key: string }>,
 *   vocabulary: Set<string>,
 *   present: Set<string> | null,
 *   active: Set<string>,
 * }} args
 */
export function visibleCategoryChips({ chips, vocabulary, present, active }) {
  if (!present) return chips; // unknown (loading or failed) → fail open
  // Count only categories that have a chip: a stray value in the data must
  // not make a lone real category look filterable.
  let known = 0;
  for (const c of present) if (vocabulary.has(c)) known += 1;
  const enough = known >= MIN_CATEGORIES_TO_FILTER;
  return chips.filter((chip) => {
    if (!vocabulary.has(chip.key)) return true;
    if (active.has(chip.key)) return true;
    return enough && present.has(chip.key);
  });
}
