// @ts-check
/**
 * Module:   order-cart
 * Purpose:  What a buyer has picked on a business page before she sends an
 *           order request: the menu read, and the pure sums over her picks.
 * Touches:  GET /producers/{id}/order-menu (only for a business whose page
 *           payload says `takes_site_orders`).
 * Does NOT: send anything — the order sheet (stage 5c) owns the phone code
 *           and the POST. Nothing here is stored: a reload starts empty.
 * Related:  lib/use-order-cart.js (the React state over these helpers),
 *           backend/app/routers/product_order_offer.py::get_order_menu,
 *           backend/app/models/product_orders.py (the two caps mirrored here)
 * History:  MEH-3216 stage 5b (creation); MEH-3617 (a pick is a product or
 *           one of its variants: the key is lib/product-variants.js::lineKey)
 */

import api from "@/lib/api";
import { GetOrderMenuProducersProducerIdOrderMenuGetResponse } from "@/lib/generated/api.zod";
import { splitKey, variantFor, variantsOf } from "@/lib/product-variants";

// Mirrors PRODUCT_ORDER_MAX_QTY_PER_ITEM / PRODUCT_ORDER_MAX_LINES
// (backend/app/models/product_orders.py). The server refuses past them; the
// page stops the «+» there so the buyer never builds an order it would refuse.
export const MAX_QTY_PER_ITEM = 99;
export const MAX_LINES = 30;

/** @typedef {import("zod").infer<typeof GetOrderMenuProducersProducerIdOrderMenuGetResponse>} OrderMenu */
/** @typedef {OrderMenu["products"][number]} MenuProduct */
/** @typedef {Record<string, number>} Picks line key (product id, or product~variant) → quantity, only quantities ≥ 1 */

/**
 * The menu, or null when the business does not take orders after all (the
 * page payload can be a few minutes stale) or the read failed. A failed read
 * hides «הוספה»; it never breaks the page.
 * @param {string} producerId
 * @returns {Promise<OrderMenu | null>}
 */
export async function loadOrderMenu(producerId) {
  try {
    const { data } = await api.get(`/producers/${producerId}/order-menu`);
    const parsed = GetOrderMenuProducersProducerIdOrderMenuGetResponse.safeParse(data);
    return parsed.success ? parsed.data : null;
  } catch {
    return null;
  }
}

/**
 * The picks with one product's quantity changed. Zero removes the line; a new
 * line past MAX_LINES and a quantity past MAX_QTY_PER_ITEM are refused (the
 * picks come back unchanged).
 * @param {Picks} picks
 * @param {{ id: string, qty: number }} change
 * @returns {Picks}
 */
export function setQty(picks, { id, qty }) {
  const next = { ...picks };
  if (qty <= 0) {
    delete next[id];
    return next;
  }
  if (qty > MAX_QTY_PER_ITEM) return picks;
  if (!(id in picks) && Object.keys(picks).length >= MAX_LINES) return picks;
  next[id] = qty;
  return next;
}

/** @param {Picks} picks */
export function pickedCount(picks) {
  return Object.values(picks).reduce((sum, qty) => sum + qty, 0);
}

/**
 * The sum the bar shows, in agorot. A price range counts at its HIGH end, the
 * same price the order route stores (services/product_order_create.py::order_lines:
 * the buyer is told the most she might pay), and a pick whose product left
 * the menu or sold out counts as nothing.
 * @param {Picks} picks
 * @param {MenuProduct[]} products
 */
export function pickedTotalAgorot(picks, products) {
  const byId = new Map(products.map((p) => [p.id, p]));
  let total = 0;
  for (const [key, qty] of Object.entries(picks)) {
    const line = pickedLine(byId, key);
    if (line) total += line.unitAgorot * qty;
  }
  return total;
}

/**
 * One unit as the order route prices it: the higher end of a range.
 * @param {MenuProduct} product
 */
function unitPriceAgorot(product) {
  return Math.max(product.price_min_agorot, product.price_max_agorot);
}

/**
 * What one cart line is, or null when it can no longer be ordered: the
 * product left the menu or sold out, or the variant did (MEH-3617). A line
 * of a product with two or more variants must name one.
 * @param {Map<string, MenuProduct>} byId
 * @param {string} key
 * @returns {{ product: MenuProduct, variant: MenuProduct["variants"][number] | null, unitAgorot: number } | null}
 */
export function pickedLine(byId, key) {
  const { productId, variantId } = splitKey(key);
  const product = byId.get(productId);
  if (!product || !product.in_stock) return null;
  if (variantsOf(product).length === 0) {
    return variantId ? null : { product, variant: null, unitAgorot: unitPriceAgorot(product) };
  }
  const variant = variantFor(product, variantId);
  if (!variant || !variant.in_stock) return null;
  return { product, variant, unitAgorot: variant.price_agorot };
}

/**
 * Picks that still match the menu: drops products or variants that left it
 * or sold out.
 * @param {Picks} picks
 * @param {MenuProduct[]} products
 * @returns {Picks}
 */
export function keepOrderable(picks, products) {
  const byId = new Map(products.map((p) => [p.id, p]));
  return Object.fromEntries(Object.entries(picks).filter(([key]) => pickedLine(byId, key)));
}

/**
 * The «בערך X ₪» a product row shows, or null when the row's price is exact.
 * With one variant it is that variant's price; with two or more each variant
 * shows its own price in the sheet, so the row shows none (MEH-3617).
 * @param {MenuProduct} product
 * @returns {number | null}
 */
export function rowEstimateAgorot(product) {
  const variants = variantsOf(product);
  if (variants.length > 1) return null;
  if (variants.length === 1) return variants[0].price_is_estimate ? variants[0].price_agorot : null;
  return product.price_is_estimate ? unitPriceAgorot(product) : null;
}
