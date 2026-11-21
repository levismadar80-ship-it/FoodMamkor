// @ts-check
"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { DownloadSimple } from "@phosphor-icons/react";
import api from "@/lib/api";
import { AdminBillingOverviewAdminBillingOverviewGetResponse as OverviewOut } from "@/lib/generated/api.zod";
import Button from "@/components/ui/Button";
import { showToast } from "@/lib/toast";
import { buildBillingCsv, downloadBillingCsv } from "@/lib/admin-billing-export";

/**
 * Module:   BillingCsvButton
 * Purpose:  MEH-3189 — «ייצוא CSV לחודש» on /admin/billing: reads that
 *           month's overview and downloads it as a CSV for the bookkeeper.
 * Touches:  GET /admin/billing/overview?month=YYYY-MM (read only).
 * Does NOT: build the file (lib/admin-billing-export.js) or hold a number.
 */

/** @param {{ month: string }} props */
export default function BillingCsvButton({ month }) {
  const t = useTranslations("admin.billing");
  const [busy, setBusy] = useState(false);

  const exportMonth = async () => {
    setBusy(true);
    try {
      const r = await api.get(`/admin/billing/overview?month=${month}`);
      // Rule 19: a malformed answer is an error, never a half-filled file.
      const parsed = OverviewOut.safeParse(r.data);
      if (!parsed.success) throw new Error("bad overview");
      const csv = buildBillingCsv(parsed.data, {
        headers: t.raw("csv.headers"),
        yes: t("csv.yes"),
        no: t("csv.no"),
        phaseOn: t("csv.phase_on"),
        phaseOff: t("csv.phase_off"),
      });
      downloadBillingCsv(csv, month);
    } catch {
      showToast.error(t("csv.error"));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Button
      variant="outlined"
      size="sm"
      loading={busy}
      leadingIcon={<DownloadSimple aria-hidden="true" />}
      onClick={exportMonth}
      data-testid={`admin-billing-csv-${month}`}
    >
      {t("csv.button")}
    </Button>
  );
}
