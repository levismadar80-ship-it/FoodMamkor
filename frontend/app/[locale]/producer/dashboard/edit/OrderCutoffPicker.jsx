// @ts-check
"use client";
/**
 * Module:   OrderCutoffPicker
 * Purpose:  «מקבלים הזמנות עד»: a weekday select + a time input, for a row
 *           that has its own order cutoff — a pickup point (MEH-3512) or a
 *           delivery zone (MEH-3511). One picker, so both read and behave
 *           the same.
 * Does NOT: save or validate (the server does — schemas/order_cutoff.py,
 *           Hebrew 422); it only says when half a cutoff is filled in.
 * Related:  PickupScheduleField.jsx, cards/DeliveryZonesEditor.jsx.
 * History:  MEH-3511 (extracted from PickupScheduleField, MEH-3512).
 */
import { useTranslations } from "next-intl";
import { DELIVERY_DAYS } from "@/lib/delivery-days";
import Input from "@/components/ui/Input";
import Select from "@/components/ui/Select";

/**
 * @param {{ day: string, time: string, hint: string, testid: string,
 *   onChange: (patch: { order_cutoff_day?: string, order_cutoff_time?: string }) => void }} props
 */
export default function OrderCutoffPicker({ day, time, hint, testid, onChange }) {
  const t = useTranslations("settings.locations.form");
  const half = Boolean(day) !== Boolean(time);
  return (
    <fieldset>
      <legend className="mb-1 text-xs font-medium text-fg-muted">{t("pickup_cutoff_label")}</legend>
      <div className="flex flex-wrap items-center gap-2">
        <Select
          inline
          size="xs"
          value={day}
          onChange={(e) => onChange({ order_cutoff_day: e.target.value })}
          aria-label={t("pickup_cutoff_day_aria")}
          className="w-auto"
          data-testid={`${testid}-day`}
        >
          <option value="">{t("pickup_cutoff_none")}</option>
          {DELIVERY_DAYS.map((d) => (
            <option key={d} value={d}>
              {d}
            </option>
          ))}
        </Select>
        <Input
          inline
          size="xs"
          type="time"
          value={time}
          onChange={(e) => onChange({ order_cutoff_time: e.target.value })}
          aria-label={t("pickup_cutoff_time_aria")}
          className="w-28"
          dir="ltr"
          data-testid={`${testid}-time`}
        />
      </div>
      <span className="mt-1 block text-2xs text-fg-muted">{half ? t("pickup_cutoff_half") : hint}</span>
    </fieldset>
  );
}
