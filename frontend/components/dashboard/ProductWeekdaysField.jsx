// @ts-check
"use client";
/**
 * Module:   ProductWeekdaysField
 * Purpose:  «ימים שהמוצר זמין» in the owner's product form (MEH-3618):
 *           «כל הימים» (the default) or some of the seven days, as chips.
 *           Holds the mask in the form; the form's own «שמירה» sends it.
 * Does NOT: save — the product form does, and refuses a form with no day
 *           (weekdaysMissing) before the request.
 * Related:  lib/product-weekdays.js (the bits), components/ProductsSection.jsx
 *           (the host, add and edit forms)
 * History:  MEH-3618 (creation)
 */

import { useTranslations } from "next-intl";

import InlineMessage from "@/components/ui/InlineMessage";
import { daysOf, DAYS_IN_WEEK, maskOf } from "@/lib/product-weekdays";

const CHIP = "inline-flex items-center justify-center min-h-touch min-w-11 rounded-full border px-3 py-2 text-sm text-text transition focus-ring";
const ON = "border-primary bg-green-50";
const OFF = "border-border bg-surface hover:border-primary";

/** Whether a form's mask has no day at all (0), which cannot be saved. @param {number | null | undefined} mask */
export function weekdaysMissing(mask) {
  return mask === 0;
}

/** @param {{ idPrefix: string, value: number | null | undefined, onChange: (mask: number | null) => void }} props */
export default function ProductWeekdaysField({ idPrefix, value, onChange }) {
  const t = useTranslations("product_weekdays");
  const every = value === null || value === undefined;
  const chosen = every ? [] : daysOf(value);
  const short = t("days_short").split(",");
  const long = t("days_long").split(",");
  const toggle = (/** @type {number} */ day) => {
    const next = chosen.includes(day) ? chosen.filter((d) => d !== day) : [...chosen, day];
    onChange(next.length === 0 ? 0 : maskOf(next));
  };
  return (
    <div data-testid="product-weekdays-field">
      <p id={`${idPrefix}-weekdays-heading`} className="text-xs text-fg-muted mb-1">{t("editor_title")}</p>
      <p className="text-xs text-fg-muted mb-2">{t("editor_where")}</p>
      <div role="group" aria-labelledby={`${idPrefix}-weekdays-heading`} className="flex flex-wrap gap-2">
        <button type="button" aria-pressed={every} onClick={() => onChange(null)} className={`${CHIP} ${every ? ON : OFF}`} data-testid="product-weekdays-every">
          {t("every_day")}
        </button>
        {[...Array(DAYS_IN_WEEK).keys()].map((day) => (
          <button key={day} type="button" aria-pressed={chosen.includes(day)} aria-label={long[day]} onClick={() => toggle(day)}
            className={`${CHIP} ${chosen.includes(day) ? ON : OFF}`} data-testid={`product-weekday-${day}`}>
            {short[day]}
          </button>
        ))}
      </div>
      {weekdaysMissing(value) && <InlineMessage tone="error" className="mt-1">{t("none_picked")}</InlineMessage>}
    </div>
  );
}
