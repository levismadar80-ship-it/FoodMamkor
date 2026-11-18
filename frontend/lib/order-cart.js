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
 * History:  MEH-3216 stage 5b (creation)
 */

import api from "@/lib/api";
import { GetOrderMenuProducersProducerIdOrderMenuGetResponse } from "@/lib/generated/api.zod";

// Mirrors PRODUCT_ORDER_MAX_QTY_PER_ITEM / PRODUCT_ORDER_MAX_LINES
// (backend/app/models/product_orders.py). The server refuses past them; the
// page stops the «+» there so the buyer never builds an order it would refuse.
export const MAX_QTY_PER_ITEM = 99;
export const MAX_LINES = 30;

/** @typedef {import("zod").infer<typeof GetOrderMenuProducersProducerIdOrderMenuGetResponse>} OrderMenu */
/** @typedef {OrderMenu["products"][number]} MenuProduct */
/** @typedef {Record<string, number>} Picks product id → quantity, only quantities ≥ 1 */

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
 * The sum the bar shows, in agorot. A product sold by weight counts at its
 * lower price — the same estimate the order route stores — and a pick whose
 * product left the menu counts as nothing.
 * @param {Picks} picks
 * @param {MenuProduct[]} products
 */
export function pickedTotalAgorot(picks, products) {
  const byId = new Map(products.map((p) => [p.id, p]));
  let total = 0;
  for (const [id, qty] of Object.entries(picks)) {
    const product = byId.get(id);
    if (product && product.in_stock) total += product.price_min_agorot * qty;
  }
  return total;
}

/**
 * Picks that still match the menu: drops products that left it or sold out.
 * @param {Picks} picks
 * @param {MenuProduct[]} products
 * @returns {Picks}
 */
export function keepOrderable(picks, products) {
  const live = new Set(products.filter((p) => p.in_stock).map((p) => p.id));
  return Object.fromEntries(Object.entries(picks).filter(([id]) => live.has(id)));
}
