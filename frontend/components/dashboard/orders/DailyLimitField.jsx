// @ts-check
"use client";

/**
 * Module:   DailyLimitField
 * Purpose:  «כמה ביום» in a product row of the orders tab: how many units of
 *           a product (or of one of its sizes or flavours) can be ordered for
 *           one pickup day. Empty = no limit. Saves when she leaves the field
 *           or presses Enter, only when the number changed.
 * Touches:  nothing itself — the caller saves (OrderProductsCard.jsx, through
 *           PUT /producers/me/products/{id}/ordering).
 * Does NOT: count orders — the prep list shows what is booked
 *           (OrderPrepList.jsx); the server refuses past the limit
 *           (backend/app/services/product_daily_stock.py).
 * Related:  components/dashboard/orders/OrderProductsCard.jsx (the host)
 * History:  Daily stock (Fischgrund bakery, 27/11/2026; creation)
 */

import { useState } from "react";
import { useTranslations } from "next-intl";

import Input from "@/components/ui/Input";

export const LIMIT_MAX = 999;

/**
 * The field's text → the limit to save: null for empty, undefined when it is
 * not a whole number from 1 to 999 (nothing is saved).
 * @param {string} text
 * @returns {number | null | undefined}
 */
export function parseLimit(text) {
  const trimmed = text.trim();
  if (trimmed === "") return null;
  if (!/^\d+$/.test(trimmed)) return undefined;
  const n = Number(trimmed);
  return n >= 1 && n <= LIMIT_MAX ? n : undefined;
}

/**
 * @param {{
 *   id: string,
 *   label: string,
 *   value: number | null | undefined,
 *   unit: string,
 *   busy: boolean,
 *   onSave: (limit: number | null) => void,
 * }} props
 *   label: the row's own words («כמה ביום» or a variant's name); unit: «יחידות» / «ק״ג».
 */
export default function DailyLimitField({ id, label, value, unit, busy, onSave }) {
  const t = useTranslations("dashboard.producer.orders.products");
  const saved = value === null || value === undefined ? "" : String(value);
  const [text, setText] = useState(saved);
  const [seen, setSeen] = useState(saved);
  // A save from elsewhere (the row reloaded) replaces what is typed.
  if (saved !== seen) {
    setSeen(saved);
    setText(saved);
  }
  const parsed = parseLimit(text);
  const commit = () => {
    if (busy || parsed === undefined || text.trim() === saved) return;
    onSave(parsed);
  };
  const invalid = parsed === undefined;
  return (
    <div className="py-1">
      <div className="flex items-center justify-between gap-3">
        <label htmlFor={id} className="text-sm text-fg-muted">{label}</label>
        <span className="flex items-center gap-2">
          <Input
            id={id}
            inline
            size="xs"
            inputMode="numeric"
            className="w-20 min-h-touch text-center"
            value={text}
            placeholder={t("limit_none")}
            invalid={invalid}
            aria-describedby={invalid ? `${id}-error` : undefined}
            aria-busy={busy}
            onChange={(e) => setText(e.target.value)}
            onBlur={commit}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                commit();
              }
            }}
            data-testid={`daily-limit-${id}`}
          />
          <span className="text-xs text-fg-muted w-10">{unit}</span>
        </span>
      </div>
      {invalid && (
        <p id={`${id}-error`} className="text-xs text-error" data-testid={`daily-limit-error-${id}`}>
          {t("limit_invalid")}
        </p>
      )}
    </div>
  );
}
