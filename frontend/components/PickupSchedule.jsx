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
 *           (lib/next-delivery.js does).
 * Related:  components/NextDeliveryLine.jsx, lib/next-delivery.js cutoffOfRow.
 * History:  MEH-3512 (creation).
 *
 * States: nothing set → renders nothing, so a point saved before the fields
 * reads as it did. Hours, days and cutoff share one «·» line (Sapir 20/11,
 * «עמוס»); days already named by the hours are not repeated. A cutoff with no
 * days → no next-pickup line (no date to compute).
 */
import { useTranslations } from "next-intl";
import NextDeliveryLine from "@/components/NextDeliveryLine";
import { cutoffOfRow } from "@/lib/next-delivery";
import { TERMS_LINE } from "@/components/AreaTermsRow";

const WEEKDAY_KEYS = ["sun", "mon", "tue", "wed", "thu", "fri", "sat"];
// The stored day names are Hebrew in every locale (DELIVERY_DAYS), so they are
// joined the Hebrew way: «שלישי וחמישי».
const DAY_LIST = new Intl.ListFormat("he", { type: "conjunction" });

/**
 * @param {{ loc: { pickup_days?: string[] | null, order_cutoff_day?: string | null,
 *   order_cutoff_time?: string | null }, producer?: any,
 *   hours?: import("react").ReactNode, hoursText?: string }} props
 */
export default function PickupSchedule({ loc, producer = null, hours = null, hoursText = "" }) {
  const t = useTranslations("group_buys.delivery");
  const tWeekdays = useTranslations("opening_hours.weekdays");
  const days = (loc.pickup_days || []).filter(Boolean);
  const cutoff = cutoffOfRow(loc);
  // Hours that already name every pickup day («יום שלישי 17:00-19:00») make
  // «איסוף ביום שלישי» a repeat: the days are left out of the line.
  const daysInHours = days.length > 0 && days.every((d) => hoursText.includes(d));
  const showDays = days.length > 0 && !daysInHours;
  if (!hours && !showDays && !cutoff && days.length === 0) return null;
  return (
    <>
      {(hours || showDays || cutoff) && (
        <p className={TERMS_LINE} data-testid="pickup-terms">
          {hours && <span data-testid="pickup-hours">{hours}</span>}
          {showDays && (
            <span data-testid="pickup-days">
              {t("pickup_days", { count: days.length, days: DAY_LIST.format(days) })}
            </span>
          )}
          {cutoff && (
            <span data-testid="pickup-cutoff">
              {t("order_cutoff", { day: tWeekdays(WEEKDAY_KEYS[cutoff.dayIndex]), time: cutoff.close })}
            </span>
          )}
        </p>
      )}
      {/* The one line a visitor acts on, so it carries the brand colour. */}
      {days.length > 0 && (
        <NextDeliveryLine
          days={days}
          producer={producer}
          cutoff={cutoff}
          pickup
          className="mt-0.5"
          textClass="text-xs font-medium text-primary"
        />
      )}
    </>
  );
}
