// @ts-check
"use client";

/**
 * Module:   ShareVisitsLine
 * Purpose:  MEH-3331 — one line on the insights page: how many visits came
 *           through links the owner shared (share kit, link-everywhere) in the
 *           last 30 days. Hidden at 0 and on a payload without the key, so a
 *           business that never shared sees nothing new.
 * Does NOT: count anything (backend producer_insights `share_visits`).
 * Related:  app/[locale]/producer/dashboard/insights/page.js (mount point).
 * History:  MEH-3331 (creation).
 */

import { useTranslations } from "next-intl";
import { ShareNetwork } from "@phosphor-icons/react";

/** @param {{ windows?: { last_30d?: number } | null }} props */
export default function ShareVisitsLine({ windows }) {
  const t = useTranslations("dashboard.producer.analytics");
  const count = windows?.last_30d || 0;
  if (count <= 0) return null;
  return (
    <p data-testid="insights-share-visits" className="flex items-center gap-2 text-sm text-text">
      <ShareNetwork size={18} aria-hidden="true" className="text-primary shrink-0" />
      {t("share_visits", { count })}
    </p>
  );
}
