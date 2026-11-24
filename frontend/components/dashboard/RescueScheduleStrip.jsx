// @ts-check
"use client";
/**
 * Module:   RescueScheduleStrip
 * Purpose:  One line per pickup point under the counters on the rescue tab:
 *           what tomorrow's routine bag is, and «לדלג על מחר» (or «לבטל את
 *           הדילוג»). Shown only for a point whose routine covers tomorrow.
 * Does NOT: edit the routine (RescueScheduleForm, its own page) or publish a
 *           bag (the hourly job does). Skipping a day whose bag is already up
 *           also cancels that bag through POST /rescue/offers/{id}/cancel, the
 *           same «ביטול» as the card below, so its buyers get the same email.
 * Related:  backend/app/routers/rescue.py (schedule routes) ·
 *           components/dashboard/RescueTab.jsx (the host)
 * History:  MEH-3703 (creation; placement C, Sapir 24/11)
 */

import { useCallback, useEffect, useState } from "react";
import { useTranslations } from "next-intl";

import { Link as LocaleLink } from "@/i18n/navigation";

import api from "@/lib/api";
import { ListMySchedulesProducersMeRescueSchedulesGetResponse as SchedulesOut } from "@/lib/generated/api.zod";
import { formatAgorot } from "@/lib/money";
import { israelToday } from "@/lib/israel-date";
import { detailToMessage } from "@/lib/errors";
import Button from "@/components/ui/Button";
import InlineMessage from "@/components/ui/InlineMessage";

const DAY_MS = 86_400_000;

/** Tomorrow on the Israel clock, and its mask bit (Sunday = 1). @param {string} today */
export function tomorrowOf(today) {
  const next = new Date(Date.parse(`${today}T12:00:00Z`) + DAY_MS);
  // Noon UTC is the same calendar day in Israel, so israelToday reads it right.
  return { day: israelToday(next), bit: 1 << next.getUTCDay() };
}

/**
 * The points whose routine reaches tomorrow: running, and tomorrow is one of
 * its days. A skipped tomorrow still shows, so the skip can be taken back.
 * @param {any[]} rows @param {string} today
 */
export function tomorrowRows(rows, today) {
  const { day, bit } = tomorrowOf(today);
  return rows
    .filter((r) => r.schedule && !r.schedule.paused && (r.schedule.weekdays & bit) !== 0)
    .map((r) => ({ ...r, skipped: (r.schedule.skip_dates || []).includes(day) }));
}

/**
 * @param {{ today?: string, offers: any[], orders: any[], onChanged: () => void }} props
 *   offers / orders — the tab's own lists, so a skip knows whether tomorrow's
 *   bag is already up and whether anyone reserved it.
 */
export default function RescueScheduleStrip({ today, offers, orders, onChanged }) {
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

  const liveBag = (/** @type {any} */ row) =>
    offers.find((o) => o.producer_location_id === row.producer_location_id && o.date === day && o.status === "active");
  const reservedOn = (/** @type {any} */ bag) =>
    bag ? orders.some((o) => o.offer_id === bag.id && o.status === "reserved") : false;

  async function skip(/** @type {any} */ row) {
    setBusy(true);
    setError("");
    const loc = row.producer_location_id;
    try {
      if (row.skipped) {
        await api.delete(`/producers/me/rescue/locations/${loc}/schedule/skips/${day}`);
      } else {
        // Skip first, then cancel: the next run cannot put the bag back between.
        await api.put(`/producers/me/rescue/locations/${loc}/schedule/skips/${day}`);
        const bag = liveBag(row);
        if (bag) await api.post(`/rescue/offers/${bag.id}/cancel`);
      }
      setAsking(null);
      load();
      onChanged();
    } catch (err) {
      setError(detailToMessage(err?.response?.data?.detail) || t("failed"));
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="space-y-2" data-testid="rescue-schedule-strip">
      {shown.map((row) => {
        const s = row.schedule;
        const place = row.label || row.address || "";
        const values = { place, qty: s.qty, price: formatAgorot(s.price_agorot), from: s.pickup_start, to: s.pickup_end };
        // Whole keys, never built from parts, so the unused-key scan can read them.
        const key = row.skipped
          ? many && place ? "strip_skipped_at" : "strip_skipped"
          : many && place ? "strip_on_at" : "strip_on";
        const needsAsk = !row.skipped && reservedOn(liveBag(row));
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
                  onClick={() => (needsAsk ? setAsking(row.producer_location_id) : skip(row))}
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
                  <Button type="button" variant="danger" size="sm" disabled={busy} onClick={() => skip(row)} data-testid="rescue-schedule-skip-yes">
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
