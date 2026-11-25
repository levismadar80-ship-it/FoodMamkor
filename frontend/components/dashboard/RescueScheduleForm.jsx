// @ts-check
"use client";
/**
 * Module:   RescueScheduleForm
 * Purpose:  The weekly surprise-bag routine of every pickup point: days,
 *           hours, how many bags and the price, set once; then the coming two
 *           weeks as days to skip or bring back.
 * Does NOT: publish a bag (the server does, on save and every hour) or cancel
 *           one already up. Tomorrow is skipped from the strip on the rescue
 *           tab (RescueScheduleStrip), which also cancels its bag, so the list
 *           here starts the day after tomorrow.
 * Related:  backend/app/routers/rescue.py (schedule routes) ·
 *           app/[locale]/producer/dashboard/rescue/schedule/page.js (the page)
 * History:  MEH-3703 (creation); follow-up: 24-hour hour/minute selects
 *           (ui/TimeOfDaySelect) and the bag's worth, as on the publish form.
 */

import { useCallback, useEffect, useState } from "react";
import { useTranslations } from "next-intl";

import { Link as LocaleLink } from "@/i18n/navigation";
import api from "@/lib/api";
import { ListMySchedulesProducersMeRescueSchedulesGetResponse as SchedulesOut } from "@/lib/generated/api.zod";
import { israelToday } from "@/lib/israel-date";
import { detailToMessage } from "@/lib/errors";
import { agorotToShekels, shekelsToAgorot } from "@/lib/money";
import { DAY_MS, RESCUE_CANCEL_CUTOFFS, RESCUE_MAX_QTY, RESCUE_SKIP_DAYS_AHEAD } from "@/lib/rescue";
import Button from "@/components/ui/Button";
import Input from "@/components/ui/Input";
import InlineMessage from "@/components/ui/InlineMessage";
import Checkbox from "@/components/ui/Checkbox";
import Heading from "@/components/ui/Heading";
import Select from "@/components/ui/Select";
import TimeOfDaySelect from "@/components/ui/TimeOfDaySelect";
import WeekdayChips from "@/components/ui/WeekdayChips";

// Tomorrow is the strip's; the list starts the day after.
const FIRST_LISTED = 2;
/**
 * The form's state. Quantity and price hold the input's text while it is
 * being typed (it may be empty); the save turns them into numbers.
 * @typedef {{ weekdays: number, pickup_start: string, pickup_end: string, cancel_minutes: number, qty: number | string, price: number | string, worth: number | string, paused: boolean }} Draft
 */
/** @type {Draft} */
const DEFAULTS = { weekdays: 0, pickup_start: "18:00", pickup_end: "20:00", cancel_minutes: 30, qty: 4, price: 15, worth: "", paused: false };

/**
 * The routine days from the day after tomorrow up to two weeks ahead.
 * @param {number} mask @param {string} today
 * @returns {{ day: string, weekday: number }[]}
 */
export function upcomingDays(mask, today) {
  const base = Date.parse(`${today}T12:00:00Z`);
  const out = [];
  for (let n = FIRST_LISTED; n <= RESCUE_SKIP_DAYS_AHEAD; n += 1) {
    const d = new Date(base + n * DAY_MS);
    const weekday = d.getUTCDay();
    if (mask & (1 << weekday)) out.push({ day: israelToday(d), weekday }); // noon UTC: the same Israel day
  }
  return out;
}

/** @param {any} schedule @returns {Draft} */
function draftOf(schedule) {
  if (!schedule) return { ...DEFAULTS };
  return {
    weekdays: schedule.weekdays,
    pickup_start: schedule.pickup_start,
    pickup_end: schedule.pickup_end,
    cancel_minutes: schedule.cancel_minutes,
    qty: schedule.qty,
    price: agorotToShekels(schedule.price_agorot),
    worth: typeof schedule.value_min_agorot === "number" ? agorotToShekels(schedule.value_min_agorot) : "",
    paused: Boolean(schedule.paused),
  };
}

