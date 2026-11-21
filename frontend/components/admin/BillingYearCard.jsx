// @ts-check
"use client";

import { useTranslations } from "next-intl";
import { formatPrice } from "@/lib/utils";

/**
 * Module:   BillingYearCard
 * Purpose:  MEH-3189 — on /admin/billing, what the site brought in from
 *           January against the exempt-dealer (עוסק פטור) ceiling, with a
 *           warning at 70% and at 90%.
 * Touches:  nothing — renders the `year` block of GET /admin/billing/overview.
 * Does NOT: compute the income or hold the ceiling: both come from the server
 *           (app/services/billing_summary.py year_to_date · app/pricing.py).
 * States:   launch (would-have) · billing (charged) · 0 / under / 70 / 90 ·
 *           a ceiling amount set for an earlier year (shown as stale).
 */

/** @param {number} agorot */
const shekels = (agorot) => formatPrice(Math.round(agorot) / 100);

/** @param {number} agorot */
const amountOf = (agorot) =>
  function Amount() {
    return <span dir="ltr">{shekels(agorot)}</span>;
  };

const FULL = 100;

/** @param {{ year: any, charging: boolean }} props */
export default function BillingYearCard({ year, charging }) {
  const t = useTranslations("admin.billing");
  const income = amountOf(year.income_agorot);
  return (
    <section
      className="mb-4 rounded-lg border border-border bg-surface p-4"
      aria-labelledby="admin-billing-year-title"
      data-testid="admin-billing-year"
    >
      <h2 id="admin-billing-year-title" className="font-semibold text-text">
        {t("year_title")}
      </h2>
      <p className="mt-2 text-sm text-text" data-testid="admin-billing-year-income">
        {charging
          ? t.rich("year_income_on", { year: year.year, amount: income })
          : t.rich("year_income_launch", { year: year.year, amount: income })}
      </p>
      <p className="mt-1 text-sm text-text">
        {t.rich("year_ceiling", {
          ceilingYear: year.ceiling_year,
          percent: year.percent,
          amount: amountOf(year.ceiling_agorot),
        })}
      </p>
      <div
        className="mt-3 h-2 overflow-hidden rounded-full bg-border"
        aria-hidden="true"
      >
        <div
          className="h-full rounded-full bg-primary"
          style={{ width: `${Math.min(FULL, year.percent)}%` }}
        />
      </div>
      {year.alert_percent > 0 ? (
        <p
          className="mt-2 text-sm font-semibold text-text"
          role="status"
          data-testid="admin-billing-year-alert"
        >
          {t("year_alert", { percent: year.alert_percent })}
        </p>
      ) : null}
      {/* Only a LATER year: a past month viewed today is not stale. */}
      {year.year > year.ceiling_year ? (
        <p className="mt-2 text-sm font-medium text-text" data-testid="admin-billing-year-stale">
          {t("year_stale", { ceilingYear: year.ceiling_year, year: year.year })}
        </p>
      ) : null}
      <p className="mt-2 text-xs text-fg-muted">{t("year_note")}</p>
    </section>
  );
}
