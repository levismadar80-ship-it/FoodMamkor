// @ts-check
/**
 * Module:   daily-stock
 * Purpose:  Daily stock on the buyer's side: how many of a product or variant
 *           are left on each offered day (the menu's `stock` rows), the most
 *           she can pick, the «נשארו N» line, and the slots whose day still
 *           has room for everything in her cart.
 * Does NOT: refuse an order — the server does, on the same Israel day
 *           (backend/app/services/product_daily_stock.py::refuse_over_limit).
 *           A product with no row has no limit.
 * Related:  components/public/OrderStepper.jsx (the cap and the line),
 *           components/public/OrderSheet.jsx (the slots),
 *           lib/product-weekdays.js (the same filter for the days it is made)
 * History:  Daily stock (Fischgrund bakery, 27/11/2026; creation)
 */

import { israelDay } from "@/lib/product-orders";
import { splitKey } from "@/lib/product-variants";

// The buyer sees «נשארו N» at or below this (services/product_daily_stock.py
// LOW_STOCK_AT).
export const LOW_STOCK_AT = 3;

/**
 * Units left of one product (variantId null: across its variants) or one
 * variant on one day; null = no limit.
 * @param {{ stock?: { day: string, product_id: string, variant_id?: string | null, left: number }[] }} menu
 * @param {{ day: string, productId: string, variantId?: string | null }} at
 */
export function leftOn(menu, { day, productId, variantId = null }) {
  const row = (menu.stock ?? []).find(
    (r) => r.day === day && r.product_id === productId && (r.variant_id ?? null) === (variantId ?? null),
  );
  return row ? row.left : null;
}

/**
 * The most of a line she can pick on any offered day: the product's and the
 * variant's limits both apply. null = no limit on any day.
 * @param {any} menu
 * @param {string} productId
 * @param {string | null} [variantId]
 */
export function mostLeft(menu, productId, variantId = null) {
  const days = [...new Set((menu.slots ?? []).map((/** @type {any} */ s) => israelDay(s.start)))];
  /** @type {number | null} */
  let best = null;
  let limited = false;
  for (const day of days) {
    const own = leftOn(menu, { day, productId });
    const variant = variantId ? leftOn(menu, { day, productId, variantId }) : null;
    const room = minOf(own, variant);
    if (room === null) return null; // a day with no limit: no cap at all
    limited = true;
    best = best === null ? room : Math.max(best, room);
  }
  return limited ? best : null;
}

/** @param {number | null} a @param {number | null} b */
function minOf(a, b) {
  if (a === null) return b;
  if (b === null) return a;
  return Math.min(a, b);
}

/**
 * Whether every line of the cart fits on `day`: each variant under its own
 * limit, each product under its limit summed over its variants.
 * @param {any} menu
 * @param {Record<string, number>} picks
 * @param {string} day
 * @returns {{ productId: string, variantId: string | null, left: number } | null} the first line that does not fit, or null
 */
export function shortOn(menu, picks, day) {
  /** @type {Map<string, number>} */
  const perProduct = new Map();
  for (const [key, qty] of Object.entries(picks)) {
    const { productId, variantId } = splitKey(key);
    perProduct.set(productId, (perProduct.get(productId) ?? 0) + qty);
    const vLeft = variantId ? leftOn(menu, { day, productId, variantId }) : null;
    if (vLeft !== null && qty > vLeft) return { productId, variantId: variantId ?? null, left: vLeft };
  }
  for (const [productId, qty] of perProduct) {
    const left = leftOn(menu, { day, productId });
    if (left !== null && qty > left) return { productId, variantId: null, left };
  }
  return null;
}

/**
 * The slots on days with room for the whole cart, and — when there are none —
 * the line to name (on the day it has the most room).
 * @template {{ start: string }} S
 * @param {S[]} offered
 * @param {any} menu
 * @param {Record<string, number>} picks
 */
export function stockSlots(offered, menu, picks) {
  const slots = offered.filter((s) => shortOn(menu, picks, israelDay(s.start)) === null);
  if (slots.length > 0 || offered.length === 0) return { slots, short: null };
  /** @type {{ productId: string, variantId: string | null, left: number } | null} */
  let short = null;
  for (const s of offered) {
    const miss = shortOn(menu, picks, israelDay(s.start));
    if (miss && (!short || miss.left > short.left)) short = miss;
  }
  return { slots, short };
}

/**
 * The sheet's line when no offered day has room for the cart: the line, and
 * the most of it she can still order on one day.
 * @param {{ productId: string, variantId: string | null, left: number }} short
 * @param {Map<string, any>} byId the menu's products by id
 * @param {(key: string, values?: any) => string} t order_sheet translator
 */
export function stockShortText(short, byId, t) {
  const product = byId.get(short.productId);
  const variant = short.variantId ? (product?.variants ?? []).find((/** @type {any} */ v) => v.id === short.variantId) : null;
  const name = variant ? `${product?.name ?? ""} · ${variant.name}` : (product?.name ?? "");
  return short.left === 0 ? t("stock_sold_out", { name }) : t("stock_short", { name, count: short.left });
}
