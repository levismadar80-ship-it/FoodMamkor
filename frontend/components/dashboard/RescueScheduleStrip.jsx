// @ts-check
"use client";
/**
 * Module:   RescueScheduleStrip
 * Purpose:  One line per pickup point under the counters on the rescue tab:
 *           what tomorrow's routine bag is, and «לדלג על מחר» (or «לבטל את
 *           הדילוג»). Shown only for a point whose routine covers tomorrow.
 * Does NOT: edit the routine (RescueScheduleForm, its own page), publish a
 *           bag (the hourly job does) or decide whether a skip cancels one:
 *           the skip route cancels a bag already up in the same transaction,
 *           and answers 409 first when someone reserved it (then we ask).
 * Related:  backend/app/routers/rescue.py (schedule routes) ·
 *           components/dashboard/RescueTab.jsx (the host)
 * History:  MEH-3703 (creation; placement C, Sapir 24/11)
 */

import { useCallback, useEffect, useState } from "react";
import { useTranslations } from "next-intl";

import { Link as LocaleLink } from "@/i18n/navigation";

import api from "@/lib/api";
import { ListMySchedulesProducersMeRescueSchedulesGetResponse as SchedulesOut } from "@/lib/generated/api.zod";
import { DAY_MS, shekels } from "@/lib/rescue";
import { israelToday } from "@/lib/israel-date";
import { detailToMessage } from "@/lib/errors";
import Button from "@/components/ui/Button";
import InlineMessage from "@/components/ui/InlineMessage";

/** Tomorrow on the Israel clock, and its mask bit (Sunday = 1). @param {string} today */
export function tomorrowOf(today) {
  const next = new Date(Date.parse(`${today}T12:00:00Z`) + DAY_MS);
  // Noon UTC is the same calendar day in Israel, so israelToday reads it right.
  return { day: israelToday(next), bit: 1 << next.getUTCDay() };
}

/**
 * The points whose routine will put up tomorrow's bag: running, able to
 * publish (the server's `publishing`), tomorrow is one of its days and its bag
 * was not cancelled. A skipped tomorrow still shows, so the skip can be taken
 * back.
 * @param {any[]} rows @param {string} today
 */
export function tomorrowRows(rows, today) {
  const { day, bit } = tomorrowOf(today);
  return rows
    .filter(
      (r) =>
        r.publishing &&
        r.schedule &&
        !r.schedule.paused &&
        (r.schedule.weekdays & bit) !== 0 &&
        !(r.closed_days || []).includes(day),
    )
    .map((r) => ({ ...r, skipped: (r.schedule.skip_dates || []).includes(day) }));
}

const HTTP_CONFLICT = 409;

/** @param {{ today?: string, onChanged: () => void }} props */
export default function RescueScheduleStrip({ today, onChanged }) {
  const t = useTranslations("rescue.schedule");
  const [rows, setRows] = useState(/** @type {any[] | null} */ (null));
  const [asking, setAsking] = useState(/** @type {string | null} */ (null));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const load = useCallback(() => {
    api
      .get("/producers/me/rescue/schedules")
      .then((r) => {
        // Rule 19: the shape is checked before it is read; a bad one shows nothing.
        const parsed = SchedulesOut.safeParse(r.data);
        setRows(parsed.success ? parsed.data : []);
      })
      .catch(() => setRows([]));
  }, []);
  useEffect(load, [load]);

  if (!rows) return null;
  const shown = tomorrowRows(rows, today || israelToday());
  if (shown.length === 0) return null;
  const { day } = tomorrowOf(today || israelToday());
  const many = shown.length > 1;

  /** @param {any} row @param {boolean} [confirmed] the business said yes to cancelling reservations */
  async function skip(row, confirmed = false) {
    setBusy(true);
    setError("");
    const loc = row.producer_location_id;
    try {
      if (row.skipped) {
        await api.delete(`/producers/me/rescue/locations/${loc}/schedule/skips/${day}`);
      } else {
        // The server cancels a bag already up, in the same transaction.
        await api.put(`/producers/me/rescue/locations/${loc}/schedule/skips/${day}`, null, confirmed ? { params: { cancel_reserved: true } } : undefined);
      }
      setAsking(null);
      load();
      onChanged();
    } catch (err) {
      if (!confirmed && !row.skipped && err?.response?.status === HTTP_CONFLICT) {
        setAsking(row.producer_location_id); // someone reserved tomorrow's bag: ask first
      } else {
        setError(detailToMessage(err?.response?.data?.detail) || t("failed"));
      }
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="space-y-2" data-testid="rescue-schedule-strip">
      {shown.map((row) => {
        const s = row.schedule;
        const place = row.label || row.address || "";
        const values = { place, qty: s.qty, price: `${shekels(s.price_agorot)} ₪`, from: s.pickup_start, to: s.pickup_end };
        // Whole keys, never built from parts, so the unused-key scan can read them.
        const key = row.skipped
          ? many && place ? "strip_skipped_at" : "strip_skipped"
          : many && place ? "strip_on_at" : "strip_on";
        return (
          <div key={row.producer_location_id} className="border border-border rounded-md px-4 py-3 bg-surface-card space-y-2" data-testid="rescue-schedule-row">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="font-body-sm text-sm text-text" data-testid="rescue-schedule-line">
                {t(key, values)}
              </p>
              {asking !== row.producer_location_id && (
                <Button
                  type="button"
                  variant="outlined"
                  size="sm"
                  disabled={busy}
                  onClick={() => skip(row)}
                  data-testid={row.skipped ? "rescue-schedule-unskip" : "rescue-schedule-skip"}
                >
                  {t(row.skipped ? "unskip_tomorrow" : "skip_tomorrow")}
                </Button>
              )}
            </div>
            {asking === row.producer_location_id && (
              <div className="space-y-2" data-testid="rescue-schedule-ask">
                <p className="font-body-sm text-sm text-text">{t("skip_has_orders")}</p>
                <div className="flex gap-2">
                  <Button type="button" variant="danger" size="sm" disabled={busy} onClick={() => skip(row, true)} data-testid="rescue-schedule-skip-yes">
                    {t("skip_yes")}
                  </Button>
                  <Button type="button" variant="outlined" size="sm" disabled={busy} onClick={() => setAsking(null)} data-testid="rescue-schedule-skip-no">
                    {t("skip_no")}
                  </Button>
                </div>
              </div>
            )}
          </div>
        );
      })}
      {error && <InlineMessage tone="error">{error}</InlineMessage>}
      <LocaleLink href="/producer/dashboard/rescue/schedule" className="font-body-sm text-sm text-primary underline" data-testid="rescue-schedule-edit-link">
        {t("edit_link")}
      </LocaleLink>
    </section>
  );
}