/** @param {{ row: any, today: string, onSaved: (row: any) => void }} props */
function PointRoutine({ row, today, onSaved }) {
  const t = useTranslations("rescue.schedule");
  const tf = useTranslations("rescue.dashboard.field");
  const tw = useTranslations("product_weekdays");
  const [draft, setDraft] = useState(() => draftOf(row.schedule));
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState(/** @type {{ tone: "error" | "success", text: string } | null} */ (null));
  const id = row.producer_location_id;
  const set = (/** @type {Partial<Draft>} */ patch) => setDraft((d) => ({ ...d, ...patch }));

  async function run(/** @type {() => Promise<any>} */ call, /** @type {string} */ okKey) {
    setBusy(true);
    setNote(null);
    try {
      const res = await call();
      onSaved(res.data);
      if (okKey) setNote({ tone: "success", text: t(okKey) });
    } catch (err) {
      setNote({ tone: "error", text: detailToMessage(err?.response?.data?.detail) || t("failed") });
    } finally {
      setBusy(false);
    }
  }

  const save = () =>
    run(
      () =>
        api.put(`/producers/me/rescue/locations/${id}/schedule`, {
          weekdays: draft.weekdays,
          pickup_start: draft.pickup_start,
          pickup_end: draft.pickup_end,
          cancel_minutes: Number(draft.cancel_minutes),
          qty: Number(draft.qty),
          price_agorot: shekelsToAgorot(Number(draft.price)),
          // Buyers see a worth only above the price (worthAgorot), so one at
          // or below it is cleared rather than stored (as on the publish form).
          value_min_agorot: Number(draft.worth) > Number(draft.price) ? shekelsToAgorot(Number(draft.worth)) : null,
          paused: draft.paused,
        }),
      "saved",
    );
  const remove = () =>
    run(async () => {
      const res = await api.delete(`/producers/me/rescue/locations/${id}/schedule`);
      setDraft({ ...DEFAULTS });
      return res;
    }, "removed");
  const toggleSkip = (/** @type {string} */ day, /** @type {boolean} */ skipped) =>
    run(
      () =>
        skipped
          ? api.delete(`/producers/me/rescue/locations/${id}/schedule/skips/${day}`)
          : api.put(`/producers/me/rescue/locations/${id}/schedule/skips/${day}`),
      "",
    );

  const place = row.label || row.address || "";
  const daysId = `rescue-schedule-days-${id}`;
  const worthHelpId = `rescue-schedule-worth-help-${id}`;
  const fromId = `rescue-schedule-from-label-${id}`;
  const toId = `rescue-schedule-to-label-${id}`;
  const skips = row.schedule?.skip_dates || [];
  const longDays = tw("days_long").split(",");

  if (!row.exact) {
    return (
      <section className="border border-border rounded-md px-4 py-4 space-y-1" data-testid="rescue-schedule-point">
        {place && <Heading level={2}>{place}</Heading>}
        <p className="font-body-sm text-sm text-fg-muted" data-testid="rescue-schedule-not-exact">{t("point_not_exact")}</p>
      </section>
    );
  }

  return (
    <section className="border border-border rounded-md px-4 py-4 space-y-4" data-testid="rescue-schedule-point">
      {place && <Heading level={2}>{place}</Heading>}
      <div className="space-y-2">
        <p id={daysId} className="font-body-sm text-sm text-text font-medium">{t("days_label")}</p>
        <WeekdayChips labelledBy={daysId} value={draft.weekdays} onChange={(mask) => set({ weekdays: mask ?? 0 })} testIdPrefix="rescue-schedule-day" />
        {draft.weekdays === 0 && <p className="font-body-sm text-sm text-fg-muted" data-testid="rescue-schedule-none-picked">{t("none_picked")}</p>}
      </div>
      <div className="grid grid-cols-2 gap-3">
        <label className="font-body-sm text-sm">
          {tf("qty")}
          <Input inline size="xs" type="number" min={1} max={RESCUE_MAX_QTY} value={draft.qty} onChange={(e) => set({ qty: e.target.value })} data-testid="rescue-schedule-qty" className="w-full mt-1" />
        </label>
        <label className="font-body-sm text-sm">
          {tf("price")}
          <Input inline size="xs" type="number" min={0} value={draft.price} onChange={(e) => set({ price: e.target.value })} data-testid="rescue-schedule-price" className="w-full mt-1" />
        </label>
        <div className="font-body-sm text-sm col-span-2">
          <label>
            {tf("worth")}
            <Input inline size="xs" type="number" min={0} inputMode="numeric" value={draft.worth} onChange={(e) => set({ worth: e.target.value })} aria-describedby={worthHelpId} data-testid="rescue-schedule-worth" className="w-full mt-1" />
          </label>
          <p id={worthHelpId} className="text-xs text-fg-muted mt-1">{tf("worth_help")}</p>
        </div>
        {/* Hour and minute selects, not <input type="time">, which shows AM/PM
            on a device set to English (MEH-3823). min-w-0: MEH-2730. */}
        <div className="font-body-sm text-sm min-w-0" role="group" aria-labelledby={fromId}>
          <span id={fromId}>{tf("from")}</span>
          <TimeOfDaySelect value={draft.pickup_start} onChange={(v) => set({ pickup_start: v })} hourLabel={tf("from_hour")} minuteLabel={tf("from_minute")} testId="rescue-schedule-from" className="mt-1" />
        </div>
        <div className="font-body-sm text-sm min-w-0" role="group" aria-labelledby={toId}>
          <span id={toId}>{tf("to")}</span>
          <TimeOfDaySelect value={draft.pickup_end} onChange={(v) => set({ pickup_end: v })} hourLabel={tf("to_hour")} minuteLabel={tf("to_minute")} testId="rescue-schedule-to" className="mt-1" />
        </div>
        <label className="font-body-sm text-sm col-span-2">
          {tf("cancel")}
          <Select
            inline
            size="xs"
            value={draft.cancel_minutes}
            onChange={(e) => set({ cancel_minutes: Number(e.target.value) })}
            data-testid="rescue-schedule-cancel"
            className="w-full mt-1"
          >
            {RESCUE_CANCEL_CUTOFFS.map(([minutes, key]) => (
              <option key={minutes} value={minutes}>
                {tf(`cancel_${key}`)}
              </option>
            ))}
          </Select>
        </label>
      </div>
      {row.schedule && (
        <Checkbox
          className="flex items-start gap-2 font-body-sm text-sm text-text"
          boxClassName="mt-0.5"
          checked={draft.paused}
          onChange={(e) => set({ paused: e.target.checked })}
          data-testid="rescue-schedule-paused"
        >
          <span>
            {t("paused")}
            <span className="block text-fg-muted">{t("paused_help")}</span>
          </span>
        </Checkbox>
      )}
      <div className="flex flex-wrap gap-2">
        <Button type="button" variant="primary" disabled={busy || draft.weekdays === 0} onClick={save} data-testid="rescue-schedule-save">
          {t("save")}
        </Button>
        {row.schedule && (
          <Button type="button" variant="outlined" disabled={busy} onClick={remove} data-testid="rescue-schedule-remove">
            {t("remove")}
          </Button>
        )}
      </div>
      {note && (
        <InlineMessage tone={note.tone} data-testid="rescue-schedule-note">
          {note.text}
        </InlineMessage>
      )}
      {row.schedule && !row.schedule.paused && (
        <div className="space-y-2 border-t border-border pt-3" data-testid="rescue-schedule-upcoming">
          <p className="font-body-sm text-sm text-text font-medium">{t("upcoming_title")}</p>
          <p className="font-body-sm text-sm text-fg-muted">{t("upcoming_help")}</p>
          <ul className="flex flex-wrap gap-2">
            {upcomingDays(row.schedule.weekdays, today).map(({ day, weekday }) => {
              const skipped = skips.includes(day);
              return (
                <li key={day}>
                  <button
                    type="button"
                    disabled={busy}
                    aria-pressed={skipped}
                    onClick={() => toggleSkip(day, skipped)}
                    data-testid="rescue-schedule-upcoming-day"
                    className={`min-h-touch rounded-md border px-3 py-1 text-sm text-start focus-ring ${skipped ? "border-border bg-surface text-fg-muted line-through" : "border-primary bg-green-50 text-text"}`}
                  >
                    {longDays[weekday]} {day.slice(8, 10)}/{day.slice(5, 7)}
                    {skipped && <span className="ms-1 no-underline">· {t("day_skipped")}</span>}
                  </button>
                </li>
              );
            })}
          </ul>
        </div>
      )}
    </section>
  );
}

