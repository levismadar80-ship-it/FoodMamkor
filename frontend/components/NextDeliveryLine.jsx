// @ts-check
"use client";
/**
 * Module:   NextDeliveryLine
 * Purpose:  «המשלוח הבא: יום שלישי 24.11» under a delivery day heading, and
 *           «המשלוח הבא לחיפה: …» under the «מגיעים אלייך?» answer (MEH-3485).
 * Does NOT: decide the date — lib/nextDelivery.js does, from the city's days,
 *           the order window and the vacation state.
 * Related:  components/DeliveryBlock.jsx, components/DeliveryChecker.jsx.
 * History:  MEH-3485 (creation).
 */
import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { nextDeliveryDate } from "@/lib/nextDelivery";
import { isOnVacation } from "@/lib/availability";
import { formatDate } from "@/lib/format-date";

const WEEKDAY_KEYS = ["sun", "mon", "tue", "wed", "thu", "fri", "sat"];

/**
 * @param {{ days?: string[] | null, producer?: any, city?: string | null,
 *   className?: string }} props
 */
export default function NextDeliveryLine({ days, producer = null, city = null, className = "" }) {
  const t = useTranslations("group_buys.delivery");
  const tWeekdays = useTranslations("opening_hours.weekdays");
  // Clock-derived, so nothing renders until mounted: the server and the
  // browser would disagree on "now" (same idiom as ProducerCard.jsx:396).
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  if (!mounted) return null;
  const next = nextDeliveryDate({
    days,
    orderWindow: producer?.order_window,
    onVacation: isOnVacation(producer),
  });
  if (!next) return null;
  // The page's own <html lang> (app/[locale]/layout.js), read after mount —
  // so this works under every test's next-intl mock, which rarely has useLocale.
  const locale = document.documentElement.lang || "he";
  const date = `${tWeekdays(WEEKDAY_KEYS[next.dayIndex])} ${formatDate(next.date, locale, "dayMonthShort")}`;
  return (
    <p className={`text-sm text-fg-muted ${className}`} data-testid="next-delivery">
      {city ? t("next_delivery_city", { city, date }) : t("next_delivery", { date })}
    </p>
  );
}
