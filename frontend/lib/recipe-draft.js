// @ts-check
/**
 * Module:   recipe-draft
 * Purpose:  Put a «יש לכם מתכון כתוב?» draft (MEH-3740) into the recipe
 *           form's state: a field the draft fills replaces the form's value,
 *           a field it leaves empty keeps what the owner already typed.
 * Does NOT: call the server or save (components/FormFillBox.jsx reads,
 *           RecipeForm saves through its own route).
 * Related:  backend/app/services/form_filler.py (the draft's shape) ·
 *           backend/app/data/form_maps/recipe.json (the keys)
 * History:  MEH-3740 (creation)
 */

const TEXT_KEYS = new Set(["title", "description", "ingredients", "instructions"]);
const NUMBER_KEYS = new Set(["prep_time_min", "cook_time_min", "servings"]);

/**
 * @template {Record<string, any>} T
 * @param {T} form the form state
 * @param {{ draft: Record<string, unknown>, products: { id: string }[] }} input
 *   draft: the route's draft · products: the owner's products the form lists
 * @returns {T} the next form state
 */
export function applyRecipeDraft(form, { draft, products }) {
  /** @type {Record<string, any>} */
  const next = { ...form };
  for (const [key, value] of Object.entries(draft)) {
    if (TEXT_KEYS.has(key) && typeof value === "string" && value.trim()) {
      next[key] = value;
    } else if (NUMBER_KEYS.has(key) && typeof value === "number" && Number.isInteger(value)) {
      next[key] = String(value);
    }
  }
  // Only products the form shows: an id the list does not hold could not be
  // unticked, and the save would reject it.
  const listed = new Set(products.map((product) => product.id));
  const picked = Array.isArray(draft.product_ids)
    ? draft.product_ids.filter((id) => typeof id === "string" && listed.has(id))
    : [];
  if (picked.length > 0) next.product_ids = picked;
  return /** @type {T} */ (next);
}
