// @ts-check
/**
 * Module:   weekly-menu-share
 * Purpose:  «מה יש השבוע»: the ready WhatsApp message a business sends to her
 *           customers, a group or her status. It lists what can be ordered this
 *           week, the days that are open and the order link.
 * Touches:  nothing: pure text from the owner's menu preview.
 * Does NOT: read the menu (OrderWeekShareCard.jsx does, through the owner's
 *           preview route) or send anything. WhatsApp opens with the text and
 *           she picks the chat herself.
 * Related:  components/dashboard/orders/OrderWeekShareCard.jsx (the one caller),
 *           lib/product-orders.js `israelDay` / `dayLabel` (the day words)
 * History:  MEH-3931 (creation, 27/11/2026)
 */

import { dayLabel, israelDay } from "@/lib/product-orders";
import { israelToday } from "@/lib/israel-date";
import { agorotToShekels } from "@/lib/money";
import { formatPriceRange } from "@/lib/utils";
import { isOpen, israelWeekday } from "@/lib/product-weekdays";
import { isolate } from "@/lib/bidi";  // MEH-3978

const WEEK_DAYS = 7;

/**
 * The Israel days of the coming seven (today included) with an open slot,
 * each once, soonest first.
 * @param {{ slots?: { start: string }[] }} menu
 * @param {Date} [now]
 * @returns {string[]}
 */
export function weekDays(menu, now = new Date()) {
  const today = israelToday(now);
  // The seventh calendar date from today, not 7 × 24 hours (MEH-2290).
  const last = new Date(`${today}T12:00:00Z`);
  last.setUTCDate(last.getUTCDate() + WEEK_DAYS - 1);
  const end = israelToday(last);
  const days = (menu.slots ?? [])
    .map((s) => israelDay(s.start))
    .filter((d) => d !== null && d >= today && d <= end);
  return [...new Set(/** @type {string[]} */ (days))].sort();
}

/**
 * «32₪», «40₪–60₪», plus «לק״ג» / «ל-100 גרם» for a price that is not per unit.
 * With sizes or flavours (MEH-3617), the range of the ones in stock: each
 * carries the price the order stores.
 * @param {{ price_min_agorot: number, price_max_agorot: number, price_unit: string, variants?: { price_agorot: number, in_stock: boolean }[] }} product
 * @param {(key: string) => string} tUnit the `price_unit` translator
 */
function priceText(product, tUnit) {
  const sold = (product.variants ?? []).filter((v) => v.in_stock).map((v) => v.price_agorot);
  const low = sold.length ? Math.min(...sold) : product.price_min_agorot;
  const high = sold.length ? Math.max(...sold) : product.price_max_agorot;
  const range = formatPriceRange(agorotToShekels(low), agorotToShekels(high));
  if (!range) return "";
  return product.price_unit === "unit" ? range : `${range} ${tUnit(product.price_unit)}`;
}

/**
 * The message, or null when there is nothing to offer this week (no product
 * in stock, or no open day).
 * @param {{
 *   menu: any,
 *   name: string,
 *   url: string,
 *   locale: string,
 *   t: (key: string, values?: Record<string, string>) => string,
 *   tUnit: (key: string) => string,
 *   now?: Date,
 * }} args  t: dashboard.producer.orders.share
 * @returns {string | null}
 */
export function weekMenuText({ menu, name, url, locale, t, tUnit, now = new Date() }) {
  const days = weekDays(menu, now);
  // Noon UTC is the same date on the Israel clock, winter and summer.
  const words = (/** @type {string[]} */ list) => list.map((d) => dayLabel(`${d}T12:00:00Z`, locale)).join(", ");
  const lines = [];
  for (const product of menu.products ?? []) {
    if (!product.in_stock) continue;
    // MEH-3618: a product made on some days only is offered on those days.
    const own = days.filter((d) => isOpen(product.available_weekdays, israelWeekday(`${d}T12:00:00Z`)));
    if (own.length === 0) continue;
    const price = priceText(product, tUnit);
    const line = price ? `• ${isolate(product.name)} · ${price}` : `• ${isolate(product.name)}`;
    lines.push(own.length < days.length ? `${line} · ${t("message.only", { days: words(own) })}` : line);
  }
  if (lines.length === 0) return null;
  const dayWords = words(days);
  return [
    t("message.title", { name: isolate(name) }),
    "",
    ...lines,
    "",
    t("message.days", { days: dayWords }),
    t("message.order", { url }),
  ].join("\n");
}
