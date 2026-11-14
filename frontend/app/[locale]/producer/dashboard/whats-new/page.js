// @ts-check
"use client";

/**
 * Module:   producer/dashboard/whats-new/page
 * Purpose:  «מה חדש במהמקור» — every release that had news for businesses,
 *           newest first, month + year per release (MEH-3200). Opening it
 *           marks the newest release as seen, so the home card and the row's
 *           dot go away.
 * Does NOT: hold the text (messages/*.json dashboard.producer.whats_new) or
 *           the list (lib/whats-new.js).
 * Related:  components/producer/WhatsNewCard.jsx, WhatsNewRow.jsx (the two
 *           ways in, both on the dashboard home); lib/business-features.js
 *           DASHBOARD_SUBPAGES (its placement entry).
 * History:  MEH-3200 (creation).
 */

import { useEffect } from "react";
import { useLocale, useTranslations } from "next-intl";
import BackLink from "@/components/ui/BackLink";
import { ReleaseLines } from "@/components/producer/WhatsNewCard";
import { markAllSeen } from "@/hooks/useWhatsNew";
import { formatDate } from "@/lib/format-date";
import { visibleReleases } from "@/lib/whats-new";

export default function ProducerDashboardWhatsNewPage() {
  const t = useTranslations("dashboard.producer.whats_new");
  const tQr = useTranslations("qr_card");
  const locale = useLocale();
  const releases = visibleReleases();

  useEffect(() => {
    markAllSeen();
  }, []);

  return (
    <div className="max-w-3xl mx-auto px-4 py-10" data-testid="whats-new-page">
      <BackLink href="/producer/dashboard" label={tQr("back")} />
      <h1 className="font-headline-lg text-3xl font-bold text-text mt-1 mb-2">{t("page_title")}</h1>
      <p className="text-sm text-fg-muted mb-6">{t("page_subtitle")}</p>
      {releases.length === 0 ? (
        <p data-testid="whats-new-empty" className="text-sm text-fg-muted">{t("empty")}</p>
      ) : (
        <ol className="space-y-4" role="list">
          {releases.map((r, i) => (
            <li
              key={r.version}
              data-testid="whats-new-release"
              className="bg-surface border border-border rounded-lg p-4"
            >
              <p className="text-xs text-fg-muted mb-2">
                {formatDate(r.date, locale, "monthYear")}
                {i === 0 && (
                  <>
                    {" · "}
                    <span className="text-primary font-semibold">{t("latest_label")}</span>
                  </>
                )}
              </p>
              <ReleaseLines releaseKey={r.key} count={r.items} />
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}
