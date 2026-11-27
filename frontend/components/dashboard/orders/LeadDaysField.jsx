// @ts-check
"use client";

/**
 * Module:   LeadDaysField
 * Purpose:  «כמה זמן מראש צריך להזמין» in a product row of the orders tab
 *           (MEH-3932): the product is offered only for pickup days at least
 *           that many days off, on the Israel clock. A select, not free text
 *           (dashboard-field-guidance-audit). Saves on change.
 * Touches:  nothing itself — the caller saves (OrderProductsCard.jsx, through
 *           PUT /producers/me/products/{id}/ordering).
 * Does NOT: replace the business's «כמה שעות מראש» setting
 *           (OrderSettingsCard.jsx), which applies to every product. Does NOT
 *           refuse an order — the server does
 *           (backend/app/services/product_lead_days.py).
 * Related:  lib/product-weekdays.js `takesSlot` (the same rule in the sheet)
 * History:  MEH-3932 (creation, 27/11/2026)
 */

import { useTranslations } from "next-intl";

import Select from "@/components/ui/Select";

/**
 * The days she can pick, up to the server's cap (product_lead_days.py
 * LEAD_DAYS_MAX = 7). Slots are offered two weeks ahead, so 7 still leaves a
 * week to choose from; 14 would leave none.
 */
export const LEAD_DAY_CHOICES = [1, 2, 3, 4, 5, 6, 7];

/**
 * @param {{ id: string, value: number | null | undefined, busy: boolean, onSave: (days: number | null) => void }} props
 */
export default function LeadDaysField({ id, value, busy, onSave }) {
  const t = useTranslations("dashboard.producer.orders.products");
  const current = typeof value === "number" ? String(value) : "";
  return (
    <div className="flex items-center justify-between gap-3 py-1">
      <label htmlFor={id} className="text-sm text-fg-muted">{t("lead")}</label>
      <Select
        id={id}
        inline
        size="xs"
        className="w-36 min-h-touch"
        value={current}
        disabled={busy}
        onChange={(/** @type {any} */ e) => {
          const next = e.target.value;
          if (next !== current) onSave(next === "" ? null : Number(next));
        }}
        data-testid={`lead-days-${id}`}
      >
        <option value="">{t("lead_none")}</option>
        {LEAD_DAY_CHOICES.map((n) => (
          <option key={n} value={String(n)}>{t("lead_option", { n })}</option>
        ))}
      </Select>
    </div>
  );
}
