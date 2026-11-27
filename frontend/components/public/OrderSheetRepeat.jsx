// @ts-check
"use client";

/**
 * Module:   OrderSheetRepeat
 * Purpose:  «להזמין את זה שוב כל שבוע» in the order sheet (MEH-3933), with the
 *           day and time it will repeat on once a slot is picked.
 * Touches:  nothing — the sheet sends `repeat_weekly` with the order.
 * Does NOT: check the caps (3 per phone, 300 per business): the server
 *           refuses with a Hebrew 409, shown by the sheet like any refusal.
 * Related:  components/public/OrderSheet.jsx, lib/order-repeat.js
 * History:  MEH-3933 (creation, 27/11/2026)
 */

import { useTranslations } from "next-intl";

import Checkbox from "@/components/ui/Checkbox";
import { repeatWhen } from "@/lib/order-repeat";

/** @param {{ slot: string, checked: boolean, onChange: (checked: boolean) => void }} props */
export default function OrderSheetRepeat({ slot, checked, onChange }) {
  const t = useTranslations("order_repeat");
  const tDays = useTranslations("product_weekdays");
  return (
    <div className="space-y-1">
      <Checkbox
        className="flex items-start gap-2 text-sm text-text"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        data-testid="order-sheet-repeat"
      >
        {t("sheet_label")}
      </Checkbox>
      {checked && (
        <p className="text-sm text-fg-muted ps-7" data-testid="order-sheet-repeat-hint">
          {slot ? t("sheet_hint", repeatWhen(slot, tDays("days_long"))) : t("sheet_hint_no_slot")}
        </p>
      )}
    </div>
  );
}
