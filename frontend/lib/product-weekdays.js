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
 * History:  MEH-3618 (creation) · MEH-3932 (`lead_days`: a product ordered
 *           some days ahead takes only slots that far off, on the same
 *           Israel clock as services/product_lead_days.py)
 */

import { israelToday } from "@/lib/israel-date";
import { splitKey } from "@/lib/product-variants";

export const DAYS_IN_WEEK = 7;
const ALL_DAYS_MASK = (1 << DAYS_IN_WEEK) - 1; // 127
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
function isLimited(product) {
  return typeof product?.available_weekdays === "number" || typeof product?.lead_days === "number";
}

const DAY_MS = 86400000;

/** Whole Israel days from `today` to the slot's day. @param {string} today YYYY-MM-DD @param {string} iso */
export function daysAhead(today, iso) {
  return Math.round((Date.parse(`${israelToday(new Date(iso))}T00:00:00Z`) - Date.parse(`${today}T00:00:00Z`)) / DAY_MS);
}

/**
 * The product takes a slot: made on its day (MEH-3618) and at least
 * `lead_days` Israel days off (MEH-3932).
 * @param {any} product @param {string} iso @param {string} today YYYY-MM-DD
 */
export function takesSlot(product, iso, today) {
  if (!isOpen(product?.available_weekdays, israelWeekday(iso))) return false;
  return typeof product?.lead_days !== "number" || daysAhead(today, iso) >= product.lead_days;
}

/**
 * «זמין בימי שישי», «צריך להזמין יומיים מראש», or both, for the line under a
 * product and the order sheet's conflict. Null when neither applies.
 * @param {any} product
 * @param {(key: string, values?: any) => string} t  product_weekdays translator
 */
export function availabilityLine(product, t) {
  const parts = [weekdaysLine(product?.available_weekdays, t)];
  if (typeof product?.lead_days === "number") parts.push(t("lead_line", { n: product.lead_days }));
  const text = parts.filter(Boolean).join(" · ");
  return text || null;
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
 * The slots every product in `products` takes (its days, its lead).
 * @template {{ start: string }} S
 * @param {S[]} slots
 * @param {any[]} products
 * @param {Date} [now]
 * @returns {S[]}
 */
export function slotsForProducts(slots, products, now = new Date()) {
  const limited = products.filter(isLimited);
  if (limited.length === 0) return slots;
  const today = israelToday(now);
  return slots.filter((s) => limited.every((p) => takesSlot(p, s.start, today)));
}

/**
 * When `products` leave no slot, the one to name: the limited product whose
 * removal brings a slot back, the one made on the fewest days first. Null
 * while a slot is left, or when no limited product is to blame.
 * @param {{ start: string }[]} slots
 * @param {any[]} products
 * @param {Date} [now]
 */
export function limitingProduct(slots, products, now = new Date()) {
  if (slots.length === 0 || slotsForProducts(slots, products, now).length > 0) return null;
  const limited = products.filter(isLimited).sort((a, b) => slotsForProducts(slots, [a], now).length - slotsForProducts(slots, [b], now).length);
  const freeing = limited.find((p) => slotsForProducts(slots, products.filter((q) => q !== p), now).length > 0);
  return freeing ?? limited[0] ?? null;
}

/** The pick keys of one product (a key per variant). @param {Record<string, number>} picks @param {string} productId */
function keysOf(picks, productId) {
  return Object.keys(picks).filter((k) => splitKey(k).productId === productId);
}

/**
 * The slots a cart may take, and the product to name when there are none.
 * @template {{ start: string }} S
 * @param {S[]} offered  the business's slots for this fulfilment
 * @param {Record<string, number>} picks
 * @param {Map<string, any>} byId
 * @param {Date} [now]
 */
export function cartSlots(offered, picks, byId, now = new Date()) {
  const ids = [...new Set(Object.keys(picks).map((k) => splitKey(k).productId))];
  const products = ids.map((id) => byId.get(id)).filter(Boolean);
  return { slots: slotsForProducts(offered, products, now), limiting: limitingProduct(offered, products, now) };
}

/**
 * The ways (pickup / delivery) the cart can take on a day all its products
 * are made. All of them when none can, so the sheet names the product.
 * @template {string} W
 * @param {W[]} ways
 * @param {{ slotsOf: (way: W) => { start: string }[], picks: Record<string, number>, byId: Map<string, any> }} cart
 * @returns {W[]}
 */
export function cartWays(ways, { slotsOf, picks, byId }) {
  const open = ways.filter((w) => cartSlots(slotsOf(w), picks, byId).slots.length > 0);
  return open.length > 0 ? open : ways;
}

/**
 * Takes one product (every variant line) out of the cart; closes the sheet
 * when that empties it, since an empty cart has no sheet to show.
 * @param {string} productId
 * @param {{ picks: Record<string, number>, onChange: (key: string, qty: number) => void, onClose: () => void }} cart
 */
export function removeFromCart(productId, { picks, onChange, onClose }) {
  const keys = keysOf(picks, productId);
  keys.forEach((k) => onChange(k, 0));
  if (keys.length === Object.keys(picks).length) onClose();
}
