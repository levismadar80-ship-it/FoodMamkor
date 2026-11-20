// @ts-check
"use client";
/**
 * Module:   PickupScheduleField
 * Purpose:  In the location editor, for a pickup point or a market stand:
 *           which weekdays it is open for pickup, and (optionally) its own
 *           order cutoff — «מקבלים הזמנות עד רביעי 15:00» for a Thursday
 *           pickup (MEH-3512). Replaces writing the day inside the label.
 * Does NOT: save or validate — LocationsEditor's buildPayload sends the three
 *           fields and the server whitelists them (schemas/catalog.py,
 *           schemas/order_cutoff.py → Hebrew 422). Pickup hours stay in
 *           LocationHoursField.
 * Related:  LocationsEditor.jsx (owner + admin, MEH-3333 — one component),
 *           components/PickupSchedule.jsx (the public lines).
 * History:  MEH-3512 (creation).
 */
import { useTranslations } from "next-intl";
import { DELIVERY_DAYS } from "@/lib/delivery-days";

/**
 * @param {{
 *   days: string[], cutoffDay: string, cutoffTime: string,
 *   onChange: (patch: { pickup_days?: string[], order_cutoff_day?: string, order_cutoff_time?: string }) => void,
 * }} props
 */
export default function PickupScheduleField({ days, cutoffDay, cutoffTime, onChange }) {
  const t = useTranslations("settings.locations.form");
  /** @param {string} day */
  const toggle = (day) =>
    onChange({
      pickup_days: DELIVERY_DAYS.filter((d) => (d === day ? !days.includes(d) : days.includes(d))),
    });
  const half = Boolean(cutoffDay) !== Boolean(cutoffTime);
  return (
    <div className="space-y-3 rounded-md border border-border bg-surface px-3 py-2" data-testid="pickup-schedule">
      <fieldset>
        <legend className="mb-1 text-xs font-medium text-fg-muted">{t("pickup_days_label")}</legend>
        <ul className="flex flex-wrap gap-x-4 gap-y-1">
          {DELIVERY_DAYS.map((day) => (
            <li key={day}>
              <label className="inline-flex min-h-11 items-center gap-1.5 text-sm">
                <input
                  type="checkbox"
                  checked={days.includes(day)}
                  onChange={() => toggle(day)}
                  data-testid={`pickup-day-${day}`}
                />
                {day}
              </label>
            </li>
          ))}
        </ul>
        <span className="mt-1 block text-2xs text-fg-muted">{t("pickup_days_hint")}</span>
      </fieldset>
      <fieldset>
        <legend className="mb-1 text-xs font-medium text-fg-muted">{t("pickup_cutoff_label")}</legend>
        <div className="flex flex-wrap items-center gap-2">
          <select
            value={cutoffDay}
            onChange={(e) => onChange({ order_cutoff_day: e.target.value })}
            aria-label={t("pickup_cutoff_day_aria")}
            className="min-h-11 rounded-md border border-border bg-surface px-2 text-sm"
            data-testid="pickup-cutoff-day"
          >
            <option value="">{t("pickup_cutoff_none")}</option>
            {DELIVERY_DAYS.map((day) => (
              <option key={day} value={day}>
                {day}
              </option>
            ))}
          </select>
          <input
            type="time"
            value={cutoffTime}
            onChange={(e) => onChange({ order_cutoff_time: e.target.value })}
            aria-label={t("pickup_cutoff_time_aria")}
            className="min-h-11 rounded-md border border-border bg-surface px-2 text-sm"
            dir="ltr"
            data-testid="pickup-cutoff-time"
          />
        </div>
        <span className="mt-1 block text-2xs text-fg-muted">
          {half ? t("pickup_cutoff_half") : t("pickup_cutoff_hint")}
        </span>
      </fieldset>
    </div>
  );
}
