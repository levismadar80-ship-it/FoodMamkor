// @ts-check
"use client";

/**
 * Module:   AddToCalendarButton
 * Purpose:  «הוספה ליומן» for one timed slot — an order's pickup or delivery
 *           window today; a bag or group-buy pickup next. One click downloads
 *           an .ics the phone opens in its calendar app.
 * Touches:  nothing on the server (the file is built in the browser).
 * Does NOT: build the event page's all-day / recurring entries — those stay on
 *           lib/event-ics.js buildEventIcs + downloadIcs.
 * Related:  lib/event-ics.js buildSlotIcs, app/[locale]/order/[id]/OrderStatusClient.jsx
 * History:  MEH-3616 (creation)
 */

import { CalendarPlus } from "@phosphor-icons/react";
import { useTranslations } from "next-intl";

import Button from "@/components/ui/Button";
import { buildSlotIcs, downloadIcsText } from "@/lib/event-ics";

/**
 * @param {{ slot: { uid: string, start: string, end: string, title: string, location?: string | null, url?: string }, testId?: string }} props
 */
export default function AddToCalendarButton({ slot, testId = "add-to-calendar" }) {
  const t = useTranslations("events.detail");
  return (
    <Button
      variant="outlined"
      leadingIcon={<CalendarPlus size={18} aria-hidden="true" />}
      onClick={() => downloadIcsText(buildSlotIcs(slot), `${slot.uid}.ics`)}
      data-testid={testId}
    >
      {t("add_to_calendar")}
    </Button>
  );
}
