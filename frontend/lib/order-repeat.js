// @ts-check
/**
 * Module:   order-repeat
 * Purpose:  A buyer's weekly repeat of an order (MEH-3933): the weekday and
 *           time it repeats on, on the Israel clock, and the two ways to stop
 *           it — the buyer from her status page, the business from the order.
 * Touches:  POST /product-orders/status/repeat/stop (token in the body) ·
 *           POST /producers/me/product-orders/{id}/repeat/stop.
 * Does NOT: make the weekly orders — the server's hourly job does
 *           (backend/app/services/product_order_repeat.py). Does NOT hold copy:
 *           `order_repeat.*` keys in messages.
 * Related:  components/public/OrderSheetRepeat.jsx,
 *           app/[locale]/order/[id]/OrderRepeatBlock.jsx,
 *           components/dashboard/orders/OrderRepeatControl.jsx
 * History:  MEH-3933 (creation, 27/11/2026)
 */

import api from "@/lib/api";
import {
  StopOrderRepeatProducersMeProductOrdersOrderIdRepeatStopPostResponse,
  StopOwnRepeatProductOrdersStatusRepeatStopPostResponse,
} from "@/lib/generated/api.zod";
import { hhmm } from "@/lib/product-orders";
import { israelWeekday } from "@/lib/product-weekdays";

/**
 * The day and time a slot repeats on, e.g. { day: "שישי", time: "10:00" }.
 * @param {string} slotStart ISO
 * @param {string} daysLong `product_weekdays.days_long`, Sunday first
 */
export function repeatWhen(slotStart, daysLong) {
  return { day: daysLong.split(",")[israelWeekday(slotStart)] ?? "", time: hhmm(slotStart) };
}

/** @param {{ token?: string, order_id?: string }} ref */
export async function stopRepeatAsBuyer(ref) {
  // A link that carries its token needs no login (lib/buyer-order.js authFor).
  const config = ref.token ? /** @type {any} */ ({ _noAuth: true }) : undefined;
  const { data } = await api.post("/product-orders/status/repeat/stop", ref, config);
  return StopOwnRepeatProductOrdersStatusRepeatStopPostResponse.parse(data);
}

/** @param {string} orderId */
export async function stopRepeatAsBusiness(orderId) {
  const { data } = await api.post(`/producers/me/product-orders/${orderId}/repeat/stop`, {});
  return StopOrderRepeatProducersMeProductOrdersOrderIdRepeatStopPostResponse.parse(data);
}
