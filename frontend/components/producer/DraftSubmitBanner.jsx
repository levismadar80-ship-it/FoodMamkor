"use client";

import { useState } from "react";
import { PaperPlaneTilt, Check, Warning } from "@phosphor-icons/react";
import { useTranslations } from "next-intl";
import api from "@/lib/api";
import { detailToMessage } from "@/lib/errors";
import { showToast } from "@/lib/toast";
import PhoneVerifyCard from "@/components/PhoneVerifyCard";
import {
  MISSING_PHONE_VERIFIED,
  SUBMISSION_REQUIREMENTS,
  submissionMissingItems,
} from "@/lib/submission-gate";

/**
 * Module:   DraftSubmitBanner
 * Purpose:  The one actionable surface for a business in `draft` — say what is
 *           still required, let her verify her WhatsApp number in place, and
 *           give her the single "שליחה לבדיקה" action that moves the row into
 *           the admin queue.
 * Touches:  POST /producers/me/submit-for-review (the only writer). Mounts
 *           PhoneVerifyCard, which owns POST /producers/me/verify-phone{,/confirm}.
 * Does NOT: own the completeness ring or the checklist — that is
 *           ProfileCompletenessCard, which answers "how polished is this
 *           profile" and counts things (tagline, opening hours) that do NOT
 *           block submission. Does not render for any status other than
 *           `draft`; the pending / approved / rejected / inactive banners in
 *           dashboard/page.js are untouched.
 * Related:  lib/submission-gate.js (the client mirror of the server rule),
 *           backend/app/routers/producer_me.py submit_for_review (the
 *           authority), components/PhoneVerifyCard.jsx.
 * History:  MEH-2100 (creation).
 *
 * WHY PhoneVerifyCard IS MOUNTED HERE, and why the feature is dead without it.
 * Before MEH-2100 that card existed at exactly one mount point: inside the
 * `pending_whatsapp` banner. Under the draft machine a new registration never
 * reaches `pending_whatsapp`, so the card became unreachable — and
 * `phone_verified` is one of the five submit requirements. The result would
 * have been a gate no business on the site could ever pass. Found in Phase 0;
 * this mount is the fix.
 *
 * The CTA's disabled state is an AFFORDANCE, not the rule. The server re-checks
 * every requirement and 422s regardless, so a client that ignores the button
 * cannot get an incomplete profile into the queue.
 */
