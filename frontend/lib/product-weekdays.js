// @ts-check
/**
 * Module:   product-weekdays
 * Purpose:  The days a product is made (MEH-3618): `available_weekdays` is a
 *           bitmask, Sunday = 1 … Saturday = 64, null = every day. The line
 *           under a product («זמין בימי שישי» / «זמין בימים ה׳–ו׳»), the slots
 *           an order sheet may offer for a cart, and the product that
 *           leaves it with none.
 * Does NOT: refuse an order — the server does (services/product_weekdays.py),
 *           on the same Israel clock.
 * Related:  backend/app/utils/weekdays.py (the same bits),
 *           components/dashboard/ProductWeekdaysField.jsx (the editor),
 *           components/public/OrderSheet.jsx (the slots)
 * History:  MEH-3618 (creation)
 */

import { splitKey } from "@/lib/product-variants";

export const DAYS_IN_WEEK = 7;
export const ALL_DAYS_MASK = (1 << DAYS_IN_WEEK) - 1; // 127
const TZ = "Asia/Jerusalem";
const EN_DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

/** @param {number | null | undefined} mask @returns {number[]} 0 = Sunday … 6 = Saturday */
export function daysOf(mask) {
  const all = [...Array(DAYS_IN_WEEK).keys()];
  return typeof mask === "number" ? all.filter((d) => (mask & (1 << d)) !== 0) : all;
}

/** The mask of a set of days: every day is null, no day is 0 (refused on save). @param {number[]} days */
export function maskOf(days) {
  const mask = days.reduce((m, d) => m | (1 << d), 0);
  return mask === ALL_DAYS_MASK ? null : mask;
}

/** @param {number | null | undefined} mask @param {number} weekday */
export function isOpen(mask, weekday) {
  return typeof mask !== "number" || (mask & (1 << weekday)) !== 0;
}

/** @param {any} product */
export function isLimited(product) {
  return typeof product?.available_weekdays === "number";
}

/** The Israel-clock day of an instant, 0 = Sunday. @param {string} iso */
export function israelWeekday(iso) {
  const name = new Intl.DateTimeFormat("en-US", { weekday: "short", timeZone: TZ }).format(new Date(iso));
  return EN_DAYS.indexOf(name);
}

/**
 * Runs of consecutive days, e.g. [4, 5] → [[4, 5]], [0, 2, 3] → [[0], [2, 3]].
 * The week does not wrap: Saturday and Sunday are two runs.
 * @param {number[]} days
 */
function runsOf(days) {
  /** @type {number[][]} */
  const runs = [];
  for (const d of days) {
    const last = runs[runs.length - 1];
    if (last && last[last.length - 1] === d - 1) last.push(d);
    else runs.push([d]);
  }
  return runs;
}

/**
 * The line under a limited product, or null for every day.
 * @param {number | null | undefined} mask
 * @param {(key: string, values?: any) => string} t  product_weekdays translator
 */
export function weekdaysLine(mask, t) {
  if (typeof mask !== "number" || mask === ALL_DAYS_MASK) return null;
  const days = daysOf(mask);
  if (days.length === 0) return null;
  if (days.length === 1) return t("line_one", { day: t("days_long").split(",")[days[0]] });
  const short = t("days_short").split(",");
  const text = runsOf(days)
    .map((run) => (run.length === 1 ? short[run[0]] : `${short[run[0]]}–${short[run[run.length - 1]]}`))
    .join(", ");
  return t("line_many", { days: text });
}

/**
 * The slots on days every product in `products` is made.
 * @template {{ start: string }} S
 * @param {S[]} slots
 * @param {any[]} products
 * @returns {S[]}
 */
export function slotsForProducts(slots, products) {
  const masks = products.filter(isLimited).map((p) => p.available_weekdays);
  if (masks.length === 0) return slots;
  return slots.filter((s) => {
    const day = israelWeekday(s.start);
    return masks.every((m) => isOpen(m, day));
  });
}

/**
 * When `products` leave no slot, the one to name: the limited product whose
 * removal brings a slot back, the one made on the fewest days first. Null
 * while a slot is left, or when no limited product is to blame.
 * @param {{ start: string }[]} slots
 * @param {any[]} products
 */
export function limitingProduct(slots, products) {
  if (slots.length === 0 || slotsForProducts(slots, products).length > 0) return null;
  const limited = products.filter(isLimited).sort((a, b) => daysOf(a.available_weekdays).length - daysOf(b.available_weekdays).length);
  const freeing = limited.find((p) => slotsForProducts(slots, products.filter((q) => q !== p)).length > 0);
  return freeing ?? limited[0] ?? null;
}

/** The pick keys of one product (a key per variant). @param {Record<string, number>} picks @param {string} productId */
export function keysOf(picks, productId) {
  return Object.keys(picks).filter((k) => splitKey(k).productId === productId);
}

/**
 * The slots a cart may take, and the product to name when there are none.
 * @template {{ start: string }} S
 * @param {S[]} offered  the business's slots for this fulfilment
 * @param {Record<string, number>} picks
 * @param {Map<string, any>} byId
 */
export function cartSlots(offered, picks, byId) {
  const ids = [...new Set(Object.keys(picks).map((k) => splitKey(k).productId))];
  const products = ids.map((id) => byId.get(id)).filter(Boolean);
  return { slots: slotsForProducts(offered, products), limiting: limitingProduct(offered, products) };
}
