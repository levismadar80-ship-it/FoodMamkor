// @ts-check
/**
 * Module:   product-price
 * Purpose:  What a product's price is per (MEH-2936): «80₪ לבקבוק»,
 *           «35₪–60₪ לק״ג», and for `unit` just the price, so a product that
 *           never chose a unit reads exactly as before. Rendered by
 *           components/ProductPrice.jsx on every product surface.
 * Does NOT: format shekels — that is lib/utils.js:formatPriceRange (MEH-1140).
 * Related:  backend/app/models/product_orders.py:PRODUCT_PRICE_UNITS (the
 *           same list; tests/test_meh2936_product_unit.py compares them).
 * History:  MEH-2936 (creation).
 */
import { formatPriceRange } from "@/lib/utils";

/** The order is the order the owner sees them in the form. */
export const PRICE_UNITS = ["unit", "kg", "100g", "bottle", "box"];

/** Units that print nothing next to the price. */
const SILENT_UNITS = new Set(["unit"]);

/**
 * @param {string | null | undefined} unit
 * @returns {boolean} true when a label goes next to the price
 */
function showsUnit(unit) {
  return typeof unit === "string" && PRICE_UNITS.includes(unit) && !SILENT_UNITS.has(unit);
}

/**
 * The label that follows the price («לבקבוק»), or null for `unit` and for an
 * unknown value. Kept apart from the price because the price renders inside a
 * dir="ltr" span (MEH-1140) and a Hebrew label inside it would be reordered.
 * @param {{ price_unit?: string | null }} product
 * @param {(key: string) => string} tUnit — the `price_unit` namespace
 * @returns {string | null}
 */
export function productUnitLabel(product, tUnit) {
  return showsUnit(product.price_unit) ? tUnit(String(product.price_unit)) : null;
}

/**
 * The numeric price, or null when the product has none (free-text
 * `price_range` products keep their own rendering).
 * @param {{ price_min?: number | string | null, price_max?: number | string | null }} product
 * @returns {string | null}
 */
export function productNumericPrice(product) {
  return product.price_min !== null && product.price_min !== undefined ? formatPriceRange(product.price_min, product.price_max) || null : null;
}