/** @param {{ today?: string }} props */
export default function RescueScheduleForm({ today }) {
  const t = useTranslations("rescue.schedule");
  const ta = useTranslations("a11y");
  const [rows, setRows] = useState(/** @type {any[] | null} */ (null));
  const [failed, setFailed] = useState(false);
  const day = today || israelToday();

  const load = useCallback(() => {
    api
      .get("/producers/me/rescue/schedules")
      .then((r) => {
        // Rule 19: the shape is checked before it is read.
        const parsed = SchedulesOut.safeParse(r.data);
        if (parsed.success) setRows(parsed.data);
        else setFailed(true);
      })
      .catch(() => setFailed(true));
  }, []);
  useEffect(load, [load]);

  if (failed) return <InlineMessage tone="error">{t("failed")}</InlineMessage>;
  if (!rows) return <p className="font-body-sm text-sm text-fg-muted" role="status">{ta("loading")}</p>;
  if (rows.length === 0) {
    return (
      <div className="space-y-3" data-testid="rescue-schedule-no-points">
        <p className="font-body-sm text-sm text-text">{t("no_points")}</p>
        <LocaleLink href="/producer/dashboard/edit#locations" className="inline-block text-primary underline font-medium">
          {t("no_points_cta")}
        </LocaleLink>
      </div>
    );
  }
  const replace = (/** @type {any} */ next) =>
    setRows((all) => (all || []).map((r) => (r.producer_location_id === next.producer_location_id ? next : r)));
  return (
    <div className="space-y-4">
      {rows.map((row) => (
        <PointRoutine key={row.producer_location_id} row={row} today={day} onSaved={replace} />
      ))}
    </div>
  );
}
