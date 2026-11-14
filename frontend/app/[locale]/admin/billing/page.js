// @ts-check
"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { Receipt } from "@phosphor-icons/react";
import api from "@/lib/api";
import { AdminBillingOverviewAdminBillingOverviewGetResponse as OverviewOut } from "@/lib/generated/api.zod";
import InlineMessage from "@/components/ui/InlineMessage";
import { formatPrice } from "@/lib/utils";
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
 * History:  MEH-3182 (creation, 2026-11-14).
 *
 * States (5-state rule): loading · error · 0 businesses · 1 · many. A row is
 * a card, not a table, so the list reads the same on a phone.
 */

/** @param {number} agorot */
const shekels = (agorot) => formatPrice(Math.round(agorot) / 100);

/** @param {{ label: string, value: import("react").ReactNode, note?: string, testId: string }} props */
function Tile({ label, value, note, testId }) {
  return (
    <div className="rounded-md border border-border bg-surface p-4" data-testid={testId}>
      <p className="text-sm text-fg-muted">{label}</p>
      <p className="numeric mt-1 text-2xl font-bold text-text">{value}</p>
      {note ? <p className="mt-1 text-xs text-fg-muted">{note}</p> : null}
    </div>
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
      <h1 className="mt-1 font-headline-md text-2xl font-bold text-text">{t("billing.title")}</h1>
      <p className="mt-1 text-sm text-fg-muted">{t("billing.lead")}</p>
    </div>
  );

  if (loadError) {
    return (
      <div>
        {header}
        <InlineMessage variant="box" className="rounded-md p-3" data-testid="admin-billing-error">
          {t("billing.load_error")}
        </InlineMessage>
      </div>
    );
  }
  if (!data) {
    return (
      <div>
        {header}
        <SkeletonTiles count={4} label={t("common.loading")} testId="admin-billing-loading" />
      </div>
    );
  }

  // "On" only for the one value that means it; anything else reads as off.
  const charging = data.phase === "billing";

  return (
    <div data-testid="admin-billing">
      {header}

      <div className="mb-6 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Tile testId="admin-billing-over" label={t("billing.stat_over")} value={data.businesses_over_threshold} />
        <Tile
          testId="admin-billing-two-months"
          label={t("billing.stat_two_months")}
          value={data.businesses_over_two_months}
          note={t("billing.stat_two_months_goal", { goal: data.start_billing_businesses })}
        />
        <Tile
          testId="admin-billing-would-pay"
          label={t("billing.stat_would")}
          value={<span dir="ltr">{shekels(data.would_pay_total_agorot)}</span>}
        />
        <Tile
          testId="admin-billing-switch"
          label={t("billing.stat_switch")}
          value={charging ? t("billing.switch_on") : t("billing.switch_off")}
        />
      </div>

      <p className="mb-4 text-sm text-fg-muted" data-testid="admin-billing-threshold">
        {t.rich("billing.threshold_line", {
          amount: () => <span dir="ltr">{shekels(data.threshold_agorot)}</span>,
        })}
      </p>

      {data.rows.length === 0 ? (
        <div className="py-16 text-center text-fg-muted" data-testid="admin-billing-empty">
          <Receipt size={32} className="mx-auto mb-3 text-fg-muted" aria-hidden="true" />
          <p>{t("billing.empty")}</p>
        </div>
      ) : (
        <ul className="space-y-3" data-testid="admin-billing-rows">
          {data.rows.map((row) => (
            <li
              key={row.producer_id}
              className="rounded-lg border border-border bg-surface p-4"
              data-testid="admin-billing-row"
            >
              <div className="flex items-start justify-between gap-3">
                <h2 className="min-w-0 break-words font-semibold text-text">{row.name}</h2>
                <span
                  className={`shrink-0 rounded-full px-2 py-0.5 text-xs font-medium ${
                    row.over_threshold ? "bg-green-50 text-primary" : "border border-border text-fg-muted"
                  }`}
                >
                  {row.over_threshold
                    ? t("billing.row_over", { months: row.months_over_in_a_row })
                    : t("billing.row_under")}
                </span>
              </div>
              <p className="mt-2 text-sm text-fg-muted">
                {t("billing.row_bookings", { count: row.bookings })}
                {" · "}
                <span dir="ltr">{shekels(row.value_agorot)}</span>
              </p>
              {row.over_threshold ? (
                <p className="mt-1 text-sm text-text">
                  {t.rich("billing.row_would_pay", {
                    amount: () => <span dir="ltr">{shekels(row.would_pay_agorot)}</span>,
                  })}
                </p>
              ) : null}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
