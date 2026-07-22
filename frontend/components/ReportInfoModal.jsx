"use client";

/**
 * ReportInfoModal — "מצאתן טעות בפרטים?" (MEH-1443)
 *
 * A discreet report form mounted from the producer page ContactCard. On
 * submit it POSTs {producer_slug, message, reporter_email?} to the
 * email-only backend endpoint (v1 — no persistence) and shows a success
 * toast. Mirrors CategoryRequestModal.jsx: controlled open/close, Escape +
 * backdrop close, focus return, RTL panel, showToast idiom (MEH-1245/685).
 *
 * Scope: additive. The only producer-page change is the link that opens
 * this + the mount — the ContactCard contact block itself is untouched.
 */

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { useFocusReturn } from "@/lib/use-focus-return";
import { showToast } from "@/lib/toast";
import api from "@/lib/api";

export default function ReportInfoModal({ open, onClose, producerSlug }) {
  const t = useTranslations("modals.report_info");
  const [message, setMessage] = useState("");
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);

  useFocusReturn(open);

  // WCAG 2.1 §2.1.2 — Escape closes the dialog.
  useEffect(() => {
    if (!open) return;
    const handleKey = (e) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", handleKey);
    return () => document.removeEventListener("keydown", handleKey);
  }, [open, onClose]);

  if (!open) return null;

  const canSubmit = message.trim().length > 0;

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!canSubmit || !producerSlug) return;
    setLoading(true);
    try {
      await api.post("/reports/producer-info", {
        producer_slug: producerSlug,
        message: message.trim(),
        reporter_email: email.trim() || null,
      });
      showToast.success(t("toasts.success"), { duration: 4000 });
      setMessage("");
      setEmail("");
      onClose();
    } catch {
      showToast.error(t("toasts.error"));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="report-info-title"
      className="fixed inset-0 z-[9000] flex items-center justify-center p-4 bg-black/40"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        className="bg-white rounded-[16px] shadow-xl w-full max-w-sm p-6 text-right"
        dir="rtl"
      >
        <h2
          id="report-info-title"
          className="font-headline-md text-lg font-bold text-text mb-4"
        >
          {t("title")}
        </h2>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <textarea
              autoFocus
              required
              maxLength={1000}
              rows={4}
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              placeholder={t("placeholder")}
              className="w-full border rounded-[12px] px-3 py-2 text-sm text-right resize-none"
              dir="rtl"
            />
          </div>

          <div>
            <label
              htmlFor="report-info-email"
              className="block text-xs text-fg-muted mb-1"
            >
              {t("email_label")}
            </label>
            <input
              id="report-info-email"
              type="email"
              maxLength={254}
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full border rounded-[12px] px-3 py-2 text-sm text-right"
              dir="rtl"
            />
          </div>

          <div className="flex gap-3 pt-1">
            <button
              type="submit"
              disabled={loading || !canSubmit}
              className="flex-1 bg-primary text-white py-2 rounded-[12px] text-sm font-medium hover:bg-primary-dark transition disabled:opacity-50"
            >
              {loading ? t("submit_loading") : t("submit")}
            </button>
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 rounded-[12px] text-sm text-fg-muted hover:text-text border transition"
            >
              {t("close")}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
