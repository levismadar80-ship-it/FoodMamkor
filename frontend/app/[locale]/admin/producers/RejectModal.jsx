"use client";

/**
 * Module:   RejectModal
 * Purpose:  Admin "דחייה" composer — the terminal twin of RequestChangesModal.
 *           Five preset reasons (radio) + optional free text, then a confirm
 *           step because submitting emails the business owner.
 * Touches:  POST /admin/producers/{id}/reject (via use-admin-producers.js) —
 *           this component itself performs no I/O.
 * Does NOT: own the preset LABELS. They are fetched from
 *           GET /admin/producers/rejection-presets and passed in as `presets`,
 *           because the backend composes the persisted reason and the owner's
 *           email from the same dict (MEH-226). A local copy of the Hebrew
 *           here would be a second owner of one fact (workflow.md Smell #1)
 *           and would silently disagree with the email the moment either moved.
 * Related:  app/[locale]/admin/producers/RequestChangesModal.jsx (the
 *           non-terminal sibling — same overlay shell) ·
 *           app/[locale]/admin/producers/page.js (DeleteConfirmDialog — the
 *           MEH-1023/1027 confirm contract this mirrors) ·
 *           __tests__/AdminRejectModal.test.jsx
 * History:  MEH-226 (creation — admin rejection reason UI)
 */

import { useEffect } from "react";
import { useTranslations } from "next-intl";

const OTHER = "other";

export default function RejectModal({
  producer,
  presets,
  presetsError,
  presetKey,
  setPresetKey,
  freeText,
  setFreeText,
  confirming,
  onRequestConfirm,
  onCancelConfirm,
  onClose,
  onSubmit,
  submitting,
}) {
  const t = useTranslations("admin");

  // Escape closes — but never mid-send, mirroring DeleteConfirmDialog's
  // "Escape-unless-deleting" contract (page.js:44). A dismissal during the
  // request would strand the admin with no idea whether the email went out.
  useEffect(() => {
    if (!producer) return undefined;
    const onKey = (e) => {
      if (e.key !== "Escape" || submitting) return;
      if (confirming) onCancelConfirm();
      else onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [producer, submitting, confirming, onCancelConfirm, onClose]);

  if (!producer) return null;

  const trimmed = (freeText || "").trim();
  // Mirrors the backend's own rule (admin.py reject_producer): a preset must
  // be chosen, and "other" additionally requires free text. Checked here only
  // to disable the button — the backend 400s regardless, which is what the
  // guard test asserts.
  const canSubmit = Boolean(presetKey) && (presetKey !== OTHER || trimmed);

  return (
    <div className="fixed inset-0 bg-black/50 z-[9000] flex items-center justify-center p-4">
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="producer-reject-title"
        className="bg-background rounded-[16px] p-6 max-w-lg w-full border border-border text-start"
        data-testid="reject-modal"
      >
        <h2
          id="producer-reject-title"
          className="font-headline-md text-xl font-bold text-text mb-2"
        >
          {t("producers.reject.modal_title")}
        </h2>
        <p className="text-fg-muted text-sm mb-4">&quot;{producer.name}&quot;</p>

        {/* The confirm step replaces the form rather than stacking a second
            overlay on it — one dialog at a time keeps the Escape contract
            above unambiguous. */}
        {confirming ? (
          <>
            <p className="text-text text-sm mb-4" data-testid="reject-confirm-message">
              {t("producers.reject.confirm")}
            </p>
            <div className="flex gap-2 justify-end">
              <button
                type="button"
                onClick={onCancelConfirm}
                disabled={submitting}
                className="px-4 py-2 rounded-[8px] border border-border text-text hover:bg-green-50 disabled:opacity-50"
              >
                {t("common.cancel")}
              </button>
              <button
                type="button"
                onClick={onSubmit}
                disabled={submitting}
                data-testid="reject-confirm-submit"
                className="px-4 py-2 rounded-[8px] text-white bg-red-600 hover:bg-red-700 disabled:opacity-50"
              >
                {submitting
                  ? t("common.sending")
                  : t("producers.reject.submit")}
              </button>
            </div>
          </>
        ) : (
          <>
            {/* Presets come from the backend. If that fetch failed we say so
                and keep the modal unusable rather than falling back to a
                hardcoded list — a fallback list is exactly the second owner
                this component exists to avoid, and it would compose a
                different reason than the email. */}
            {presetsError ? (
              <p
                className="text-red-600 text-sm mb-4"
                role="alert"
                data-testid="reject-presets-error"
              >
                {t("producers.reject.presets_error")}
              </p>
            ) : (
              <fieldset className="mb-3">
                <legend className="block text-sm font-medium text-text mb-2">
                  {t("producers.reject.preset_legend")}
                </legend>
                <div className="space-y-1">
                  {presets.map((p) => (
                    <label
                      key={p.key}
                      className="flex items-start gap-2 text-sm text-text cursor-pointer"
                    >
                      <input
                        type="radio"
                        name="reject-preset"
                        value={p.key}
                        checked={presetKey === p.key}
                        onChange={() => setPresetKey(p.key)}
                        className="mt-1"
                      />
                      <span>{p.label}</span>
                    </label>
                  ))}
                </div>
              </fieldset>
            )}

            <label
              htmlFor="reject-free-text"
              className="block text-sm font-medium text-text mb-1"
            >
              {presetKey === OTHER
                ? t("producers.reject.free_text_label_required")
                : t("producers.reject.free_text_label_optional")}
            </label>
            <textarea
              id="reject-free-text"
              value={freeText}
              onChange={(e) => setFreeText(e.target.value)}
              rows={4}
              className="w-full border border-border rounded-[12px] px-3 py-2 text-sm bg-white"
              placeholder={t("producers.reject.free_text_placeholder")}
            />

            <div className="flex gap-2 justify-end mt-4">
              <button
                type="button"
                onClick={onClose}
                className="px-4 py-2 rounded-[8px] border border-border text-text hover:bg-green-50"
              >
                {t("common.cancel")}
              </button>
              <button
                type="button"
                onClick={onRequestConfirm}
                disabled={!canSubmit}
                data-testid="reject-open-confirm"
                className="px-4 py-2 rounded-[8px] text-white bg-red-600 hover:bg-red-700 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {t("producers.reject.submit")}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
