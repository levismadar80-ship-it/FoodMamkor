"use client";

/**
 * Module:   ChangesRequestedBanner (producer dashboard Overview)
 * Purpose:  Surface the admin's completion request ("נשאר להשלים") to the
 *           owner when a request-changes was sent (MEH-1011) so she knows
 *           exactly what to fix before approval. Read-only display.
 * Touches:  none — reads profile.requested_changes / changes_requested_at
 *           off GET /producers/me (exposed on ProducerOwnerOut, MEH-1025 Ch A).
 * Does NOT: edit / dismiss the requested_changes field — display only. The
 *           admin side lives in admin/producers (MEH-1011 Chunk 2). The
 *           resubmit button (MEH-1236) is notification-only — it does NOT
 *           mutate requested_changes (that column stays admin-owned).
 * Related:  producer/dashboard/page.js (renders this + suppresses the generic
 *           pending banner when requested_changes is set);
 *           POST /producers/me/request-review (producer_me.py, MEH-1236).
 * History:  MEH-1025 Chunk B (creation); MEH-1236 (resubmit-for-review button).
 */

import { useState } from "react";
import { Link as LocaleLink } from "@/i18n/navigation";
import { useTranslations } from "next-intl";
import { ClipboardText, CheckCircle, Warning } from "@phosphor-icons/react";
import api from "@/lib/api";
import { detailToMessage } from "@/lib/errors";

export default function ChangesRequestedBanner({ profile }) {
  const t = useTranslations("dashboard.producer.changes_requested");
  const feedback = profile?.requested_changes;
  // MEH-1236: resubmit state is session-local — a fresh /producers/me fetch
  // won't reflect it (notification-only, no DB flag), so once "sent" the button
  // stays a confirmation line for the rest of the session.
  const [status, setStatus] = useState("idle"); // idle | sending | sent | error
  const [errorMsg, setErrorMsg] = useState(null);
  if (!feedback) return null; // requested_changes = null → 0 DOM

  const resubmit = async () => {
    setStatus("sending");
    setErrorMsg(null);
    try {
      await api.post("/producers/me/request-review");
      setStatus("sent");
    } catch (err) {
      setErrorMsg(detailToMessage(err?.response?.data?.detail) || t("resubmit_error"));
      setStatus("error");
    }
  };

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
          <div className="flex flex-wrap items-center gap-2 mt-3">
            <LocaleLink
              href="/producer/dashboard/edit"
              data-testid="changes-requested-cta"
              className="inline-block bg-accent text-white px-4 py-2 rounded-[10px] text-xs font-medium hover:opacity-90 transition"
            >
              {t("cta")}
            </LocaleLink>

            {/* MEH-1236: resubmit affordance — once she's completed the details
                she tells the admin to re-check, closing the loop. Notification
                only; on success the button becomes a confirmation line for the
                rest of the session. */}
            {status === "sent" ? (
              <p
                className="inline-flex items-center gap-1.5 text-xs font-medium text-primary"
                data-testid="resubmit-sent"
                role="status"
              >
                <CheckCircle size={16} weight="fill" aria-hidden="true" className="shrink-0" />
                {t("resubmit_sent")}
              </p>
            ) : (
              <button
                type="button"
                onClick={resubmit}
                disabled={status === "sending"}
                data-testid="resubmit-button"
                className="inline-block border border-accent/40 text-accent px-4 py-2 rounded-[10px] text-xs font-medium hover:bg-accent/10 transition disabled:opacity-60"
              >
                {status === "sending" ? t("resubmit_sending") : t("resubmit_cta")}
              </button>
            )}
          </div>

          {status === "error" && errorMsg && (
            <p className="mt-2 flex items-center gap-1.5 text-xs text-error" role="alert">
              <Warning size={15} weight="fill" aria-hidden="true" className="shrink-0" />
              {errorMsg}
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
