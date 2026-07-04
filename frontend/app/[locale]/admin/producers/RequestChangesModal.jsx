"use client";

/**
 * RequestChangesModal — admin "בקשת השלמה" composer for a pending producer.
 *
 * MEH-1011 Chunk 2. Opened two ways (both wired in use-admin-producers.js):
 *   1. the row "בקשת השלמה" button (empty textarea), or
 *   2. auto-opened when POST /approve returns 422 (photo / license gate) with
 *      the gate-matched quick-fill chip pre-filled.
 * Submit → POST /admin/producers/{id}/request-changes {feedback}. Mirrors the
 * recipes feedback modal (admin/recipes/page.js:194) — same overlay + textarea
 * shell; adds quick-fill chips for the two known approve-gate reasons.
 */

import { useTranslations } from "next-intl";

export default function RequestChangesModal({
  producer, feedback, setFeedback, onClose, onSubmit, submitting,
}) {
  const t = useTranslations("admin");
  if (!producer) return null;

  const chips = [
    t("producers.request_changes.chips.photo"),
    t("producers.request_changes.chips.license"),
  ];

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
      <div className="bg-background rounded-[16px] p-6 max-w-lg w-full border border-border">
        <h2 className="font-headline-md text-xl font-bold text-text mb-2">
          {t("producers.request_changes.modal_title")}
        </h2>
        <p className="text-fg-muted text-sm mb-4">&quot;{producer.name}&quot;</p>

        {/* Quick-fill chips for the two known approve-gate reasons. */}
        <div className="flex flex-wrap gap-2 mb-3">
          {chips.map((chip) => (
            <button
              key={chip}
              type="button"
              onClick={() => setFeedback(chip)}
              className="text-xs px-3 py-1 rounded-full border border-border bg-white text-text hover:bg-green-50"
            >
              {chip}
            </button>
          ))}
        </div>

        <label className="block text-sm font-medium text-text mb-1">
          {t("producers.request_changes.modal_label")}
        </label>
        <textarea
          value={feedback}
          onChange={(e) => setFeedback(e.target.value)}
          rows={5}
          className="w-full border border-border rounded-[12px] px-3 py-2 text-sm bg-white"
          placeholder={t("producers.request_changes.modal_placeholder")}
        />

        <div className="flex gap-2 justify-end mt-4">
          <button
            onClick={onClose}
            disabled={submitting}
            className="px-4 py-2 rounded-[8px] border border-border text-text hover:bg-green-50 disabled:opacity-50"
          >
            {t("common.cancel")}
          </button>
          <button
            onClick={onSubmit}
            disabled={submitting}
            className="px-4 py-2 rounded-[8px] text-white bg-accent hover:opacity-90 disabled:opacity-50"
          >
            {submitting ? t("common.sending") : t("producers.request_changes.submit")}
          </button>
        </div>
      </div>
    </div>
  );
}
