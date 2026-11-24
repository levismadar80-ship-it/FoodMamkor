// @ts-check
"use client";
/**
 * Module:   DeliveryBulkDay
 * Purpose:  «אותו יום לכמה ערים» — tick several delivery cities, pick one day,
 *           apply it to all of them at once. A business with 10–20 cities per
 *           delivery day (MEH-3475) would otherwise set the same select 20 times.
 * Does NOT: save anything. It hands (cities, day) to DeliveryCard, which marks
 *           the card dirty; the card's own «שמירה» writes the rows.
 * Related:  DeliveryCard.jsx (per-city day select, same DELIVERY_DAYS list).
 * History:  MEH-3475 (creation)
 */
import { useState } from "react";
import { useTranslations } from "next-intl";
import { DELIVERY_DAYS } from "@/lib/delivery-days";
import Button from "@/components/ui/Button";
import Checkbox from "@/components/ui/Checkbox";

/** Below this many cities a per-row select is quicker than a bulk step. */
const MIN_CITIES_FOR_BULK = 2;

/** @param {{ cities: string[], onApply: (picked: string[], day: string) => void }} props */
export default function DeliveryBulkDay({ cities, onApply }) {
  const t = useTranslations("dashboard.producer.delivery");
  const [picked, setPicked] = useState(/** @type {string[]} */ ([]));
  const [day, setDay] = useState("");
  if (cities.length < MIN_CITIES_FOR_BULK) return null;
  // A city removed from the list above must not stay ticked.
  const live = picked.filter((c) => cities.includes(c));

  /** @param {string} city */
  const toggle = (city) =>
    setPicked((p) => (p.includes(city) ? p.filter((c) => c !== city) : [...p, city]));

  const apply = () => {
    onApply(live, day);
    setPicked([]);
  };

  return (
    <fieldset className="mb-3 rounded-sm border border-border p-3" data-testid="delivery-bulk-day">
      <legend className="px-1 text-sm text-muted">{t("bulk_label")}</legend>
      <p className="text-xs text-fg-muted mb-2">{t("bulk_hint")}</p>
      <ul className="flex flex-wrap gap-x-4 gap-y-1 mb-2">
        {cities.map((c) => (
          <li key={c}>
            <Checkbox
              className="inline-flex items-center gap-1.5 text-sm min-h-11"
              checked={live.includes(c)}
              onChange={() => toggle(c)}
              aria-label={t("bulk_city_aria", { city: c })}
              data-testid={`delivery-bulk-city-${c}`}
            >
              {c}
            </Checkbox>
          </li>
        ))}
      </ul>
      <div className="flex flex-wrap items-center gap-2">
        <select
          value={day}
          onChange={(e) => setDay(e.target.value)}
          aria-label={t("bulk_label")}
          data-testid="delivery-bulk-day-select"
          className="border border-border rounded-sm px-2 py-1 text-sm bg-surface focus-ring"
        >
          <option value="">{t("day_arranged")}</option>
          {DELIVERY_DAYS.map((d) => (
            <option key={d} value={d}>
              {d}
            </option>
          ))}
        </select>
        <Button
          size="sm"
          variant="outlined"
          onClick={apply}
          disabled={live.length === 0}
          data-testid="delivery-bulk-apply"
        >
          {t("bulk_apply")}
        </Button>
      </div>
    </fieldset>
  );
}
