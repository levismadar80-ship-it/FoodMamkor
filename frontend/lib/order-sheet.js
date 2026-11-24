// @ts-check
/**
 * Module:   order-sheet
 * Purpose:  What the order sheet needs that is not a screen: which ways of
 *           getting the order and which slots to offer, the cancel deadline,
 *           the request bodies, and the three calls (phone code, quote, send).
 * Touches:  POST /product-orders/phone-code · POST /product-orders/quote ·
 *           POST /product-orders.
 * Does NOT: price anything — the quote route does, with the order route's own
 *           pricing — and keeps no copy (every string is a
 *           `producer.detail.order_sheet.*` key in the component).
 * Related:  components/public/OrderSheet.jsx (the form), lib/order-cart.js
 *           (the picks), backend/app/routers/product_order_buyer.py
 * History:  MEH-3216 stage 5c (creation)
 */

import { z } from "zod";

import api from "@/lib/api";
import { clearMyOrdersNavGate } from "@/lib/my-orders-nav-cache"; // MEH-3698
import { QuoteOrderRouteProductOrdersQuotePostResponse } from "@/lib/generated/api.zod";
import { splitKey } from "@/lib/product-variants";

const HOUR_MS = 60 * 60 * 1000;

// Only the two fields the redirect needs (the generated buyer-view schema is
// zod/mini, which has no .pick): a new buyer-view field must not turn a sent
// order into an error on the buyer's screen.
const SentOrder = z.object({ id: z.uuid(), status_token: z.string().min(20) });

/** @typedef {import("@/lib/order-cart").OrderMenu} OrderMenu */
/** @typedef {OrderMenu["slots"][number]} MenuSlot */
/** @typedef {"pickup" | "delivery"} Fulfilment */

/**
 * The ways to get the order that have at least one slot, pickup first.
 * @param {OrderMenu} menu
 * @param {boolean} hasAlcohol
 * @returns {Fulfilment[]}
 */
export function fulfilmentsOffered(menu, hasAlcohol) {
  return /** @type {Fulfilment[]} */ (["pickup", "delivery"]).filter(
    (kind) => slotsFor(menu, kind, hasAlcohol).length > 0,
  );
}

/**
 * The slots of one way, in time order. An order with alcohol sees only the
 * slots the server allows alcohol in (no 23:00–06:00), so she cannot pick one
 * the server would refuse.
 * @param {OrderMenu} menu
 * @param {Fulfilment} fulfilment
 * @param {boolean} hasAlcohol
 * @returns {MenuSlot[]}
 */
export function slotsFor(menu, fulfilment, hasAlcohol) {
  return menu.slots
    .filter((s) => s.fulfilment === fulfilment && (!hasAlcohol || s.alcohol_ok))
    .sort((a, b) => Date.parse(a.start) - Date.parse(b.start));
}

/**
 * Until when the buyer may cancel a confirmed order: the slot start minus
 * the business's cutoff. ISO string, or null for an unreadable start.
 * @param {string} slotStart
 * @param {number} cutoffHours
 */
export function cancelDeadline(slotStart, cutoffHours) {
  const start = Date.parse(slotStart);
  if (Number.isNaN(start)) return null;
  return new Date(start - cutoffHours * HOUR_MS).toISOString();
}

/**
 * The picks as order lines, in the order she added them.
 * @param {Record<string, number>} picks
 */
function itemsOf(picks) {
  // MEH-3617: a variant line carries its variant id. Never a price.
  return Object.entries(picks).map(([key, qty]) => {
    const { productId, variantId } = splitKey(key);
    return variantId ? { product_id: productId, variant_id: variantId, qty } : { product_id: productId, qty };
  });
}

/**
 * @param {{ producerId: string, picks: Record<string, number>, fulfilment: Fulfilment, city: string }} f
 */
export function quoteBody({ producerId, picks, fulfilment, city }) {
  return {
    producer_id: producerId,
    items: itemsOf(picks),
    fulfilment,
    ...(fulfilment === "delivery" ? { delivery_city: city } : {}),
  };
}

/**
 * The order request. The idempotency key is made once per sheet, so a double
 * tap or a retry after a lost answer is one order on the server.
 * @param {{
 *   producerId: string, picks: Record<string, number>, fulfilment: Fulfilment,
 *   slotStart: string, name: string, phone: string, code: string,
 *   city: string, address: string, note: string, ageDeclared: boolean,
 *   key: string,
 * }} f
 */
export function orderBody(f) {
  const delivery = f.fulfilment === "delivery";
  return {
    producer_id: f.producerId,
    items: itemsOf(f.picks),
    fulfilment: f.fulfilment,
    slot_start: f.slotStart,
    customer_name: f.name.trim(),
    phone: f.phone.trim(),
    // MEH-3680: no code for a buyer ordering to her own verified phone.
    ...(f.code.trim() ? { code: f.code.trim() } : {}),
    ...(delivery ? { delivery_city: f.city.trim(), delivery_address: f.address.trim() } : {}),
    ...(f.note.trim() ? { note: f.note.trim() } : {}),
    age_declared: f.ageDeclared,
    idempotency_key: f.key,
  };
}

/**
 * MEH-3680: the same Israeli mobile in any notation (050-…, +972…, 972…).
 * Mirrors backend/app/utils/phone.py::canonical_il_msisdn; a number that does
 * not canonicalise matches nothing.
 * @param {string | null | undefined} a @param {string | null | undefined} b
 */
export function sameIlPhone(a, b) {
  const canon = (/** @type {string | null | undefined} */ v) => {
    const d = String(v ?? "").replace(/\D/g, "");
    const national = d.startsWith("972") ? d.slice(3) : d.startsWith("0") ? d.slice(1) : null;
    return national && /^5\d{8}$/.test(national) ? national : null;
  };
  const x = canon(a);
  return x !== null && x === canon(b);
}

/** @param {string} producerId @param {string} phone */
export async function askPhoneCode(producerId, phone) {
  await api.post("/product-orders/phone-code", { producer_id: producerId, phone: phone.trim() });
}

/** @param {ReturnType<typeof quoteBody>} body */
export async function quoteOrder(body) {
  const { data } = await api.post("/product-orders/quote", body);
  return QuoteOrderRouteProductOrdersQuotePostResponse.parse(data);
}

/**
 * Sends the order and returns where its status page is: `/order/{id}#t=…`.
 * The token rides in the hash, so it never reaches a server log.
 * @param {ReturnType<typeof orderBody>} body
 */
export async function sendOrder(body) {
  const { data } = await api.post("/product-orders", body);
  const sent = SentOrder.parse(data);
  clearMyOrdersNavGate(); // MEH-3698: «ההזמנות שלי» now has something
  return `/order/${sent.id}#t=${encodeURIComponent(sent.status_token)}`;
}

/** A fresh idempotency key (one per opened sheet). */
export function newOrderKey() {
  return crypto.randomUUID();
}
