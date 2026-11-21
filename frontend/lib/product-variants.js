// @ts-check
/**
 * Module:   product-variants
 * Purpose:  The pure rules the business page and the order cart share about a
 *           product's sizes or flavours: the cart key of a line, the variant a
 *           line means, the «מ-X ₪» price and which variants can be picked.
 * Touches:  Nothing — pure functions.
 * Does NOT: price an order. The server stores the price
 *           (backend/app/services/product_variants.py); the cart only mirrors
 *           it so the bar shows the same sum.
 * Related:  lib/order-cart.js (picks keyed by lineKey), components/public/
 *           RowOrderControl.jsx (the choice), components/dashboard/
 *           ProductVariantsField.jsx (the owner's list)
 * History:  MEH-3617 (creation)
 */

const SEP = "~";

/**
 * The cart key of one line: the product id alone, or `{product}~{variant}`.
 * @param {string} productId
 * @param {string | null | undefined} [variantId]
 */
export function lineKey(productId, variantId) {
  return variantId ? `${productId}${SEP}${variantId}` : productId;
}

/**
 * @param {string} key
 * @returns {{ productId: string, variantId: string | null }}
 */
export function splitKey(key) {
  const at = key.indexOf(SEP);
  if (at < 0) return { productId: key, variantId: null };
  return { productId: key.slice(0, at), variantId: key.slice(at + 1) };
}

/**
 * A product's variants, or an empty list. The shape is the API's
 * (ProductVariantOut / OrderMenuVariantOut), so the callers type it.
 * @param {any} product
 * @returns {any[]}
 */
export function variantsOf(product) {
  return Array.isArray(product?.variants) ? product.variants : [];
}

/**
 * Whether the buyer must pick a variant: only when there are two or more.
 * One variant is applied without a choice (MEH-3617).
 * @param {any} product
 */
export function needsChoice(product) {
  return variantsOf(/** @type {any} */ (product)).length > 1;
}

/**
 * The variant a cart line names, or the single one applied silently.
 * @param {any} product
 * @param {string | null} variantId
 * @returns {any | null}
 */
export function variantFor(product, variantId) {
  const variants = variantsOf(product);
  if (variantId) return variants.find((v) => v.id === variantId) ?? null;
  return variants.length === 1 ? variants[0] : null;
}

/**
 * The price a business page product shows when it has variants (shekels):
 * with one variant, that variant's price; with two or more, the lowest of the
 * ones in stock (all of them when none is), and `from` when they differ, so
 * the page reads «מ-X ₪». A variant without a price counts at the product's.
 * Null without variants (the product's own price is shown as before) or when
 * there is no number at all (MEH-3617).
 * @param {any} product
 * @returns {{ shekels: number, from: boolean } | null}
 */
export function variantPrice(product) {
  const all = variantsOf(product);
  if (all.length === 0) return null;
  const inStock = all.filter((v) => v.in_stock);
  const variants = inStock.length ? inStock : all;
  const base = product.price_min === null || product.price_min === undefined ? null : Number(product.price_min);
  const prices = /** @type {number[]} */ (variants
    .map((v) => (typeof v.price_agorot === "number" ? v.price_agorot / 100 : base))
    .filter((p) => typeof p === "number" && Number.isFinite(p)));
  if (!prices.length) return null;
  const low = Math.min(...prices);
  return { shekels: low, from: low !== Math.max(...prices) };
}

/**
 * The names as one line under the product («קטנה · גדולה»).
 * @param {any} product
 */
export function variantNamesLine(product) {
  return variantsOf(/** @type {any} */ (product))
    .map((/** @type {{ name: string }} */ v) => v.name)
    .join(" · ");
}

/**
 * An order line as people read it: «{product} · {variant}», or the product.
 * The variant name is the copy stored with the order (MEH-3617).
 * @param {{ name: string, variant_name?: string | null }} line
 */
export function orderLineName(line) {
  return line.variant_name ? `${line.name} · ${line.variant_name}` : line.name;
}
