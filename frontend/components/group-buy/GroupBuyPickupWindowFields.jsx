// @ts-check
"use client";

/**
 * MEH-3597: the pickup window on the create form — a day + start time, and an
 * end time that day. Optional: left empty, the free-text pickup note is the
 * whole answer, as before. Too Good To Go shows a bag's pickup hours first;
 * a group buy now can too («איסוף: שישי 5.12, 09:00–13:00»).
 */
import { useTranslations } from "next-intl";
import DateTimeField from "@/components/ui/DateTimeField";
import TimeOfDaySelect from "@/components/ui/TimeOfDaySelect";
import InlineMessage from "@/components/ui/InlineMessage";
import { israelWallClockToIso } from "@/lib/dates";

/**
 * The two ISO instants, or an error key. Both empty → nulls.
 * @param {string} start datetime-local value
 * @param {string} endTime time value (HH:MM)
 * @returns {{ pickup_starts_at: string | null, pickup_ends_at: string | null } | { error: string }}
 */
export function pickupWindowPayload(start, endTime) {
  if (!start && !endTime) return { pickup_starts_at: null, pickup_ends_at: null };
  if (!start || !endTime) return { error: "pickup_window_both" };
  const from = israelWallClockToIso(start);
  const until = israelWallClockToIso(`${start.slice(0, 10)}T${endTime}`);
  if (!from || !until || until <= from) return { error: "pickup_window_order" };
  return { pickup_starts_at: from, pickup_ends_at: until };
}

/** @param {{ start: string, endTime: string, onStart: (e: any) => void, onEnd: (e: any) => void, error?: string | null }} props */
export default function GroupBuyPickupWindowFields({ start, endTime, onStart, onEnd, error = null }) {
  const t = useTranslations("group_buys.dashboard.form");
  return (
    <fieldset className="sm:col-span-2 grid grid-cols-2 gap-3" data-testid="gb-pickup-window">
      <legend className="text-sm font-medium text-text mb-1">{t("pickup_window_legend")}</legend>
      {/* MEH-3955: a date and 24-hour selects, not datetime-local (AM/PM on an English phone). */}
      <div className="col-span-2 min-w-0">
        <DateTimeField label={t("pickup_window_start")} ariaLabel={t("pickup_window_start")} value={start} onChange={(v) => onStart({ target: { value: v } })} />
      </div>
      <TimeOfDaySelect label={t("pickup_window_end")} ariaLabel={t("pickup_window_end")} optional value={endTime} onChange={(v) => onEnd({ target: { value: v } })} />
      <p className="col-span-2 text-xs text-fg-muted">{t("pickup_window_helper")}</p>
      {error && (
        <InlineMessage size="xs" className="col-span-2" data-testid="gb-pickup-window-error">
          {t(error)}
        </InlineMessage>
      )}
    </fieldset>
  );
}
