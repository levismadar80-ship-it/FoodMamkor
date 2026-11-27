// @ts-check
/**
 * Module:   daily-stock-owner
 * Purpose:  The owner's side of daily stock: read the week's prep list
 *           («מה להכין») and name its days.
 * Touches:  GET /producers/me/orders/prep.
 * Does NOT: set a limit — lib/orderable-products.js saves the product row
 *           (saveProductOrdering). Does NOT count: the server does.
 * Related:  components/dashboard/orders/OrderPrepList.jsx,
 *           backend/app/services/product_daily_stock.py::prep_list
 * History:  Daily stock (Fischgrund bakery, 27/11/2026; creation)
 */

import api from "@/lib/api";
import { GetMyPrepListProducersMeOrdersPrepGetResponse } from "@/lib/generated/api.zod";
import { dayLabel } from "@/lib/product-orders";
import { israelToday } from "@/lib/israel-date";

/** @returns {Promise<any[]>} the days that have an order, soonest first */
export async function loadPrepList() {
  const { data } = await api.get("/producers/me/orders/prep");
  return GetMyPrepListProducersMeOrdersPrepGetResponse.parse(data).days;
}


/**
 * «היום» / «מחר» / «יום שישי 4.12».
 * @param {string} day "YYYY-MM-DD" on the Israel clock
 * @param {string} locale
 * @param {(key: string) => string} t the orders translator (dashboard.producer.orders)
 * @param {Date} [now]
 */
export function prepDayName(day, locale, t, now = new Date()) {
  const today = israelToday(now);
  if (day === today) return t("tabs.today");
  // The next calendar date, not +24 hours (the night the clock goes back is 25).
  const next = new Date(`${today}T12:00:00Z`);
  next.setUTCDate(next.getUTCDate() + 1);
  if (day === israelToday(next)) return t("prep.tomorrow");
  // Noon UTC is the same date on the Israel clock, winter and summer.
  return dayLabel(`${day}T12:00:00Z`, locale);
}

/**
 * A day's lines, with one more after the sizes of a product that has a limit
 * for all its sizes together: their sum against that limit.
 * @param {any[]} lines the server's lines (sizes of one product are adjacent)
 * @returns {any[]}
 */
export function prepRows(lines) {
  /** @type {any[]} */
  const out = [];
  lines.forEach((line, i) => {
    out.push(line);
    const next = lines[i + 1];
    const last = !next || next.product_id !== line.product_id;
    if (!last || !line.variant_id || typeof line.product_limit !== "number") return;
    const sizes = lines.filter((l) => l.product_id === line.product_id && Boolean(l.variant_id));
    out.push({
      product_id: line.product_id,
      variant_id: "all",
      name: line.name,
      variant_name: null,
      all: true,
      confirmed: sizes.reduce((n, l) => n + l.confirmed, 0),
      waiting: sizes.reduce((n, l) => n + l.waiting, 0),
      limit: line.product_limit,
    });
  });
  return out;
}
