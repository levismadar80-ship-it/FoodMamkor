// @ts-check
/**
 * Module:   dietary-scope-conflict
 * Purpose:  MEH-3982 — tell an owner (or the admin) that a «טבעוני / צמחוני:
 *           כן» answer contradicts the business's own category: honey, dairy,
 *           eggs, meat and fish are animal products. A soft warning only.
 * Does NOT: block a save, change a stored answer, or hide a badge — a vegan
 *           cheese maker can sit under «חלב וגבינות», so the owner decides.
 * Related:  backend/app/services/dietary_scope_conflict.py (the same two slug
 *           lists, held equal by tests/test_meh3982_dietary_scope_conflict.py);
 *           TagsCard.jsx and admin ProducerForm.jsx (the two forms).
 * History:  MEH-3982 (creation) — «דבש הרמה» answered «טבעוני: כן».
 */

/** Category slugs whose products are animal-source, so never vegan. */
export const NON_VEGAN_CATEGORY_SLUGS = ["meat", "fish", "dairy", "eggs", "honey"];

/** Category slugs whose products are never vegetarian. */
export const NON_VEGETARIAN_CATEGORY_SLUGS = ["meat", "fish"];

/**
 * The names of the categories that contradict a «כן» answer, in the order the
 * business holds them. Empty when the answer is not «כן» or nothing conflicts.
 *
 * @param {string | null | undefined} scope  vegan_scope / vegetarian_scope
 * @param {{ categories?: Array<{ slug?: string | null, name?: string }> | null, slugs: string[] }} opts
 * @returns {string[]}
 */
export function conflictingCategoryNames(scope, { categories, slugs }) {
  if (scope !== "all") return [];
  return (categories || [])
    .filter((cat) => !!cat?.slug && slugs.includes(cat.slug))
    .map((cat) => cat.name || "");
}
