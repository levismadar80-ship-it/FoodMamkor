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
import { MarkOrderPaidProducersMeProductOrdersOrderIdPaidPostResponse } from "@/lib/generated/api.zod";

const PAYABLE = ["confirmed", "ready", "handed", "no_show"];
const OWED = ["confirmed", "ready", "handed"];

/** The business took the order on, so «סמנו כשולם» makes sense. */
export const canMarkPaid = (/** @type {any} */ order) => PAYABLE.includes(order?.status);

/** Taken on, not marked: the business is still owed for it. */
export const isOwed = (/** @type {any} */ order) => OWED.includes(order?.status) && !order?.paid_at;

/** @param {any[]} orders */
export const owedOrders = (orders) => orders.filter(isOwed);

/**
 * @param {string} orderId
 * @param {boolean} paid
 */
export async function setOrderPaid(orderId, paid) {
  const { data } = await api.post(`/producers/me/product-orders/${orderId}/paid`, { paid });
  return MarkOrderPaidProducersMeProductOrdersOrderIdPaidPostResponse.parse(data);
}
