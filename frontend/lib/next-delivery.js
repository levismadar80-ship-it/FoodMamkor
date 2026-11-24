// @ts-check
/**
 * Module:   next-delivery
 * Purpose:  The date of a business's next delivery to a city — «המשלוח הבא:
 *           יום שלישי 24.11» (MEH-3485) — from the city's delivery days and
 *           the business's weekly order window.
 * Touches:  nothing — pure, the clock is a parameter.
 * Does NOT: render or translate (components/NextDeliveryLine.jsx does), and
 *           does not read special_hours (a holiday closure is not a delivery
 *           rule the data states).
 * Related:  lib/order-window-status.js `getSingleOrderCutoff` (MEH-1646: a cutoff is
 *           stated only when exactly one order day is open), lib/israel-date.js.
 * History:  MEH-3485 (creation); MEH-3512 (a row's own cutoff — a pickup
 *           point's «מזמינים עד» — wins over the business order window).
 *
 * The rule, as posted to Sapir 20/11:
 *   - one clear order cutoff (e.g. orders until Monday 12:00) → the first
 *     delivery day on or after the next cutoff's date. That can be today:
 *     orders until Friday 10:00 with a Friday run, read at 09:00, is today;
 *   - no cutoff, or several order days → the first delivery day from tomorrow.
 *     Never today: whether an order placed now still makes today's run is not
 *     something the data says;
 *   - no date for a city with no delivery day, or a business on vacation.
 */
import { DELIVERY_DAYS } from "@/lib/delivery-days";
import { getSingleOrderCutoff, israelNowParts, toMinutes } from "@/lib/order-window-status";
import { israelToday } from "@/lib/israel-date";

const DAYS_IN_WEEK = 7;

/** @param {string} iso @param {number} days */
function addDaysIso(iso, days) {
  const [y, m, d] = iso.split("-").map(Number);
  // guard-ok: UTC date arithmetic on a fixed ISO input, not a clock read
  return new Date(Date.UTC(y, m - 1, d + days)).toISOString().slice(0, 10);
}

/**
 * Days from today (Israel) to where the search for a delivery day starts.
 * @param {{dayIndex: number, close: string} | null} cutoff
 * @param {{dayIndex: number, minutes: number}} now
 */
function searchStart(cutoff, now) {
  const close = cutoff ? toMinutes(cutoff.close) : null;
  if (!cutoff || close === null) return 1;
  const ahead = (cutoff.dayIndex - now.dayIndex + DAYS_IN_WEEK) % DAYS_IN_WEEK;
  // Today is the cutoff day but orders already closed → next week's cutoff.
  return ahead === 0 && now.minutes >= close ? DAYS_IN_WEEK : ahead;
}

/**
 * A delivery row's days: `delivery_days` when the row carries them (MEH-3484),
 * else its single `delivery_day`.
 * @param {{ delivery_day?: string | null, delivery_days?: string[] | null } | null | undefined} row
 * @returns {string[]}
 */
export function daysOfRow(row) {
  const many = (row?.delivery_days || []).filter(Boolean);
  if (many.length) return many;
  return row?.delivery_day ? [row.delivery_day] : [];
}

/**
 * MEH-3512: a row's own cutoff (`order_cutoff_day` + `order_cutoff_time`) in
 * the `{dayIndex, close}` shape getSingleOrderCutoff returns — null when the
 * row states none (or half of one), so the business order window applies.
 * @param {{ order_cutoff_day?: string | null, order_cutoff_time?: string | null } | null | undefined} row
 * @returns {{ dayIndex: number, close: string } | null}
 */
export function cutoffOfRow(row) {
  const dayIndex = DELIVERY_DAYS.indexOf(row?.order_cutoff_day || "");
  const close = row?.order_cutoff_time || "";
  if (dayIndex < 0 || toMinutes(close) === null) return null;
  return { dayIndex, close };
}

/**
 * MEH-3511: the cutoff a set of rows shares (a day group, a zone) — null when
 * any row states none or two rows differ, so the business window applies.
 * @param {Array<{ order_cutoff_day?: string | null, order_cutoff_time?: string | null }>} rows
 */
export function sharedCutoff(rows) {
  const cuts = (rows || []).map(cutoffOfRow);
  const first = cuts[0];
  if (!first) return null;
  const same = cuts.every((c) => c && c.dayIndex === first.dayIndex && c.close === first.close);
  return same ? first : null;
}

/**
 * @param {{ days?: string[] | null, orderWindow?: object | null,
 *   cutoff?: { dayIndex: number, close: string } | null,
 *   onVacation?: boolean, now?: Date }} args — `cutoff` (MEH-3512), when
 *   given, replaces the one derived from `orderWindow`. — `days` are bare Hebrew day
 *   names (lib/delivery-days.js); anything else is ignored.
 * @returns {{ date: string, dayIndex: number } | null} `date` is the Israel
 *   calendar day `YYYY-MM-DD`; `dayIndex` Sunday=0 … Saturday=6.
 */
export function nextDeliveryDate({ days, orderWindow = null, cutoff = null, onVacation = false, now = new Date() }) {
  if (onVacation) return null;
  const wanted = new Set((days || []).map((d) => DELIVERY_DAYS.indexOf(d)).filter((i) => i >= 0));
  if (wanted.size === 0) return null;
  const parts = israelNowParts(now);
  const today = israelToday(now);
  const from = searchStart(cutoff || getSingleOrderCutoff(orderWindow), parts);
  for (let k = from; k < from + DAYS_IN_WEEK; k += 1) {
    const dayIndex = (parts.dayIndex + k) % DAYS_IN_WEEK;
    if (wanted.has(dayIndex)) return { date: addDaysIso(today, k), dayIndex };
  }
  return null;
}
