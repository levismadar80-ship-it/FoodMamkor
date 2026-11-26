// @ts-check
/**
 * Module:   category-taxonomy
 * Purpose:  The ONE list of product categories the frontend knows: each
 *           category's stable slug, its Hebrew DB name and its department
 *           group (the 6 groups of the /map and /producers chip row). Every
 *           other category list in the frontend derives from this one.
 * Touches:  nothing — React-free data (map-chips.js and pure-logic tests import
 *           it without a renderer).
 * Does NOT: own glyphs or colours (lib/category-registry.js, keyed by these
 *           slugs), own the shown name (messages `category_names.<slug>`,
 *           lib/category-label.js), or own the taxonomy itself — the DB does.
 *           A new admin category that is missing here still works everywhere:
 *           it gets the fallback glyph and its own chip (map-chips
 *           categoryGroupRow), it just has no group, glyph or English name.
 * Related:  backend/app/services/category_slug.py NAME_TO_SLUG (the 18 seeded
 *           slugs) · the RENAMES of revision b3d5f7a9c1e2 (the English
 *           slugs of the admin-created rows, MEH-3911) ·
 *           __tests__/CategoryTaxonomyGuard.test.js (holds this list equal to
 *           the backend table and complete in every registry).
 * History:  MEH-3076 (creation, Sapir 21/11: «הכל לתקן ולעשות לפני השקה» —
 *           one record per category, keyed by slug, the Shopify / Etsy / Yelp
 *           taxonomy shape; replaces six hand-kept lists keyed by Hebrew name).
 */

/** @typedef {"meat" | "produce" | "dairy" | "bread" | "pantry" | "care"} CategoryGroup */

/**
 * Order = the order of NAME_TO_SLUG, then categories created from the admin.
 * `name` is the Hebrew DB name, kept only to match rows older than slugs.
 *
 * @type {ReadonlyArray<{ slug: string, name: string, group: CategoryGroup }>}
 */
export const CATEGORY_TAXONOMY = Object.freeze([
  { slug: "meat", name: "בשר", group: "meat" },
  { slug: "dairy", name: "חלב וגבינות", group: "dairy" },
  { slug: "eggs", name: "ביצים", group: "dairy" },
  { slug: "bread", name: "לחמים ואפייה", group: "bread" },
  { slug: "oil", name: "שמנים", group: "pantry" },
  { slug: "veg", name: "ירקות", group: "produce" },
  { slug: "fruit", name: "פירות", group: "produce" },
  { slug: "ferments", name: "מותססים וכבושים", group: "pantry" },
  { slug: "prepared", name: "מוצרים מוכנים", group: "pantry" },
  { slug: "herbs", name: "צמחי מרפא ותוספים", group: "care" },
  { slug: "care", name: "סבונים טבעיים", group: "care" },
  { slug: "cosmetics", name: "קוסמטיקה טבעית", group: "care" },
  { slug: "candles", name: "נרות וארומה", group: "care" },
  { slug: "drinks", name: "יין, בירה ומשקאות", group: "pantry" },
  { slug: "spices", name: "תבלינים וצמחי תיבול", group: "pantry" },
  { slug: "chocolate", name: "שוקולד וממתקים בוטיק", group: "pantry" },
  { slug: "honey", name: "דבש", group: "pantry" },
  { slug: "fish", name: "דגים", group: "meat" },
  // MEH-3401 / MEH-3738 / MEH-3911: created from the admin. Their slugs were
  // transliterations until MEH-3911 renamed them to English (revision
  // b3d5f7a9c1e2, which __tests__/CategoryTaxonomyGuard.test.js reads).
  { slug: "coffee", name: "קפה", group: "pantry" },
  // MEH-3738: cooked to order (platters, salads, small catering).
  { slug: "cooked-to-order", name: "בישול לפי הזמנה", group: "pantry" },
  // MEH-3911: cakes, cookies, tarts, desserts. Baked goods, so the bread group.
  { slug: "cakes-desserts", name: "עוגות וקינוחים", group: "bread" },
]);

/** @param {CategoryGroup} group @returns {string[]} the slugs in that group. */
export function slugsInGroup(group) {
  return CATEGORY_TAXONOMY.filter((c) => c.group === group).map((c) => c.slug);
}

/**
 * The taxonomy record for a DB category: by slug, else by its Hebrew name
 * (a row read before slugs existed, or a test fixture without one).
 *
 * @param {string | { name?: string | null, slug?: string | null } | null | undefined} category
 */
export function taxonomyEntry(category) {
  if (!category) return undefined;
  if (typeof category === "string") {
    return CATEGORY_TAXONOMY.find((c) => c.slug === category || c.name === category);
  }
  const { slug, name } = category;
  return (
    (slug ? CATEGORY_TAXONOMY.find((c) => c.slug === slug) : undefined) ??
    (name ? CATEGORY_TAXONOMY.find((c) => c.name === name) : undefined)
  );
}

/**
 * MEH-3076 (Sapir 21/11, «צבע לקבוצה»): the 6 groups in chip-row order. The
 * /map legend and the pin colours both read this order; the chip row
 * (lib/map-chips.js CATEGORY_CHIPS) lists the same keys.
 *
 * @type {ReadonlyArray<CategoryGroup>}
 */
export const CATEGORY_GROUPS = Object.freeze(["meat", "produce", "dairy", "bread", "pantry", "care"]);

/**
 * The group of a DB category, or undefined for one the taxonomy does not know
 * (an admin-created row: no group colour, no legend row).
 *
 * @param {Parameters<typeof taxonomyEntry>[0]} category
 * @returns {CategoryGroup | undefined}
 */
export function groupOf(category) {
  return taxonomyEntry(category)?.group;
}
