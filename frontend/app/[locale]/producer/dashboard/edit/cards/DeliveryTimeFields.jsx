// @ts-check
"use client";
/**
 * Module:   DeliveryTimeFields
 * Purpose:  «זמן משלוח (ימי עסקים)»: from–to business days (MEH-3511), for
 *           the whole business (DeliveryCard default block) and for a zone
 *           (DeliveryZonesEditor). «עד» alone is a valid answer («עד 5»).
 * Does NOT: validate beyond the input bounds (the server's 1..30 and
 *           from ≤ to are the authority — schemas/delivery_time.py).
 * Related:  components/DeliveryTerms.jsx (how the page reads it).
 * History:  MEH-3511 (creation).
 */
import { useTranslations } from "next-intl";
import Input from "@/components/ui/Input";

// Mirrors backend MIN_BUSINESS_DAYS / MAX_BUSINESS_DAYS (schemas/delivery_time.py).
const MIN_DAYS = 1;
const MAX_DAYS = 30;

/**
 * @param {{ min: string | number, max: string | number, testid: string,
 *   onChange: (patch: { dmin?: string, dmax?: string }) => void }} props
 */
export default function DeliveryTimeFields({ min, max, testid, onChange }) {
  const t = useTranslations("dashboard.producer.delivery");
  /** @type {Array<["dmin" | "dmax", string, string | number]>} */
  const ends = [
    ["dmin", t("time_from"), min],
    ["dmax", t("time_to"), max],
  ];
  return (
    <fieldset>
      <legend className="block text-sm text-muted mb-1">{t("time_label")}</legend>
      <p className="text-xs text-fg-muted mb-1">{t("time_hint")}</p>
      <div className="flex flex-wrap gap-3">
        {ends.map(([key, label, value]) => (
          <label key={key} className="flex items-center gap-1.5 text-xs text-muted">
            {label}
            <Input
              inline
              size="xs"
              type="number"
              inputMode="numeric"
              min={MIN_DAYS}
              max={MAX_DAYS}
              step="1"
              value={value}
              onChange={(e) => onChange({ [key]: e.target.value })}
              data-testid={`${testid}-${key}`}
              className="w-20"
            />
          </label>
        ))}
      </div>
    </fieldset>
  );
}
