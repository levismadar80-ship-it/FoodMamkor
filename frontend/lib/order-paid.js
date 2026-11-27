// @ts-check
/**
 * Module:   order-paid
 * Purpose:  MEH-3962 — the business's «שולם» mark on an on-site order: which
 *           orders can carry it, which are still owed for, and the call that
 *           sets or clears it.
 * Touches:  POST /producers/me/product-orders/{id}/paid.
 * Does NOT: move money — the buyer pays the business directly (ADR-042 §5).
 *           The statuses mirror backend/app/services/product_order_paid.py
 *           (PAYABLE_STATUSES, UNPAID_LIST_STATUSES); the server decides.
 * Related:  components/dashboard/orders/OrderPaidControl.jsx, OrdersBoard.jsx
 * History:  MEH-3962 (creation, 27/11/2026; idea from KAMA)
 */

import api from "@/lib/api";
import {
  ListBusinessOrdersProducersMeProductOrdersGetResponse,
  MarkOrderPaidProducersMeProductOrdersOrderIdPaidPostResponse,
} from "@/lib/generated/api.zod";

const PAYABLE = new Set(["confirmed", "ready", "handed", "no_show"]);
const PAGE = 50;
const MAX_PAGES = 10;

/** The business took the order on, so «סמנו כשולם» makes sense. */
export const canMarkPaid = (/** @type {any} */ order) => PAYABLE.has(order?.status);

/** Still owed for. The server decides (`owed`, product_order_paid.is_owed):
 * a handed order counts only from the day the mark existed. */
export const isOwed = (/** @type {any} */ order) => order?.owed === true;

/** @param {any[]} orders */
export const owedOrders = (orders) => orders.filter((order) => isOwed(order));

/**
 * Every owed order, paged (GET ?payment=unpaid). The board loads only the
 * latest page of handed orders, so an owed one further back comes from here.
 */
export async function loadOwedOrders() {
  const orders = [];
  for (let page = 0; page < MAX_PAGES; page += 1) {
    const { data } = await api.get("/producers/me/product-orders", {
      params: { payment: "unpaid", limit: PAGE, offset: page * PAGE },
    });
    const got = ListBusinessOrdersProducersMeProductOrdersGetResponse.parse(data);
    orders.push(...got.orders);
    if (orders.length >= got.total || got.orders.length === 0) break;
  }
  return orders;
}

/** Add the owed orders the lists did not load; an order already there wins.
 * @param {any[]} orders @param {any[]} owed */
export function withOwed(orders, owed) {
  const seen = new Set(orders.map((order) => order.id));
  return [...orders, ...owed.filter((order) => !seen.has(order.id))];
}

/**
 * @param {string} orderId
 * @param {boolean} paid
 */
export async function setOrderPaid(orderId, paid) {
  const { data } = await api.post(`/producers/me/product-orders/${orderId}/paid`, { paid });
  return MarkOrderPaidProducersMeProductOrdersOrderIdPaidPostResponse.parse(data);
}
