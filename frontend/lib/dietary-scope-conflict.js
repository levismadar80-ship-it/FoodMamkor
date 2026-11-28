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
const NON_VEGAN_CATEGORY_SLUGS = ["meat", "fish", "dairy", "eggs", "honey"];

/** Category slugs whose products are never vegetarian. */
const NON_VEGETARIAN_CATEGORY_SLUGS = ["meat", "fish"];

/** Category slugs whose products almost always contain gluten. */
const GLUTEN_CATEGORY_SLUGS = ["bread"];

/** Grass-fed only means something for an animal that grazes. */
const GRASS_FED_CATEGORY_SLUGS = ["meat", "dairy", "eggs"];

// MEH-3982: grains with gluten, flour or baked goods named in the business's
// own text. Not when the word is negated («ללא קמח»), and not at all when the
// text says it is gluten-free anywhere («קמח כוסמין ללא גלוטן»): that owner
// already knows the question, and a wrong «אצלכם כתוב» would hit exactly her.
const GLUTEN_WORDS = /(?<!(?:ללא|בלי)\s)(קמח\S*|דגנים|חיטה|שעורה|שיפון|כוסמין|לחם|לחמ\S+|מאפ\S+|פיתות|בורקס)/;
const GLUTEN_FREE_MENTION = /(?:ללא|בלי|נטול[א-ת]*)[\s-]+גלוטן/;

/** Per axis: the answer that makes a claim, and what contradicts it. */
const AXES = {
  vegan: { claim: "all", slugs: NON_VEGAN_CATEGORY_SLUGS },
  vegetarian: { claim: "all", slugs: NON_VEGETARIAN_CATEGORY_SLUGS },
  gluten: { claim: "dedicated", slugs: GLUTEN_CATEGORY_SLUGS, words: GLUTEN_WORDS },
};

/**
 * What contradicts the owner's claim on one axis, in the order the business
 * holds its categories: category names, then a word quoted from its own text.
 * Empty when the answer makes no claim or nothing contradicts it.
 *
 * @param {"vegan" | "vegetarian" | "gluten"} axis
 * @param {{ scope?: string | null, categories?: Array<{ slug?: string | null, name?: string }> | null, text?: string | null }} producer
 * @returns {string[]}
 */
export function conflictingCategoryNames(axis, { scope, categories, text }) {
  const rule = AXES[axis];
  if (!rule || scope !== rule.claim) return [];
  const names = (categories || [])
    .filter((cat) => !!cat?.slug && rule.slugs.includes(cat.slug))
    .map((cat) => cat.name || "");
  const word =
    rule.words && text && !GLUTEN_FREE_MENTION.test(text) ? text.match(rule.words)?.[1] : null;
  return word && names.length === 0 ? [word] : names;
}

/**
 * Show the «גידול במרעה» checkbox? Yes when the business grazes animals, when
 * its categories are not known yet, and always when it is already ticked (so
 * the owner can untick it).
 *
 * @param {{ categories?: Array<{ slug?: string | null }> | null, checked?: boolean }} producer
 * @returns {boolean}
 */
export function showsGrassFed({ categories, checked }) {
  if (checked || !categories || categories.length === 0) return true;
  return categories.some((cat) => !!cat?.slug && GRASS_FED_CATEGORY_SLUGS.includes(cat.slug));
}