export default function DraftSubmitBanner({ producer, onSubmitted, onPhoneVerified }) {
  const t = useTranslations("dashboard.producer.draft");
  const [submitting, setSubmitting] = useState(false);
  const [confirming, setConfirming] = useState(false);
  // Codes the SERVER rejected on the last attempt. Rendered in preference to
  // the local computation, because if the two ever disagree the server is
  // right and the owner needs to see what actually blocked her.
  const [serverMissing, setServerMissing] = useState(null);

  if (!producer) return null;

  const missing = serverMissing ?? submissionMissingItems(producer);
  const ready = missing.length === 0;
  const phoneUnverified = missing.includes(MISSING_PHONE_VERIFIED);

  const handleSubmit = async () => {
    if (submitting || !ready) return;
    setSubmitting(true);
    try {
      await api.post("/producers/me/submit-for-review");
      showToast.success(t("toast_submitted"));
      setServerMissing(null);
      onSubmitted?.();
    } catch (error) {
      const detail = error.response?.data?.detail;
      // 422 carries {code, message, params:{missing}} (MEH-1943 shape). Keep
      // the codes so the list below shows what the SERVER objected to, not
      // what the client guessed.
      const fromServer = detail?.params?.missing;
      if (Array.isArray(fromServer)) setServerMissing(fromServer);
      showToast.error(detailToMessage(detail) || t("toast_error"));
    } finally {
      setSubmitting(false);
      setConfirming(false);
    }
  };

  return (
    <div
      className="bg-primary/5 border border-primary/20 rounded-[16px] p-4 md:p-6 mb-6 text-sm"
      role="status"
      data-testid="draft-submit-banner"
      data-state-ready={ready}
    >
      <p className="font-semibold text-primary mb-1 flex items-center gap-2">
        <PaperPlaneTilt size={18} weight="fill" aria-hidden="true" />
        {t("title")}
      </p>
      <p className="text-fg-muted">{t("body")}</p>

      {/* What is still required. Derived from the gate, so it cannot claim
          "ready" while the server disagrees. */}
      {!ready && (
        <ul className="mt-3 space-y-1" data-testid="draft-missing-list">
          {SUBMISSION_REQUIREMENTS.filter((code) => missing.includes(code)).map(
            (code) => (
              <li
                key={code}
                className="flex items-start gap-2 text-fg-muted"
                data-testid={`draft-missing-${code}`}
              >
                <Warning
                  size={14}
                  weight="fill"
                  className="mt-0.5 shrink-0 text-primary/60"
                  aria-hidden="true"
                />
                <span>{t(`missing.${code}`)}</span>
                <span className="shrink-0 rounded-full bg-primary/10 px-2 text-xs text-primary">
                  {t("chip_required")}
                </span>
              </li>
            ),
          )}
        </ul>
      )}

      {/* MEH-2100: the OTP card, reachable from draft. Without this mount
          phone_verified can never flip and the gate is impassable. */}
      {phoneUnverified && (
        // The anchor the completeness checklist's "אימות וואטסאפ" row targets
        // (MEH-2100). The pending_whatsapp banner carries the same id; only
        // one of the two renders for any given status, so it never collides.
        // The `id` is the scroll anchor; the `data-testid` is how E2E finds it
        // (docs/E2E-LOCATORS.md — an id selector is not a sanctioned locator).
        // Both on one element, added with the spec that uses it rather than
        // sprinkled preemptively. Named for the WRAPPER, not the card: the
        // vitest suite's PhoneVerifyCard stub already owns `phone-verify-card`,
        // and reusing it here made `getByTestId` ambiguous — caught by that
        // suite going red, which is the whole reason it holds the name.
        <div className="mt-4" id="phone-verify" data-testid="draft-phone-verify">
          <PhoneVerifyCard onVerified={() => {
            setServerMissing(null);
            onPhoneVerified?.();
          }} />
        </div>
      )}

      <div className="mt-5">
        {!confirming ? (
          <button
            type="button"
            onClick={() => setConfirming(true)}
            disabled={!ready}
            data-testid="draft-submit-cta"
            aria-describedby={ready ? undefined : "draft-cta-hint"}
            className="inline-flex items-center justify-center gap-2 min-h-[44px] px-6 rounded-full font-medium bg-action-primary hover:bg-action-primary-hover text-white transition-colors focus-ring disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:bg-action-primary"
          >
            <PaperPlaneTilt size={16} weight="bold" aria-hidden="true" />
            {t("submit_cta")}
          </button>
        ) : (
          // Confirm step — submission is one-way for the owner (there is no
          // un-submit), so it asks once rather than firing on the first click.
          <div className="flex flex-wrap items-center gap-3" data-testid="draft-submit-confirm">
            <span className="text-text">{t("confirm_question")}</span>
            <button
              type="button"
              onClick={handleSubmit}
              // `!ready` matters as well as `submitting`: the profile can be
              // refetched between opening this confirm and clicking it (a
              // phone verification completing, an image being removed in
              // another tab), and handleSubmit early-returns on !ready. Without
              // it the owner clicks "yes, send it" into a void — no request, no
              // toast, no explanation. The list above already says what is
              // missing, so a disabled button points at the reason.
              disabled={submitting || !ready}
              data-testid="draft-submit-confirm-yes"
              className="inline-flex items-center justify-center gap-2 min-h-[44px] px-5 rounded-full font-medium bg-action-primary hover:bg-action-primary-hover text-white transition-colors focus-ring disabled:opacity-50"
            >
              <Check size={16} weight="bold" aria-hidden="true" />
              {submitting ? t("confirm_sending") : t("confirm_yes")}
            </button>
            <button
              type="button"
              onClick={() => setConfirming(false)}
              disabled={submitting}
              data-testid="draft-submit-confirm-no"
              className="min-h-[44px] px-4 text-primary hover:underline focus-ring rounded-full"
            >
              {t("confirm_no")}
            </button>
          </div>
        )}
        {!ready && (
          <p id="draft-cta-hint" className="mt-2 text-xs text-fg-muted">
            {t("cta_disabled_hint")}
          </p>
        )}
      </div>
    </div>
  );
}
