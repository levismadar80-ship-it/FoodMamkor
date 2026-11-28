// @ts-check
"use client";

/**
 * Module:   MonthValueLine
 * Purpose:  One line on the dashboard home: what the business got through the
 *           site this month, as bookings and their value (MEH-3194 point 1 —
 *           the value is shown before any price, and in the launch period it is
 *           the whole message).
 * Touches:  GET /producers/me/billing/summary (backend/app/routers/billing.py,
 *           services/billing_summary.py — an Israel calendar month, voided rows
 *           never counted).
 * Does NOT: show to an organizer (the copy says «הזמנות»), or show a fee, a threshold or what the month would cost — never on
 *           this line (Sapir's table). Renders nothing until the read lands,
 *           and nothing when it fails: a missing summary is not an error the
 *           owner can act on.
 * Related:  app/[locale]/producer/dashboard/page.js (mounts it under «מה ממתין לטיפול»).
 * History:  MEH-3194 (creation); MEH-3980 (product orders added in).
 */

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { ChartLineUp } from "@phosphor-icons/react";

import api from "@/lib/api";
import { MyBillingSummaryProducersMeBillingSummaryGetResponse as SummarySchema } from "@/lib/generated/api.zod";
import { formatAgorot } from "@/lib/money";

/**
 * The message key and its values. Sapir's table: 0 / 1 / many, and no
 * «בשווי» part when the value is 0 (free sign-ups only).
 * MEH-3980: product orders are not in the ledger yet (their price is not
 * set), so the summary returns them apart and the line adds them in.
 * @param {{ bookings: number, value_agorot: number, product_orders?: number, product_orders_value_agorot?: number }} s
 * @returns {[string, Record<string, string | number>]}
 */
function monthValueMessage(s) {
  const count = s.bookings + (s.product_orders ?? 0);
  const total = s.value_agorot + (s.product_orders_value_agorot ?? 0);
  if (count <= 0) return ["none", {}];
  const value = total > 0 ? formatAgorot(total) : null;
  const base = count === 1 ? "one" : "many";
  return value ? [`${base}_value`, { count, value }] : [base, { count }];
}

export default function MonthValueLine() {
  const t = useTranslations("dashboard.producer.month_value");
  const [summary, setSummary] = useState(/** @type {{ bookings: number, value_agorot: number, product_orders?: number, product_orders_value_agorot?: number } | null} */ (null));
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let live = true;
    api
      .get("/producers/me/billing/summary")
      .then((r) => {
        const parsed = SummarySchema.safeParse(r.data); // rule 19
        if (!live) return;
        if (parsed.success) setSummary(parsed.data);
        else setFailed(true);
      })
      .catch(() => { if (live) setFailed(true); });
    return () => { live = false; };
  }, []);

  if (failed) return null;
  // While the read is in flight the line's height is held, so the cards below
  // do not jump when it lands (a click into them could otherwise miss).
  if (!summary) return <p className="h-5 mb-6" aria-hidden="true" data-testid="month-value-line-pending" />;
  const [key, values] = monthValueMessage(summary);
  return (
    <p className="flex items-center gap-2 text-sm text-text mb-6" data-testid="month-value-line">
      <ChartLineUp size={18} className="text-primary shrink-0" aria-hidden="true" />
      {t(key, values)}
    </p>
  );
}
