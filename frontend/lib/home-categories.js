// Category card data for the homepage category grid.
// Pure module (no React imports) so it can be consumed by both the
// HomeCategoryGrid component (frontend/app/[locale]/home/HomeCategoryGrid.jsx)
// and the page-level state hook (frontend/lib/use-home-page.js)
// without creating an app/ → lib/ import direction.

// MEH-1080 [T-A]: 1:1 card↔DB-category set (Sapir-locked 10/07/26). Each
// card names exactly one DB category (`name` = DB value verbatim, both
// locales — mirrors the /producers chips convention) and links to
// /producers?category=<id>. The previous 6 merged-label cards
// ("בשר, עוף ודגים" etc.) with fuzzy `match` arrays are gone — the
// includes()-first-match mapping silently hid producers whose category
// appeared later in a card's label (MEH-1077 DISC-03).
// Ordering: glyph-bearing cards lead (first 2 = hero cards); the 4
// Leaf-fallback cards trail until MEH-683 draws their glyphs.
// `key` doubles as the CATEGORY_ICONS lookup (meat/veg/dairy/bread/oil/care).
export const CATEGORY_CARDS = [
  { key: "meat",   name: "בשר" },
  { key: "veg",    name: "ירקות" },
  { key: "dairy",  name: "חלב וגבינות" },
  { key: "bread",  name: "לחמים ואפייה" },
  { key: "oil",    name: "שמנים" },
  { key: "care",   name: "סבונים טבעיים" },
  { key: "fish",   name: "דגים" },
  { key: "fruit",  name: "פירות" },
  { key: "drinks", name: "יין, בירה ומשקאות" },
  // MEH-1098 (A1): renamed DB category "קרמים ושמנים" → "קוסמטיקה טבעית".
  // Card name must track the DB value verbatim or the exact-match resolver
  // (matchCategoryId) returns categoryId:null and the card renders inert.
  { key: "cream",  name: "קוסמטיקה טבעית" },
];

// Exact-name resolution — category ids differ per environment
// (autoincrement), so they resolve at runtime against GET /categories.
// A card whose category is absent gets categoryId:null and renders
// inert (no dead link).
// MEH-1080: exact `===` match replaced includes()-first-match (DISC-03).
export function matchCategoryId(cards, categories) {
  return cards.map((card) => {
    const found = categories.find((c) => c.name === card.name);
    return { ...card, categoryId: found ? found.id : null };
  });
}
