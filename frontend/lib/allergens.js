// @ts-check
// MEH-2662: the closed allergen list, in the same canonical order as
// backend/app/allergens.py ALLERGEN_CODES. __tests__/ProductsSectionAllergens.test.jsx
// ("matches backend/app/allergens.py exactly") reads the backend file and
// fails if the two lists ever differ.
export const ALLERGEN_CODES = [
  "gluten",
  "milk",
  "eggs",
  "tree_nuts",
  "peanuts",
  "sesame",
  "soy",
  "fish",
  "crustaceans",
  "molluscs",
  "celery",
  "mustard",
  "sulphites",
  "lupin",
  "fava_beans", // MEH-3439: Israel-specific, G6PD
];

/** Toggle one code in a list, keeping canonical order. */
export function toggleAllergen(list, code) {
  const set = new Set(list || []);
  if (set.has(code)) set.delete(code);
  else set.add(code);
  return ALLERGEN_CODES.filter((c) => set.has(c));
}

/**
 * MEH-3439: toggle one code in «מכיל» (`allergens`) or «עלול להכיל»
 * (`may_contain`). A code lives in at most one of the two: turning it on in
 * one turns it off in the other (the backend drops the overlap too).
 * @param {{ allergens?: string[] | null, may_contain?: string[] | null }} state
 * @param {"allergens" | "may_contain"} kind
 * @param {string} code
 * @returns {{ allergens: string[], may_contain: string[] }}
 */
export function toggleDeclared(state, kind, code) {
  const other = kind === "allergens" ? "may_contain" : "allergens";
  const next = toggleAllergen(state[kind], code);
  const on = next.includes(code);
  const otherList = (state[other] || []).filter((c) => !(on && c === code));
  // MEH-3445: a ticked code ends «אין במוצר אלרגנים מהרשימה».
  return /** @type {{ allergens: string[], may_contain: string[], no_allergens?: boolean }} */ ({
    [kind]: next,
    [other]: otherList,
    ...(on ? { no_allergens: false } : {}),
  });
}

/**
 * MEH-3445: «אין במוצר אלרגנים מהרשימה». Turning it on clears both groups —
 * "none" and a ticked code cannot both be true (the backend agrees).
 * @param {{ no_allergens?: boolean }} state
 * @returns {{ no_allergens: boolean, allergens?: string[], may_contain?: string[] }}
 */
export function toggleNoAllergens(state) {
  return state.no_allergens ? { no_allergens: false } : { no_allergens: true, allergens: [], may_contain: [] };
}
