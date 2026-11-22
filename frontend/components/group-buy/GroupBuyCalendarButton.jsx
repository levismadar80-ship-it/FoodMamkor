// @ts-check
"use client";

/**
 * MEH-3597 (Sapir 21/11, «תבדוק מה עוד חסר»): a member who joined can put the
 * pickup in her calendar, as an event page allows (MEH-2468). Built in the
 * browser from the page's own data, no endpoint. Only for a member, only
 * with a pickup window; the place is the business's own pickup note (its
 * street address stays private).
 */
import { useTranslations } from "next-intl";
import { CalendarPlus } from "@phosphor-icons/react";
import Button from "@/components/ui/Button";
import { downloadIcs } from "@/lib/event-ics";
import { pickupWindowFields } from "@/lib/group-buy-pickup";

/** @param {{ gb: any }} props */
export default function GroupBuyCalendarButton({ gb }) {
  const t = useTranslations("group_buys.detail");
  const { start, endTime } = pickupWindowFields(gb.pickup_starts_at, gb.pickup_ends_at);
  if (!start) return null;
  const [date, time] = start.split("T");
  // The form writes same-day windows; a cross-day one keeps its start only.
  const sameDay = pickupWindowFields(gb.pickup_ends_at, gb.pickup_ends_at).start.slice(0, 10) === date;
  const entry = {
    id: `group-buy-${gb.id}`,
    title: t("calendar_title", { title: gb.title }),
    event_date: date,
    event_time: time,
    end_time: sameDay ? endTime : null,
    location: gb.pickup_note || null,
    city: gb.city || null,
  };
  return (
    <Button
      type="button"
      variant="outlined"
      size="sm"
      className="mt-3"
      onClick={() => downloadIcs(entry, { url: window.location.href, filename: `group-buy-${gb.id}.ics` })}
      data-testid="group-buy-add-to-calendar"
    >
      <CalendarPlus size={18} aria-hidden="true" />
      {t("add_to_calendar")}
    </Button>
  );
}
