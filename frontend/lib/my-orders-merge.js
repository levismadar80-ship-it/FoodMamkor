// @ts-check

/**
 * Module:   my-orders-merge
 * Purpose:  MEH-3698 — turn the three buyer lists (product orders, group buys,
 *           surprise bags) into the one «ההזמנות שלי» list: one row shape, a
 *           kind per row, split into «פעילות» (nearest first) and «קודמות»
 *           (newest first).
 * Does NOT: fetch, translate or render — MyOrdersClient.jsx does. Pure, so the
 *           0 / 1 / many matrix is tested without a page.
 * Related:  app/[locale]/my-orders/MyOrdersClient.jsx · MyOrdersRow.jsx,
 *           backend/app/routers/product_order_buyer.py (orders),
 *           backend/app/routers/group_buy_mine.py (group buys),
 *           backend/app/services/rescue_reads.py `my_reservation_history` (bags)
 * History:  MEH-3698 (creation)
 */

import { parseNaiveUtc } from "@/lib/dates";

/** An order in one of these is over: nothing more will happen to it. */
const ORDER_CLOSED = new Set(["handed", "declined", "cancelled", "expired", "no_show"]);

/**
 * @typedef {{
 *   kind: "order" | "group_buy" | "bag",
 *   id: string,
 *   href: string,
 *   business: string,
 *   status: string,
 *   when: Date | string,
 *   sortAt: number,
 *   active: boolean,
 * }} MyOrderRow
 * `when` is what the row prints (a Date, or a calendar day "YYYY-MM-DD");
 * `sortAt` is the same moment in ms, for ordering.
 */

/** @param {string} day "YYYY-MM-DD" @returns {number} noon UTC that day */
function dayMs(day) {
  return new Date(`${day}T12:00:00Z`).getTime();
}

/** @param {any} o @returns {MyOrderRow} */
function orderRow(o) {
  // Created, not the slot: a declined order's slot never happened, and the
  // MEH-3525 list printed the day it was sent.
  const at = new Date(o.created_at);
  const active = !ORDER_CLOSED.has(o.status);
  return {
    kind: "order", id: o.id, href: `/order/${o.id}`, business: o.producer_name,
    status: o.status, when: at,
    // Running orders by their pickup slot, nearest first.
    sortAt: active && o.slot_start ? new Date(o.slot_start).getTime() : at.getTime(),
    active,
  };
}

/** @param {any} gb @param {Date} now @returns {MyOrderRow} */
function groupBuyRow(gb, now) {
  const deadline = parseNaiveUtc(gb.deadline);
  // Same reading as group_buy_mine.running(): funded, or open before its
  // deadline. An open group past it waits for the expiry job: not running.
  const active = gb.status === "funded" || (gb.status === "open" && deadline > now);
  const pickup = gb.pickup_starts_at ? parseNaiveUtc(gb.pickup_starts_at) : null;
  const at = active && pickup ? pickup : deadline;
  return {
    kind: "group_buy", id: gb.id, href: `/group-buys/${gb.id}`,
    // A group always has a title; the business name can be missing.
    business: gb.producer_name || gb.title, status: gb.status,
    when: at, sortAt: at.getTime(), active,
  };
}

/** @param {any} b @param {Date} now @param {string} today @returns {MyOrderRow} */
function bagRow(b, now, today) {
  const active = b.status === "reserved" && new Date(b.pickup_end) > now;
  // The bag's own page answers 404 after its day (rescue_reads.offer_detail),
  // so an older row opens the business instead.
  const href = b.date === today ? `/rescue/${b.offer_id}` : `/producer/${b.producer_id}`;
  return {
    kind: "bag", id: b.id, href, business: b.producer_name,
    status: b.cancelled_by_business ? "cancelled_by_business" : b.status,
    when: b.date,
    sortAt: active ? new Date(b.pickup_start).getTime() : dayMs(b.date),
    active,
  };
}

/**
 * @param {{ orders?: any[], groupBuys?: any[], bags?: any[] }} lists
 * @param {{ now: Date, today: string }} clock `today` is the Israel day, "YYYY-MM-DD"
 * @returns {{ active: MyOrderRow[], past: MyOrderRow[] }}
 */
export function mergeMyOrders(lists, clock) {
  const rows = [
    ...(lists.orders ?? []).map(orderRow),
    ...(lists.groupBuys ?? []).map((gb) => groupBuyRow(gb, clock.now)),
    ...(lists.bags ?? []).map((b) => bagRow(b, clock.now, clock.today)),
  ];
  // id breaks a tie, so two equal times never swap between loads.
  const tie = (/** @type {MyOrderRow} */ a, /** @type {MyOrderRow} */ b) =>
    a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
  const active = rows.filter((r) => r.active).sort((a, b) => a.sortAt - b.sortAt || tie(a, b));
  const past = rows.filter((r) => !r.active).sort((a, b) => b.sortAt - a.sortAt || tie(a, b));
  return { active, past };
}
