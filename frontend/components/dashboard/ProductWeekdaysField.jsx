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
 * History:  MEH-3618 (creation); MEH-3703 (chips moved to ui/WeekdayChips)
 */

import { useTranslations } from "next-intl";

import InlineMessage from "@/components/ui/InlineMessage";
import WeekdayChips from "@/components/ui/WeekdayChips";

/** Whether a form's mask has no day at all (0), which cannot be saved. @param {number | null | undefined} mask */
export function weekdaysMissing(mask) {
  return mask === 0;
}

/** @param {{ idPrefix: string, value: number | null | undefined, onChange: (mask: number | null) => void }} props */
export default function ProductWeekdaysField({ idPrefix, value, onChange }) {
  const t = useTranslations("product_weekdays");
  return (
    <div data-testid="product-weekdays-field">
      <p id={`${idPrefix}-weekdays-heading`} className="text-xs text-fg-muted mb-1">{t("editor_title")}</p>
      <p className="text-xs text-fg-muted mb-2">{t("editor_where")}</p>
      {/* MEH-3703: the chips are ui/WeekdayChips now; testids unchanged. */}
      <WeekdayChips labelledBy={`${idPrefix}-weekdays-heading`} value={value} onChange={onChange}
        everyLabel={t("every_day")} testIdPrefix="product-weekday" everyTestId="product-weekdays-every" />
      {weekdaysMissing(value) && <InlineMessage tone="error" className="mt-1">{t("none_picked")}</InlineMessage>}
    </div>
  );
}
