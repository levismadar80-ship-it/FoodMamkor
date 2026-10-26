"use client";

import { useState } from "react";
import { PaperPlaneTilt, Check, Warning } from "@phosphor-icons/react";
import { useTranslations } from "next-intl";
import api from "@/lib/api";
import { detailToMessage } from "@/lib/errors";
import { showToast } from "@/lib/toast";
import { Link } from "@/i18n/navigation";
import PhoneVerifyCard from "@/components/PhoneVerifyCard";
import {
  MISSING_CATEGORY,
  MISSING_IMAGE,
  MISSING_LOCATION,
  MISSING_PHONE_VERIFIED,
  MISSING_PRODUCT,
  SUBMISSION_REQUIREMENTS,
  isDeliveryOnly,
  submissionMissingItems,
} from "@/lib/submission-gate";

// MEH-2327: where each missing item is filled in. Every target is an anchor
// already registered in lib/dashboard-edit-anchors.js (the edit page's deep-
// link contract) — the same ones ProfileCompletenessCard's steps use. DO NOT
// invent an id here: an unregistered hash leaves the owner on the edit hub
// with the card closed, which is the MEH-2262 failure.
const EDIT_HUB = "/producer/dashboard/edit";
const MISSING_TARGETS = {
  [MISSING_IMAGE]: `${EDIT_HUB}#profile-images`,
  [MISSING_PRODUCT]: `${EDIT_HUB}#profile-products`,
  [MISSING_CATEGORY]: `${EDIT_HUB}#profile-categories`,
  [MISSING_LOCATION]: `${EDIT_HUB}#locations`,
  // Same page: the OTP card is mounted inside this banner, below the list.
  [MISSING_PHONE_VERIFIED]: "#phone-verify",
};

/** The fill-in target for a missing code. A delivery-only business has no
 *  locations to add — the gate reads its delivery declaration instead
 *  (submission-gate.js hasLocation), so that is where she is sent. */
function missingItemHref(code, producer) {
  if (code === MISSING_LOCATION && isDeliveryOnly(producer)) {
    return `${EDIT_HUB}#delivery`;
  }
  return MISSING_TARGETS[code];
}

// 44px tall: the list is now a column of tap targets on a phone.
const LINK_CLASS =
  "inline-flex items-center min-h-[44px] text-primary underline underline-offset-2 hover:text-primary-dark focus-ring rounded";

/** The item label as a link to where it is filled in. A same-page hash is a
 *  plain anchor (no route change); an edit-page target goes through the
 *  locale-aware Link so /en stays /en. A code with no target renders as text,
 *  so a sixth requirement added to the gate can never render a dead link. */
function MissingItemLink({ code, producer, children }) {
  const href = missingItemHref(code, producer);
  const testId = `draft-missing-link-${code}`;
  if (!href) return <span>{children}</span>;
  if (href.startsWith("#")) {
    return (
      <a href={href} className={LINK_CLASS} data-testid={testId}>
        {children}
      </a>
    );
  }
  return (
    <Link href={href} className={LINK_CLASS} data-testid={testId}>
      {children}
    </Link>
  );
}

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
 * History:  MEH-2100 (creation); MEH-2327 (each missing item links to the
 *           card where it is filled in).
 *
 * WHY PhoneVerifyCard IS MOUNTED HERE, and why the feature is dead without it.
 * Before MEH-2100 that card existed at exactly one mount point: inside the
 * `pending_whatsapp` banner. Under the draft machine a new registration never
 * reached that status, so the card became unreachable — and `phone_verified`
 * is one of the five submit requirements. The result would have been a gate no
 * business on the site could ever pass. Found in Phase 0; this mount is the
 * fix, and since that status was removed in MEH-2124 it is the ONLY mount.
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
        <ul className="mt-2" data-testid="draft-missing-list">
          {SUBMISSION_REQUIREMENTS.filter((code) => missing.includes(code)).map(
            (code) => (
              <li
                key={code}
                className="flex items-center gap-2 text-fg-muted"
                data-testid={`draft-missing-${code}`}
              >
                <Warning
                  size={14}
                  weight="fill"
                  className="shrink-0 text-primary/60"
                  aria-hidden="true"
                />
                <MissingItemLink code={code} producer={producer}>
                  {t(`missing.${code}`)}
                </MissingItemLink>
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
        // (MEH-2100). A second banner used to carry the same id; it went with
        // the `pending_whatsapp` status, removed in MEH-2124, so this is now
        // the only element on the page bearing it.
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
