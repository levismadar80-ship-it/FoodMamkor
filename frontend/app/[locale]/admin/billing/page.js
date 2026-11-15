// @ts-check
"use client";

import { useEffect, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { Receipt } from "@phosphor-icons/react";
import api from "@/lib/api";
import { AdminBillingOverviewAdminBillingOverviewGetResponse as OverviewOut } from "@/lib/generated/api.zod";
import InlineMessage from "@/components/ui/InlineMessage";
import { formatPrice } from "@/lib/utils";
import { formatEventDate } from "@/lib/format-date";
import { SkeletonTiles } from "@/components/Skeleton";
import BackLink from "@/components/ui/BackLink";

/**
 * Module:   admin/billing/page
 * Purpose:  MEH-3182 — the admin's read-only view of the billing ledger: how
 *           many businesses passed the results threshold this month, how many
 *           did so two months in a row (the signal to start billing), what
 *           the month WOULD bring in, and the list of businesses behind it.
 * Touches:  GET /admin/billing/overview (read only).
 * Does NOT: charge, change a business's state or hold a price. Every number
 *           comes from the server; the price list is ADR-042 / lib/pricing.js.
 *           No actions yet — the «needs attention» queue, manual corrections
 *           and export arrive with the billing stage (MEH-3180).
 * Related:  backend/app/services/billing_summary.py · admin/AdminLayoutClient.jsx
 *           (the «חיוב» nav entry).
 * History:  MEH-3182 (creation, 2026-11-14); the six-month history (shadow
 *           billing) the same day.
 *
 * Wording (Sapir, 14/11): every number is a full sentence a new admin can
 * read cold. No «סף», no bare tiles; the amount is always spelled out.
 *
 * States (5-state rule): loading · error · 0 businesses · 1 · many. A row is
 * a card, not a table, so the list reads the same on a phone.
 */

/** "2026-11" → "נובמבר 2026". @param {string} label @param {string} locale */
const monthName = (label, locale) =>
  formatEventDate(`${label}-15T12:00:00Z`, locale, {
    month: "long",
    year: "numeric",
  });

/** @param {number} agorot */
const shekels = (agorot) => formatPrice(Math.round(agorot) / 100);

/** An amount inside a sentence, kept left-to-right. @param {number} agorot */
const amountOf = (agorot) =>
  function Amount() {
    return <span dir="ltr">{shekels(agorot)}</span>;
  };

const CARD = "rounded-lg border border-border bg-surface p-4";

/** @param {{ data: any }} props */
function ReadyCard({ data }) {
  const t = useTranslations("admin.billing");
  const count = data.businesses_over_two_months;
  const goal = data.start_billing_businesses;
  const ready = count >= goal;
  return (
    <section
      className={`${CARD} mb-4`}
      aria-labelledby="admin-billing-ready-title"
      data-testid="admin-billing-ready"
    >
      <h2 id="admin-billing-ready-title" className="text-sm text-fg-muted">
        {t("ready_title")}
      </h2>
      <p
        className="mt-1 text-2xl font-bold text-text"
        data-testid="admin-billing-ready-answer"
      >
        {ready ? t("ready_yes") : t("ready_no")}
      </p>
      <p
        className="mt-2 text-sm text-text"
        data-testid="admin-billing-threshold"
      >
        {t.rich("ready_rule", {
          goal,
          months: data.start_billing_months,
          amount: amountOf(data.threshold_agorot),
        })}
      </p>
      <div
        className="mt-3 h-2 overflow-hidden rounded-full bg-border"
        aria-hidden="true"
      >
        <div
          className="h-full rounded-full bg-primary"
          style={{ width: `${Math.min(100, (count / goal) * 100)}%` }}
        />
      </div>
      <p
        className="mt-2 text-sm font-medium text-text"
        data-testid="admin-billing-two-months"
      >
        {t("ready_progress", { count, goal })}
      </p>
    </section>
  );
}

/** @param {{ data: any }} props */
function MonthCard({ data }) {
  const t = useTranslations("admin.billing");
  const locale = useLocale();
  return (
    <section
      className={`${CARD} mb-8`}
      aria-labelledby="admin-billing-month-title"
    >
      <h2 id="admin-billing-month-title" className="font-semibold text-text">
        {t("month_title", { month: monthName(data.month, locale) })}
      </h2>
      <dl className="mt-3 space-y-3 text-sm">
        <div className="flex items-baseline justify-between gap-4">
          <dt className="text-fg-muted">
            {t.rich("month_over_label", {
              amount: amountOf(data.threshold_agorot),
            })}
          </dt>
          <dd
            className="numeric shrink-0 text-lg font-bold text-text"
            data-testid="admin-billing-over"
          >
            {data.businesses_over_threshold}
          </dd>
        </div>
        <div className="flex items-baseline justify-between gap-4">
          <dt className="text-fg-muted">{t("month_would_label")}</dt>
          <dd
            className="numeric shrink-0 text-lg font-bold text-text"
            dir="ltr"
            data-testid="admin-billing-would-pay"
          >
            {shekels(data.would_pay_total_agorot)}
          </dd>
        </div>
      </dl>
    </section>
  );
}

/** @param {{ row: any, threshold: number }} props */
function BusinessRow({ row, threshold }) {
  const t = useTranslations("admin.billing");
  return (
    <li className={CARD} data-testid="admin-billing-row">
      <h3 className="break-words font-semibold text-text">{row.name}</h3>
      <p className="mt-1 text-sm text-fg-muted">
        {t.rich("row_bookings", {
          count: row.bookings,
          amount: amountOf(row.value_agorot),
        })}
      </p>
      <p className="mt-1 text-sm text-text">
        {row.over_threshold
          ? t.rich("row_over", {
              months: row.months_over_in_a_row,
              amount: amountOf(threshold),
            })
          : t.rich("row_under", { amount: amountOf(threshold) })}
      </p>
      {row.over_threshold ? (
        <p className="mt-1 text-sm font-medium text-text">
          {t.rich("row_would_pay", { amount: amountOf(row.would_pay_agorot) })}
        </p>
      ) : null}
    </li>
  );
}

/** @param {{ past: any, threshold: number }} props */
function HistoryMonth({ past, threshold }) {
  const t = useTranslations("admin.billing");
  const locale = useLocale();
  /** @type {import("react").ReactNode} */
  let line = t("history_none");
  if (past.businesses > 0) {
    line =
      past.businesses_over_threshold === 0
        ? t.rich("history_nobody", { amount: amountOf(threshold) })
        : t.rich("history_line", {
            over: past.businesses_over_threshold,
            amount: amountOf(past.would_pay_total_agorot),
          });
  }
  return (
    <li className="px-4 py-3 text-sm" data-testid="admin-billing-history-month">
      <p className="font-medium text-text">{monthName(past.month, locale)}</p>
      <p className="mt-0.5 text-fg-muted">{line}</p>
    </li>
  );
}

export default function AdminBillingPage() {
  const t = useTranslations("admin");
  const [data, setData] = useState(/** @type {any} */ (null));
  const [loadError, setLoadError] = useState(false);

  useEffect(() => {
    api
      .get("/admin/billing/overview")
      .then((r) => {
        // Rule 19: an answer missing a field (an older server) is an error,
        // never a half-filled screen.
        const parsed = OverviewOut.safeParse(r.data);
        if (parsed.success) setData(parsed.data);
        else setLoadError(true);
      })
      .catch(() => setLoadError(true));
  }, []);

  const header = (
    <div className="mb-6">
      <BackLink href="/admin" label={t("common.back_to_dashboard")} />
      <h1 className="mt-1 font-headline-md text-2xl font-bold text-text">
        {t("billing.title")}
      </h1>
      <p className="mt-1 text-sm text-fg-muted">{t("billing.lead")}</p>
    </div>
  );

  if (loadError) {
    return (
      <div>
        {header}
        <InlineMessage
          variant="box"
          className="rounded-md p-3"
          data-testid="admin-billing-error"
        >
          {t("billing.load_error")}
        </InlineMessage>
      </div>
    );
  }
  if (!data) {
    return (
      <div>
        {header}
        <SkeletonTiles
          count={2}
          label={t("common.loading")}
          testId="admin-billing-loading"
        />
      </div>
    );
  }

  // "On" only for the one value that means it; anything else reads as off.
  const charging = data.phase === "billing";
  // The current month is the first history line; the list below it is the past.
  const earlier = data.history.filter(
    (/** @type {any} */ past) => past.month !== data.month,
  );

  return (
    <div data-testid="admin-billing">
      {header}

      <div
        className={`${CARD} mb-4`}
        role="status"
        data-testid="admin-billing-switch"
      >
        <p className="font-semibold text-text">
          {charging
            ? t("billing.switch_on_title")
            : t("billing.switch_off_title")}
        </p>
        <p className="mt-1 text-sm text-fg-muted">
          {charging
            ? t("billing.switch_on_body")
            : t("billing.switch_off_body")}
        </p>
      </div>

      <ReadyCard data={data} />
      <MonthCard data={data} />

      <section aria-labelledby="admin-billing-rows-title">
        <h2
          id="admin-billing-rows-title"
          className="mb-3 font-semibold text-text"
        >
          {t("billing.rows_title")}
        </h2>
        {data.rows.length === 0 ? (
          <div
            className="py-10 text-center text-fg-muted"
            data-testid="admin-billing-empty"
          >
            <Receipt
              size={32}
              className="mx-auto mb-3 text-fg-muted"
              aria-hidden="true"
            />
            <p>{t("billing.empty")}</p>
          </div>
        ) : (
          <ul className="space-y-3" data-testid="admin-billing-rows">
            {data.rows.map((/** @type {any} */ row) => (
              <BusinessRow
                key={row.producer_id}
                row={row}
                threshold={data.threshold_agorot}
              />
            ))}
          </ul>
        )}
      </section>

      <section
        className="mt-8"
        aria-labelledby="admin-billing-history-title"
        data-testid="admin-billing-history"
      >
        <h2
          id="admin-billing-history-title"
          className="mb-1 font-semibold text-text"
        >
          {t("billing.history_title")}
        </h2>
        <p className="mb-3 text-sm text-fg-muted">
          {t("billing.history_lead")}
        </p>
        <ul className="divide-y divide-border rounded-lg border border-border bg-surface">
          {earlier.map((/** @type {any} */ past) => (
            <HistoryMonth
              key={past.month}
              past={past}
              threshold={data.threshold_agorot}
            />
          ))}
        </ul>
      </section>
    </div>
  );
}
