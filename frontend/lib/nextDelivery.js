// @ts-check
/**
 * Module:   nextDelivery
 * Purpose:  The date of a business's next delivery to a city — «המשלוח הבא:
 *           יום שלישי 24.11» (MEH-3485) — from the city's delivery days and
 *           the business's weekly order window.
 * Touches:  nothing — pure, the clock is a parameter.
 * Does NOT: render or translate (components/NextDeliveryLine.jsx does), and
 *           does not read special_hours (a holiday closure is not a delivery
 *           rule the data states).
 * Related:  lib/orderWindow.js `getSingleOrderCutoff` (MEH-1646: a cutoff is
 *           stated only when exactly one order day is open), lib/israel-date.js.
 * History:  MEH-3485 (creation).
 *
 * The rule, as posted to Sapir 20/11:
 *   - one clear order cutoff (e.g. orders until Monday 12:00) → the first
 *     delivery day on or after the next cutoff's date;
 *   - no cutoff, or several order days → the first delivery day from tomorrow.
 *     Never today: whether an order placed now still makes today's run is not
 *     something the data says;
 *   - no date for a city with no delivery day, or a business on vacation.
 */
import { DELIVERY_DAYS } from "@/lib/delivery-days";
import { getSingleOrderCutoff, israelNowParts } from "@/lib/orderWindow";
import { israelToday } from "@/lib/israel-date";

const DAYS_IN_WEEK = 7;
const MINUTES_PER_HOUR = 60;

/** @param {string} iso @param {number} days */
function addDaysIso(iso, days) {
  const [y, m, d] = iso.split("-").map(Number);
  // guard-ok: UTC date arithmetic on a fixed ISO input, not a clock read
  return new Date(Date.UTC(y, m - 1, d + days)).toISOString().slice(0, 10);
}

/** "HH:MM" → minutes since midnight; null when malformed. @param {string} hhmm */
function toMinutes(hhmm) {
  const m = /^(\d{2}):(\d{2})$/.exec(hhmm || "");
  return m ? Number(m[1]) * MINUTES_PER_HOUR + Number(m[2]) : null;
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
 * @param {{ days?: string[] | null, orderWindow?: object | null,
 *   onVacation?: boolean, now?: Date }} args — `days` are bare Hebrew day
 *   names (lib/delivery-days.js); anything else is ignored.
 * @returns {{ date: string, dayIndex: number } | null} `date` is the Israel
 *   calendar day `YYYY-MM-DD`; `dayIndex` Sunday=0 … Saturday=6.
 */
export function nextDeliveryDate({ days, orderWindow = null, onVacation = false, now = new Date() }) {
  if (onVacation) return null;
  const wanted = new Set((days || []).map((d) => DELIVERY_DAYS.indexOf(d)).filter((i) => i >= 0));
  if (wanted.size === 0) return null;
  const parts = israelNowParts(now);
  const today = israelToday(now);
  const from = searchStart(getSingleOrderCutoff(orderWindow), parts);
  for (let k = from; k < from + DAYS_IN_WEEK; k += 1) {
    const dayIndex = (parts.dayIndex + k) % DAYS_IN_WEEK;
    if (wanted.has(dayIndex)) return { date: addDaysIso(today, k), dayIndex };
  }
  return null;
}
