// MEH-2662: the closed allergen list, in the same canonical order as
// backend/app/allergens.py ALLERGEN_CODES. AllergenCodesParity.test.js reads
// the backend file and fails if the two lists ever differ.
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
];

/** Toggle one code in a list, keeping canonical order. */
export function toggleAllergen(list, code) {
  const set = new Set(list || []);
  if (set.has(code)) set.delete(code);
  else set.add(code);
  return ALLERGEN_CODES.filter((c) => set.has(c));
}
