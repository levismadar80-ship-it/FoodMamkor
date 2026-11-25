// @ts-check
"use client";
/**
 * Module:   WeekdayChips
 * Purpose:  Pick days of the week as chips, Sunday first, on the shared mask
 *           (Sunday = 1 … Saturday = 64, lib/product-weekdays.js). An optional
 *           «כל הימים» chip stands for null.
 * Does NOT: label itself or say why a choice is refused — the host field does.
 * Related:  components/dashboard/ProductWeekdaysField.jsx (a product's days),
 *           components/dashboard/RescueScheduleForm.jsx (a bag routine's days)
 * History:  MEH-3703 (moved out of ProductWeekdaysField, rule of two);
 *           follow-up: the seven chips alone share one row (they wrapped
 *           «ש׳» onto a second line at 375).
 *
 * Without «כל הימים» the seven chips sit in a 7-column grid, so they always
 * fit one row, the way a calendar's repeat picker does. Each keeps the 44px
 * height; at 375 each is about 40px wide, and max-w-sm keeps them chip-sized
 * on a desktop. With «כל הימים» the eight chips
 * still wrap, as before.
 */

import { useTranslations } from "next-intl";

import { daysOf, DAYS_IN_WEEK, maskOf } from "@/lib/product-weekdays";

const CHIP = "inline-flex items-center justify-center min-h-touch min-w-11 rounded-full border px-3 py-2 text-sm text-text transition focus-ring";
// In the 7-column row the column sets the width.
const ROW_CHIP = CHIP.replace("min-w-11", "min-w-0").replace("px-3", "px-0");
const ON = "border-primary bg-green-50";
const OFF = "border-border bg-surface hover:border-primary";

/**
 * @param {{ labelledBy: string, value: number | null | undefined, onChange: (mask: number | null) => void,
 *   everyLabel?: string | null, testIdPrefix: string, everyTestId?: string }} props
 *   everyLabel — the «כל הימים» chip's text; null leaves it out, and then
 *   every day chosen is sent as the full mask (127), not null.
 */
export default function WeekdayChips({ labelledBy, value, onChange, everyLabel = null, testIdPrefix, everyTestId = `${testIdPrefix}-every` }) {
  const t = useTranslations("product_weekdays");
  const withEvery = everyLabel !== null;
  const every = withEvery && (value === null || value === undefined);
  const chosen = every ? [] : daysOf(value);
  const short = t("days_short").split(",");
  const long = t("days_long").split(",");
  const toggle = (/** @type {number} */ day) => {
    const next = chosen.includes(day) ? chosen.filter((d) => d !== day) : [...chosen, day];
    if (next.length === 0) return onChange(0);
    const mask = maskOf(next);
    onChange(mask === null && !withEvery ? (1 << DAYS_IN_WEEK) - 1 : mask);
  };
  return (
    <div role="group" aria-labelledby={labelledBy} className={withEvery ? "flex flex-wrap gap-2" : "grid grid-cols-7 gap-1 max-w-sm"}>
      {withEvery && (
        <button type="button" aria-pressed={every} onClick={() => onChange(null)} className={`${CHIP} ${every ? ON : OFF}`} data-testid={everyTestId}>
          {everyLabel}
        </button>
      )}
      {[...Array(DAYS_IN_WEEK).keys()].map((day) => (
        <button key={day} type="button" aria-pressed={chosen.includes(day)} aria-label={long[day]} onClick={() => toggle(day)}
          className={`${withEvery ? CHIP : ROW_CHIP} ${chosen.includes(day) ? ON : OFF}`} data-testid={`${testIdPrefix}-${day}`}>
          {short[day]}
        </button>
      ))}
    </div>
  );
}
