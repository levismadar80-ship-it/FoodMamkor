// @ts-check
/**
 * Module:   order-status
 * Purpose:  The buyer's side of one on-site order: read it, cancel it, accept
 *           the business's proposed change, and decide which approved
 *           sentences the status page shows for each status.
 * Touches:  POST /product-orders/status · /status/cancel · /status/accept-change
 *           (the token goes in the body, never in a URL).
 * Does NOT: hold copy — `order_status.*` keys in messages; or format money
 *           and time — lib/product-orders.js owns those.
 * Related:  app/[locale]/order/[id]/OrderStatusClient.jsx,
 *           backend/app/routers/product_order_buyer.py
 * History:  MEH-3216 stage 5a (creation)
 */

import api from "@/lib/api";
import {
  AcceptProposedChangeProductOrdersStatusAcceptChangePostResponse,
  CancelOwnOrderProductOrdersStatusCancelPostResponse,
  ReadOrderStatusProductOrdersStatusPostResponse,
} from "@/lib/generated/api.zod";

// The server's BuyerRefIn: a token is 20..100 characters.
const TOKEN_MIN = 20;
const TOKEN_MAX = 100;

/**
 * The token from `#t=…`, or null. Read from the hash so it never reached a
 * server; anything that cannot be a token is ignored rather than sent.
 * @param {string} hash e.g. window.location.hash
 */
export function tokenFromHash(hash) {
  const value = new URLSearchParams(String(hash ?? "").replace(/^#/, "")).get("t");
  return value && value.length >= TOKEN_MIN && value.length <= TOKEN_MAX ? value : null;
}

/**
 * The body naming the order: the token when there is one, else the id (the
 * server accepts the id only from the logged-in buyer who owns it).
 * @param {string} orderId
 * @param {string | null} token
 */
export function buyerRef(orderId, token) {
  return token ? { token } : { order_id: orderId };
}

// A link that carries its token needs no login, so the request goes without
// the browser's saved one: a stale saved login answers 401 even when the link
// is good, and the page would read that as a wrong link (`_noAuth`, lib/api.js).
/** @param {{ token?: string }} ref */
const authFor = (ref) => (ref.token ? /** @type {any} */ ({ _noAuth: true }) : undefined);

/** @param {object} ref */
export async function readStatus(ref) {
  const { data } = await api.post("/product-orders/status", ref, authFor(ref));
  return ReadOrderStatusProductOrdersStatusPostResponse.parse(data);
}

/** @param {object} ref */
export async function cancelOrder(ref) {
  const { data } = await api.post("/product-orders/status/cancel", ref, authFor(ref));
  return CancelOwnOrderProductOrdersStatusCancelPostResponse.parse(data);
}

/** @param {object} ref */
export async function acceptChange(ref) {
  const { data } = await api.post("/product-orders/status/accept-change", ref, authFor(ref));
  return AcceptProposedChangeProductOrdersStatusAcceptChangePostResponse.parse(data);
}

const OPEN = ["pending", "change_proposed", "confirmed", "ready"];

/**
 * What the page says for this order, as message keys under `order_status`.
 * One headline per status; `when` = the confirmed hand-over line; `code` =
 * the pickup code block; `cancel` = the cancel button, or `too_late` when
 * the order is still open but past the cutoff.
 * @param {any} order
 */
export function statusView(order) {
  const headline = {
    pending: "sent",
    change_proposed: "proposal",
    confirmed: "confirmed",
    ready: "ready",
    declined: "declined",
    cancelled: "cancelled",
    expired: "expired",
    no_show: "cancelled",
    handed: "handed",
  }[/** @type {string} */ (order.status)] ?? "cancelled";
  const open = OPEN.includes(order.status);
  const committed = order.status === "confirmed" || order.status === "ready";
  let cancel = null;
  if (open) cancel = order.can_cancel ? "cancel" : "too_late";
  return {
    headline,
    waiting: order.status === "pending",
    when: committed ? (order.fulfilment === "delivery" ? "when_delivery" : "when_pickup") : null,
    code: committed && Boolean(order.pickup_code),
    proposal: order.status === "change_proposed" && Boolean(order.proposal),
    // A proposal shows its own total; a second, older one beside it would
    // leave her guessing which to pay.
    toPay: (open && order.status !== "change_proposed") || order.status === "handed",
    cancel,
  };
}
