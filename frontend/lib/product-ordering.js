// @ts-check
/**
 * Module:   product-ordering
 * Purpose:  The business's own products as the «הזמנות» tab switches them
 *           (open for ordering on the site, sold out), and the prep list of
 *           the «היום» tab.
 * Touches:  GET /producers/me/products/ordering ·
 *           PUT /producers/me/products/{id}/ordering
 * Does NOT: change a product's price, name or unit — the product routes in
 *           producer_me.py own those. The PUT takes the whole row, so
 *           price_unit and contains_alcohol are sent back unchanged.
 * Related:  lib/product-orders.js (the orders, the list groups),
 *           backend/app/routers/product_order_offer.py
 * History:  MEH-3216 gaps (creation; split from product-orders.js, which is
 *           at its size limit)
 */

import api from "@/lib/api";
import {
  GetMyProductsOrderingProducersMeProductsOrderingGetResponse,
  PutProductOrderingProducersMeProductsProductIdOrderingPutResponse,
} from "@/lib/generated/api.zod";

// What the business has committed to: a request still waiting for her
// answer, or a proposal the buyer has not accepted, is not prepared yet.
const PREP_STATUSES = ["confirmed", "ready"];

/** @returns {Promise<any[]>} */
export async function loadProductsOrdering() {
  const { data } = await api.get("/producers/me/products/ordering");
  return GetMyProductsOrderingProducersMeProductsOrderingGetResponse.parse(data).products;
}

/**
 * Save one product with one field changed; the rest of the row goes back
 * as it was read.
 * @param {any} product
 * @param {{ is_orderable?: boolean, in_stock?: boolean }} change
 */
export async function saveProductOrdering(product, change) {
  const body = {
    is_orderable: product.is_orderable,
    in_stock: product.in_stock,
    price_unit: product.price_unit,
    contains_alcohol: product.contains_alcohol,
    ...change,
  };
  const { data } = await api.put(`/producers/me/products/${product.id}/ordering`, body);
  return { ...product, ...PutProductOrderingProducersMeProductsProductIdOrderingPutResponse.parse(data) };
}

/**
 * Today's committed orders summed by product, biggest count first.
 * @param {any[]} todays the «היום» list
 * @returns {{ name: string, count: number }[]}
 */
export function prepList(todays) {
  /** @type {Map<string, number>} */
  const counts = new Map();
  for (const order of todays ?? []) {
    if (!PREP_STATUSES.includes(order.status)) continue;
    for (const line of order.items ?? []) {
      counts.set(line.name, (counts.get(line.name) ?? 0) + line.qty);
    }
  }
  return [...counts]
    .map(([name, count]) => ({ name, count }))
    .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name, "he"));
}
