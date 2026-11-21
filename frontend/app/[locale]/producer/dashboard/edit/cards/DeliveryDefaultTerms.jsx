// @ts-check
"use client";
/**
 * Module:   DeliveryDefaultTerms
 * Purpose:  The business-wide «מינימום הזמנה למשלוח» and «זמן משלוח (ימי
 *           עסקים)» in DeliveryCard's default block (MEH-3511). A city's or a
 *           zone's own values win over them; with nationwide delivery they are
 *           the «כל הארץ» terms.
 * Does NOT: save (DeliveryCard sends delivery_min_order / delivery_days_min /
 *           delivery_days_max), or validate beyond the input bounds (the
 *           server 422s in Hebrew — schemas/delivery_time.py).
 * Related:  DeliveryTimeFields.jsx (shared with the zones editor).
 * History:  MEH-3511 (creation).
 */
import { useTranslations } from "next-intl";
import Input from "@/components/ui/Input";
import DeliveryTimeFields from "./DeliveryTimeFields";

// Mirrors backend MAX_DELIVERY_MONEY (app/limits.py).
const MAX_DELIVERY_MONEY = 1_000_000;

/**
 * @param {{ minOrder: string | number, dmin: string | number, dmax: string | number,
 *   onChange: (patch: { minOrder?: string, dmin?: string, dmax?: string }) => void }} props
 */
export default function DeliveryDefaultTerms({ minOrder, dmin, dmax, onChange }) {
  const t = useTranslations("dashboard.producer.delivery");
  return (
    <>
      <div>
        <label htmlFor="delivery-min-order" className="block text-sm text-muted mb-1">
          {t("business_min_label")}
        </label>
        <p className="text-xs text-fg-muted mb-1">{t("business_min_hint")}</p>
        <Input
          inline
          size="sm"
          id="delivery-min-order"
          type="number"
          inputMode="numeric"
          min="1"
          max={MAX_DELIVERY_MONEY}
          step="1"
          value={minOrder}
          onChange={(e) => onChange({ minOrder: e.target.value })}
          data-testid="delivery-min-order"
          className="w-32"
        />
      </div>
      <DeliveryTimeFields min={dmin} max={dmax} testid="delivery-time" onChange={onChange} />
    </>
  );
}
