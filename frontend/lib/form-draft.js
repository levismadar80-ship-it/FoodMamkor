// @ts-check
/**
 * Module:   form-draft
 * Purpose:  The one rule for putting a «fill the form from text» draft into a
 *           form's state (MEH-3751, rule of two): a text field the draft fills
 *           replaces the form's value, a whole number becomes the string an
 *           <input> holds, and a field the draft leaves empty keeps what the
 *           owner already typed.
 * Does NOT: know any form's own fields or checks (a product list, a category
 *           set, a map pin): lib/recipe-draft.js and lib/event-draft.js add
 *           those around it.
 * Related:  components/FormFillBox.jsx (reads the draft) ·
 *           backend/app/services/form_filler.py (writes it)
 * History:  MEH-3751 (creation, out of lib/recipe-draft.js)
 */

/**
 * @typedef {{ text?: string[], number?: string[] }} DraftKeys
 *   text: keys taken as non-empty strings · number: keys taken as integers
 */

/**
 * The keys a draft fills, text keys first, each in the order given.
 * @param {Record<string, unknown>} draft
 * @param {DraftKeys} keys
 * @returns {string[]}
 */
export function filledKeys(draft, { text = [], number = [] }) {
  const isText = (/** @type {string} */ key) => typeof draft[key] === "string" && String(draft[key]).trim() !== "";
  const isNumber = (/** @type {string} */ key) => Number.isInteger(draft[key]);
  return [...text.filter(isText), ...number.filter(isNumber)];
}

/**
 * @template {Record<string, any>} T
 * @param {T} form the form state
 * @param {Record<string, unknown>} draft the route's draft
 * @param {DraftKeys} keys
 * @returns {T} the next form state
 */
export function applyDraftFields(form, draft, keys) {
  /** @type {Record<string, any>} */
  const next = { ...form };
  const numbers = new Set(keys.number ?? []);
  for (const key of filledKeys(draft, keys)) {
    next[key] = numbers.has(key) ? String(draft[key]) : draft[key];
  }
  return /** @type {T} */ (next);
}
