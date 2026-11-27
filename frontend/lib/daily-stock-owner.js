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

const DAY_MS = 86_400_000;

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
  if (day === israelToday(new Date(now.getTime() + DAY_MS))) return t("prep.tomorrow");
  // Noon UTC is the same date on the Israel clock, winter and summer.
  return dayLabel(`${day}T12:00:00Z`, locale);
}
