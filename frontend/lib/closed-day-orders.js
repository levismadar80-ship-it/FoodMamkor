// @ts-check
"use client";

/**
 * Module:   closed-day-orders
 * Purpose:  After the owner saves a vacation or a closed date, warn her about
 *           the orders she already accepted on those days, with the first few
 *           listed and a way to the orders tab (MEH-3770).
 * Touches:  GET /producers/me/product-orders (through lib/product-orders.js),
 *           the toast store.
 * Does NOT: block the save or change an order: the vacation is already saved,
 *           and an accepted order stays valid. Does not throw: no orders route
 *           (flag off, 404, offline) means no warning.
 * Related:  lib/product-orders.js (israelDay, dayLabel, loadAcceptedOrders),
 *           producer/dashboard/page.js (vacation), edit/SpecialHoursEditor.jsx
 * History:  MEH-3770 (creation)
 */

import { dayLabel, israelDay, loadAcceptedOrders } from "@/lib/product-orders";
import { showToast } from "@/lib/toast";

/** How many orders the toast names before the count speaks for the rest. */
export const LISTED = 3;
const TOAST_MS = 12000;
export const ORDERS_HREF = "/producer/dashboard/orders";

/**
 * @typedef {{ dates?: string[], from?: string, until?: string | null, openEnded?: boolean }} Closed
 * `dates`: single closed dates (YYYY-MM-DD); `from`..`until`: a vacation,
 * both ends inclusive; `openEnded`: a vacation with no return date.
 */

/**
 * The orders whose slot falls on a closed day, by the Israel date.
 * @param {any[]} orders
 * @param {Closed} closed
 * @returns {any[]}
 */
export function onClosedDays(orders, closed) {
  const dates = new Set(closed.dates || []);
  return orders.filter((order) => {
    const day = order?.slot_start ? israelDay(order.slot_start) : null;
    if (!day) return false;
    if (dates.has(day)) return true;
    if (!closed.from || day < closed.from) return false;
    return Boolean(closed.openEnded) || (closed.until ? day <= closed.until : false);
  });
}

/**
 * @param {Closed} closed
 * @param {{ t: (key: string, values?: Record<string, any>) => string, locale: string }} i18n
 *   `t` scoped to dashboard.producer.closed_day_orders
 * @returns {Promise<number>} how many orders the warning named (0 = none shown)
 */
export async function warnClosedDayOrders(closed, { t, locale }) {
  let hit = [];
  try {
    hit = onClosedDays(await loadAcceptedOrders(), closed);
  } catch {
    return 0; // no orders route here: nothing to warn about
  }
  if (hit.length === 0) return 0;
  const list = hit
    .slice(0, LISTED)
    .map((o) => `${o.customer_name}, ${dayLabel(o.slot_start, locale)}`)
    .join("; ");
  showToast.info(t("warning", { count: hit.length, list }), {
    duration: TOAST_MS,
    action: { label: t("action"), href: ORDERS_HREF },
  });
  return hit.length;
}
