// @ts-check
/**
 * Module:   order-again
 * Purpose:  «להזמין שוב»: carry a finished order's lines from its status page
 *           to the business page, where they fill the cart again — the items
 *           still on the menu are added, the rest are named, not dropped
 *           silently (Wolt «Order again», Amazon «Buy it again»).
 * Touches:  browser sessionStorage `meh_order_again`, one entry, read once by
 *           the business page and removed on read.
 * Does NOT: price or validate anything — lib/order-cart.js `pickedLine`
 *           decides what is still orderable, and the order route re-checks
 *           every line when the order is sent.
 * Related:  lib/use-order-cart.js (consumes the stash),
 *           app/[locale]/order/[id]/OrderStatusClient.jsx (the button)
 * History:  MEH-3764 (creation)
 */

import { MAX_LINES, MAX_QTY_PER_ITEM, pickedLine } from "@/lib/order-cart";
import { lineKey, orderLineName } from "@/lib/product-variants";

const KEY = "meh_order_again";
// A stash older than this is from another visit: ignore it.
const MAX_AGE_MS = 30 * 60 * 1000;

/** Statuses after which there is nothing left to do but order again. */
const FINISHED_STATUSES = Object.freeze(["handed", "cancelled", "declined", "expired", "no_show"]);

/**
 * @typedef {{ product_id?: string | null, variant_id?: string | null, name: string, variant_name?: string | null, qty: number }} OrderLine
 * @typedef {{ key: string | null, qty: number, name: string }} StashLine  key null = the product was deleted
 * @typedef {{ producerId: string, lines: StashLine[], at: number }} OrderAgainStash
 */

/**
 * A finished order's lines as cart keys, each with the name it was ordered
 * under. A line whose product was deleted since (product_id null) keeps its
 * name and no key, so the business page can say it was not added.
 * @param {OrderLine[]} items
 * @returns {StashLine[]}
 */
export function orderAgainLines(items) {
  return (items ?? []).map((line) => ({
    key: line.product_id ? lineKey(line.product_id, line.variant_id ?? null) : null,
    qty: Math.min(MAX_QTY_PER_ITEM, Math.max(1, Math.floor(line.qty) || 1)),
    name: orderLineName(line),
  }));
}

/**
 * Whether the order page offers «להזמין שוב»: the order is over and at least
 * one of its products still exists.
 * @param {{ status: string, items?: OrderLine[] }} order
 */
export function canOrderAgain(order) {
  return FINISHED_STATUSES.includes(order.status) && (order.items ?? []).some((line) => Boolean(line.product_id));
}

/**
 * Keep the order's lines for the business page to pick up.
 * @param {string} producerId
 * @param {OrderLine[]} items
 */
export function stashOrderAgain(producerId, items) {
  try {
    sessionStorage.setItem(KEY, JSON.stringify({ producerId, lines: orderAgainLines(items), at: Date.now() }));
  } catch {
    // Storage unavailable (private mode): the business page opens with an
    // empty cart, as it would from any other link.
  }
}

/**
 * Read and remove the stash, if it is for this business and fresh.
 * @param {string} producerId
 * @returns {OrderAgainStash | null}
 */
export function takeOrderAgain(producerId) {
  try {
    const raw = sessionStorage.getItem(KEY);
    if (raw === null) return null;
    const stash = JSON.parse(raw);
    if (stash?.producerId !== producerId) return null;
    sessionStorage.removeItem(KEY);
    if (typeof stash.at !== "number" || Date.now() - stash.at > MAX_AGE_MS) return null;
    if (!Array.isArray(stash.lines)) return null;
    return { producerId, lines: stash.lines, at: stash.at };
  } catch {
    return null;
  }
}

/**
 * Merge the stash into the cart against the live menu. A line is added when
 * its product (and variant) is still on the menu and in stock; otherwise its
 * name goes to `skipped`. A quantity already in the cart is kept if higher.
 * @param {Record<string, number>} current  the cart's picks now
 * @param {StashLine[]} lines
 * @param {import("@/lib/order-cart").MenuProduct[]} products  the live menu
 * @returns {{ picks: Record<string, number>, added: number, skipped: string[] }}
 */
export function applyOrderAgain(current, lines, products) {
  const byId = new Map(products.map((p) => [p.id, p]));
  /** @type {Record<string, number>} */
  const picks = { ...current };
  /** @type {string[]} */
  const skipped = [];
  let added = 0;
  for (const line of lines) {
    const fits = line.key && pickedLine(byId, line.key) && (line.key in picks || Object.keys(picks).length < MAX_LINES);
    if (!fits || !line.key) {  // (the key test narrows the type for the write below)
      if (!skipped.includes(line.name)) skipped.push(line.name);
      continue;
    }
    picks[line.key] = Math.min(MAX_QTY_PER_ITEM, Math.max(picks[line.key] ?? 0, line.qty));
    added += 1;
  }
  return { picks, added, skipped };
}
