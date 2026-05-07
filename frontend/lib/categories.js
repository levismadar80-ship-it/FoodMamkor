// Q3 — Wave 2 PR-A (MEH-472): slug-to-i18n-key mapping for category labels.
// Consuming sites (category grid, SEO titles) use categoryKey() to resolve
// the next-intl key for a Hebrew category label. Wave 3 wires remaining consumers.
export const CATEGORY_SLUGS = {
  "בישול": "category.cooking",
  "תזונה": "category.nutrition",
  "סיור אוכל": "category.food_tour",
  "חקלאות": "category.agriculture",
  "טעימות": "category.tasting",
  "סדנה": "category.workshop",
  "מותססים": "category.fermented",
};

export function categoryKey(hebrewLabel) {
  return CATEGORY_SLUGS[hebrewLabel] ?? null;
}
