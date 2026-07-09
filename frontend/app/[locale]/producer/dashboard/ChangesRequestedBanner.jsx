"use client";

/**
 * Module:   ChangesRequestedBanner (producer dashboard Overview)
 * Purpose:  Surface the admin's completion request ("נשאר להשלים") to the
 *           owner when a request-changes was sent (MEH-1011) so she knows
 *           exactly what to fix before approval. Read-only display.
 * Touches:  none — reads profile.requested_changes / changes_requested_at
 *           off GET /producers/me (exposed on ProducerOwnerOut, MEH-1025 Ch A).
 * Does NOT: edit / dismiss / resubmit the field — display only. The admin
 *           side lives in admin/producers (MEH-1011 Chunk 2).
 * Related:  producer/dashboard/page.js (renders this + suppresses the generic
 *           pending banner when requested_changes is set).
 * History:  MEH-1025 Chunk B (creation).
 */

import { Link as LocaleLink } from "@/i18n/navigation";
import { useTranslations } from "next-intl";
import { ClipboardText } from "@phosphor-icons/react";

export default function ChangesRequestedBanner({ profile }) {
  const t = useTranslations("dashboard.producer.changes_requested");
  const feedback = profile?.requested_changes;
  if (!feedback) return null; // requested_changes = null → 0 DOM

  // dir="ltr" so the RTL page doesn't flip the date segments (MEH-1011 Ch2
  // precedent, AdminProducersTable.jsx:45). he-IL formatting to match.
  const date = profile.changes_requested_at
    ? new Date(profile.changes_requested_at).toLocaleDateString("he-IL")
    : null;

  return (
    <div
      // accent (gold) tint — an ACTION to take, not a failure (contrast the
      // red rejected banner). Title + body use dark text-text for WCAG on the
      // pale tint; only the icon carries the accent gold (Sapir contrast note).
      className="bg-accent/10 border border-accent/30 rounded-[16px] p-4 mb-6"
      role="status"
      data-testid="changes-requested-banner"
      aria-label={t("aria")}
    >
      <div className="flex items-start gap-3">
        <ClipboardText size={20} weight="fill" className="text-accent shrink-0 mt-0.5" aria-hidden="true" />
        <div className="min-w-0">
          <p className="font-semibold text-text mb-1">{t("title")}</p>
          <p className="text-text text-sm whitespace-pre-wrap">{feedback}</p>
          {date && (
            <p className="text-fg-muted text-xs mt-1">
              <span dir="ltr" className="tabular-nums">{date}</span>
            </p>
          )}
          <LocaleLink
            href="/producer/dashboard/edit"
            data-testid="changes-requested-cta"
            className="inline-block mt-3 bg-accent text-white px-4 py-2 rounded-[10px] text-xs font-medium hover:opacity-90 transition"
          >
            {t("cta")}
          </LocaleLink>
        </div>
      </div>
    </div>
  );
}
