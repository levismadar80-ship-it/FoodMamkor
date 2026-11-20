// @ts-check
"use client";
/**
 * Module:   DeliveryTerms
 * Purpose:  The MEH-3511 delivery lines on the business page: «מגיע תוך 3–5
 *           ימי עסקים», «מינימום 150₪», and a zone's own «מקבלים הזמנות עד
 *           יום שני 12:00». One component for the business-wide lines (under
 *           the fee line) and a zone row's sublines.
 * Does NOT: decide inheritance beyond the delivery time (lib/deliveryTime.js
 *           the caller), render the fee (DeliveryBlock's fee line / AreaRow), or
 *           compute the next delivery date (NextDeliveryLine).
 * Related:  components/DeliveryBlock.jsx, components/NationwideZones.jsx.
 * History:  MEH-3511 (creation).
 *
 * States: nothing stated → renders nothing (a business that filled no new
 * field reads exactly as before). Each line renders on its own.
 */
import { useTranslations } from "next-intl";
import { formatPrice } from "@/lib/utils";
import { deliveryTimeMessage } from "@/lib/deliveryTime";
import { cutoffOfRow } from "@/lib/nextDelivery";

const WEEKDAY_KEYS = ["sun", "mon", "tue", "wed", "thu", "fri", "sat"];

/**
 * @param {{ daysMin?: number | null, daysMax?: number | null, minOrder?: number | null,
 *   cutoffRow?: { order_cutoff_day?: string | null, order_cutoff_time?: string | null } | null,
 *   className?: string, testid?: string }} props
 */
export default function DeliveryTerms({
  daysMin = null,
  daysMax = null,
  minOrder = null,
  cutoffRow = null,
  className = "text-sm text-fg-muted",
  testid = "delivery-terms",
}) {
  const t = useTranslations("group_buys.delivery");
  const tWeekdays = useTranslations("opening_hours.weekdays");
  const time = deliveryTimeMessage(daysMin, daysMax);
  const cutoff = cutoffOfRow(cutoffRow);
  // Truthiness on purpose, as AreaRow: a 0 minimum is «no minimum».
  if (!time && !minOrder && !cutoff) return null;
  return (
    <div className={className} data-testid={testid}>
      {time && <p data-testid={`${testid}-time`}>{t(time.key, time.values)}</p>}
      {minOrder ? (
        <p data-testid={`${testid}-min`}>
          {/* MEH-1168 P1 (bidi): isolate the ₪ amount so RTL keeps "150₪". */}
          {t("min_order")} <span dir="ltr">{formatPrice(minOrder)}</span>
        </p>
      ) : null}
      {cutoff && (
        <p data-testid={`${testid}-cutoff`}>
          {t("order_cutoff", { day: tWeekdays(WEEKDAY_KEYS[cutoff.dayIndex]), time: cutoff.close })}
        </p>
      )}
    </div>
  );
}
