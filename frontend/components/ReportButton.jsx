"use client";

import { useState } from "react";
import Dialog from "@/components/ui/Dialog";
import { useTranslations } from "next-intl";
import { useAuth } from "@/lib/auth-context";
import api from "@/lib/api";
import { detailToMessage } from "@/lib/errors";
import Button from "@/components/ui/Button";

// MEH-2999: `quiet` = the business page's fine-print row — same small grey
// underlined link as its neighbours, led by a « · » separator. The red trigger
// stood out as the loudest thing in the page's fine print.
export default function ReportButton({ producerId, quiet = false }) {
  const t = useTranslations("report");
  const { user } = useAuth();
  const [showModal, setShowModal] = useState(false);
  const [reason, setReason] = useState("");
  const [submitted, setSubmitted] = useState(false);
  const [error, setError] = useState("");


  if (!user) return null;

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!reason.trim()) return;
    try {
      await api.post(`/producers/${producerId}/report`, { reason });
      setSubmitted(true);
    } catch (err) {
      // MEH-959: detailToMessage collapses a 422 array detail to one string
      // so it never renders as a raw React child; no-op for string/absent.
      setError(detailToMessage(err.response?.data?.detail) || t("error_generic"));
    }
  };

  return (
    <>
      {quiet && <span aria-hidden="true" className="me-2">·</span>}
      <button
        type="button"
        onClick={() => setShowModal(true)}
        className={
          quiet
            ? "text-xs text-fg-muted underline hover:text-text transition"
            : "text-sm text-error hover:text-danger-700 transition flex items-center gap-1"
        }
      >
        {t("trigger")}
      </button>

      {showModal && (
        <Dialog labelledBy="report-dialog-title" onClose={() => setShowModal(false)}>
            {submitted ? (
              <div className="text-center">
                <p className="text-lg font-semibold mb-2">{t("success_title")}</p>
                <p className="text-muted mb-4">{t("success_message")}</p>
                <Button
                  onClick={() => { setShowModal(false); setSubmitted(false); setReason(""); }}
                  variant="primary" size="lg"
                >
                  {t("success_close")}
                </Button>
              </div>
            ) : (
              <form onSubmit={handleSubmit}>
                <h3 id="report-dialog-title" className="text-lg font-semibold mb-4">{t("form_heading")}</h3>
                <textarea
                  value={reason}
                  onChange={(e) => setReason(e.target.value)}
                  placeholder={t("reason_placeholder")}
                  className="w-full border rounded-md p-3 mb-3 resize-none h-24"
                  maxLength={500}
                  required
                />
                {error && <p className="text-error text-sm mb-3">{error}</p>}
                <div className="flex gap-3">
                  <button type="submit" className="bg-danger-500 text-white px-6 py-2 rounded-md hover:bg-danger-600">
                    {t("submit")}
                  </button>
                  <button
                    type="button"
                    onClick={() => setShowModal(false)}
                    className="text-muted hover:text-text"
                  >
                    {t("cancel")}
                  </button>
                </div>
              </form>
            )}
        </Dialog>
      )}
    </>
  );
}
