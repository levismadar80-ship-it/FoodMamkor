// @ts-check
"use client";
/**
 * Module:   PickupSchedule
 * Purpose:  Under a pickup point on the business page: its pickup days
 *           («איסוף ביום שלישי»), its own order cutoff («מקבלים הזמנות עד יום
 *           רביעי 15:00») and the next pickup date («האיסוף הבא: יום חמישי
 *           26.11») — from the point's fields, not from its label (MEH-3512).
 * Does NOT: render the point's name, hours, phone or nav links
 *           (DeliveryBlock.jsx PickupRow does), or compute the date
 *           (lib/nextDelivery.js does).
 * Related:  components/NextDeliveryLine.jsx, lib/nextDelivery.js cutoffOfRow.
 * History:  MEH-3512 (creation).
 *
 * States: no days and no cutoff → renders nothing, so a point saved before
 * the fields reads exactly as it did. One day / several days → one line each
 * way. A cutoff with no days → only the cutoff line (no date to compute).
 */
import { useTranslations } from "next-intl";
import NextDeliveryLine from "@/components/NextDeliveryLine";
import { cutoffOfRow } from "@/lib/nextDelivery";

const WEEKDAY_KEYS = ["sun", "mon", "tue", "wed", "thu", "fri", "sat"];
// The stored day names are Hebrew in every locale (DELIVERY_DAYS), so they are
// joined the Hebrew way: «שלישי וחמישי».
const DAY_LIST = new Intl.ListFormat("he", { type: "conjunction" });

/**
 * @param {{ loc: { pickup_days?: string[] | null, order_cutoff_day?: string | null,
 *   order_cutoff_time?: string | null }, producer?: any }} props
 */
export default function PickupSchedule({ loc, producer = null }) {
  const t = useTranslations("group_buys.delivery");
  const tWeekdays = useTranslations("opening_hours.weekdays");
  const days = (loc.pickup_days || []).filter(Boolean);
  const cutoff = cutoffOfRow(loc);
  if (days.length === 0 && !cutoff) return null;
  return (
    <>
      {days.length > 0 && (
        <p className="text-sm text-fg-muted" data-testid="pickup-days">
          {t("pickup_days", { count: days.length, days: DAY_LIST.format(days) })}
        </p>
      )}
      {cutoff && (
        <p className="text-sm text-fg-muted" data-testid="pickup-cutoff">
          {t("order_cutoff", { day: tWeekdays(WEEKDAY_KEYS[cutoff.dayIndex]), time: cutoff.close })}
        </p>
      )}
      {days.length > 0 && <NextDeliveryLine days={days} producer={producer} cutoff={cutoff} pickup />}
    </>
  );
}
