// @ts-check
/**
 * Module:   product-orders
 * Purpose:  The one place on-site ordering's business-side fetches, list
 *           groups and money/time formatting live, so the dashboard screens
 *           never re-derive them.
 * Touches:  GET/PUT /producers/me/order-settings · GET/PUT
 *           /producers/me/order-windows · GET /producers/me/product-orders ·
 *           POST /producers/me/product-orders/{id}/{action} ·
 *           GET /producers/{id}/order-menu (the slots a change may move to).
 * Does NOT: hold copy (every string is a `dashboard.producer.orders.*` key)
 *           and has NO build-time flag: the backend answers 404 on every
 *           route while PRODUCT_ORDERS_ENABLED is off, and `loadSettings`
 *           turns that 404 into `null`, which hides the tab and the page.
 *           One switch, on the server — no second env var to keep in step.
 * Related:  lib/generated/api.zod.js (response schemas, generated),
 *           backend/app/routers/product_order_business.py
 * History:  MEH-3316 (creation; stage 4 of MEH-3216)
 */

import api from "@/lib/api";
import {
  GetMyOrderSettingsProducersMeOrderSettingsGetResponse,
  GetMyOrderWindowsProducersMeOrderWindowsGetResponse,
  GetOrderMenuProducersProducerIdOrderMenuGetResponse,
  ListBusinessOrdersProducersMeProductOrdersGetResponse,
} from "@/lib/generated/api.zod";

const TZ = "Asia/Jerusalem";
const AGOROT_PER_SHEKEL = 100;
const LIST_LIMIT = 100;
const NOT_FOUND = 404;

// The four lists of the tab (approved copy: מחכות לטיפול / מאושרות / היום /
// הסתיימו). `today` is a time filter over the open statuses, not a status.
export const LIST_KEYS = /** @type {const} */ (["waiting", "confirmed", "today", "done"]);
export const OPEN_STATUSES = ["pending", "change_proposed", "confirmed", "ready"];
const GROUP_OF = {
  pending: "waiting",
  change_proposed: "waiting",
  confirmed: "confirmed",
  ready: "confirmed",
  handed: "done",
  declined: "done",
  cancelled: "done",
  expired: "done",
  no_show: "done",
};

/** "YYYY-MM-DD" of an instant on the Israel clock. */
export function israelDay(iso) {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  return new Intl.DateTimeFormat("en-CA", { timeZone: TZ }).format(d);
}

/**
 * Split orders into the four lists. Each list keeps the API's order
 * (soonest slot first); «הסתיימו» is newest first.
 * @param {any[]} orders
 * @param {Date} [now]
 * @returns {Record<string, any[]>}
 */
export function groupOrders(orders, now = new Date()) {
  /** @type {Record<string, any[]>} */
  const lists = { waiting: [], confirmed: [], today: [], done: [] };
  const today = israelDay(now.toISOString());
  for (const order of orders ?? []) {
    const group = GROUP_OF[/** @type {keyof typeof GROUP_OF} */ (order.status)];
    if (!group) continue;
    lists[group].push(order);
    if (group !== "done" && israelDay(order.slot_start) === today) lists.today.push(order);
  }
  lists.done.reverse();
  return lists;
}

/** Whole shekels when round, else two decimals. */
export function shekelsText(agorot) {
  if (typeof agorot !== "number" || !Number.isFinite(agorot)) return "";
  const value = agorot / AGOROT_PER_SHEKEL;
  return Number.isInteger(value) ? String(value) : value.toFixed(2);
}

/** What the buyer pays: the final total once set, else the estimate, plus delivery. */
export function toPayAgorot(order) {
  const goods = order.final_total_agorot ?? order.estimated_total_agorot ?? 0;
  return goods + (order.delivery_fee_agorot ?? 0);
}

/** HH:MM on the Israel clock. */
export function hhmm(iso) {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return new Intl.DateTimeFormat("he-IL", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
    timeZone: TZ,
  }).format(d);
}

/** «יום שישי 20.11» — the day of a slot, on the Israel clock. */
export function dayLabel(iso, locale = "he") {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const weekday = new Intl.DateTimeFormat(locale === "en" ? "en-GB" : "he-IL", {
    weekday: "long",
    timeZone: TZ,
  }).format(d);
  const [, month, day] = (israelDay(iso) ?? "").split("-");
  return `${weekday} ${Number(day)}.${Number(month)}`;
}

/** Shekels typed by the owner → agorot, or null when empty / not a number. */
export function agorotFromInput(text) {
  const clean = String(text ?? "").trim();
  if (clean === "") return null;
  const value = Number(clean);
  if (!Number.isFinite(value) || value < 0) return Number.NaN;
  return Math.round(value * AGOROT_PER_SHEKEL);
}

/**
 * The settings, or null when ordering does not exist on this server (404).
 * Any other failure throws, so the caller can show its error state.
 */
export async function loadSettings() {
  try {
    const { data } = await api.get("/producers/me/order-settings");
    return GetMyOrderSettingsProducersMeOrderSettingsGetResponse.parse(data);
  } catch (err) {
    if (/** @type {any} */ (err)?.response?.status === NOT_FOUND) return null;
    throw err;
  }
}

/** @param {Record<string, any>} body the whole form (every field required) */
export async function saveSettings(body) {
  const { data } = await api.put("/producers/me/order-settings", body);
  return GetMyOrderSettingsProducersMeOrderSettingsGetResponse.parse(data);
}

export async function loadWindows() {
  const { data } = await api.get("/producers/me/order-windows");
  return GetMyOrderWindowsProducersMeOrderWindowsGetResponse.parse(data).windows;
}

/** @param {any[]} windows the whole week */
export async function saveWindows(windows) {
  const { data } = await api.put("/producers/me/order-windows", { windows });
  return GetMyOrderWindowsProducersMeOrderWindowsGetResponse.parse(data).windows;
}

/** @param {string} [status] */
export async function loadOrders(status) {
  const params = status ? { status, limit: LIST_LIMIT } : { limit: LIST_LIMIT };
  const { data } = await api.get("/producers/me/product-orders", { params });
  return ListBusinessOrdersProducersMeProductOrdersGetResponse.parse(data);
}

/** How many orders wait for an answer (the tab's counter). */
export async function pendingCount() {
  const { data } = await api.get("/producers/me/product-orders", {
    params: { status: "pending", limit: 1 },
  });
  return ListBusinessOrdersProducersMeProductOrdersGetResponse.parse(data).total;
}

/**
 * One business action. Returns the updated order (the server's view).
 * @param {string} orderId
 * @param {"confirm"|"decline"|"propose-change"|"ready"|"handed"|"no-show"|"cancel"} action
 * @param {Record<string, any>} [body]
 */
export async function act(orderId, action, body = {}) {
  const { data } = await api.post(`/producers/me/product-orders/${orderId}/${action}`, body);
  return data;
}

/** The slots a proposed change may move to (the business's own windows). */
export async function offeredSlots(producerId) {
  const { data } = await api.get(`/producers/${producerId}/order-menu`);
  return GetOrderMenuProducersProducerIdOrderMenuGetResponse.parse(data).slots ?? [];
}
