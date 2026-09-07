"use client";

/**
 * Module:   RejectedBanner (producer dashboard Overview)
 * Purpose:  The rejected → resubmit loop, owner side (MEH-2210 chunk B). Shows
 *           WHAT did not pass, keyed on the admin's structured reason code,
 *           with a deep link to the card that fixes it, the admin's free text
 *           as a quote, and the "שליחה לבדיקה חוזרת" CTA with its
 *           "שליחה n מתוך 3" caption — or, once the cap is used, the "הגעתן
 *           למספר השליחות המקסימלי" line and the support trigger only.
 * Touches:  POST /producers/me/request-review (producer_me.py, MEH-2210 chunk
 *           A: from `rejected` → `pending`, count += 1, 409 at the cap, 422
 *           from the completeness gate). Nothing else.
 * Does NOT: decide who may resubmit — the cap and the gate are server-side;
 *           this component only mirrors the count it is given. It also does
 *           NOT render for any status but `rejected` (page.js owns that gate).
 * Related:  ChangesRequestedBanner.jsx (the MEH-1236 sibling for the
 *           non-terminal request-changes path — same api call, different
 *           status, deliberately separate components: one is a nag inside
 *           `pending`, this one is the exit from `rejected`);
 *           backend/app/routers/admin.py PRODUCER_REJECTION_PRESETS — the
 *           ONE vocabulary the `code` prop comes from (ruling 2, 04/09).
 * History:  MEH-2210 chunk B (creation; replaces the MEH-1355 rejected block
 *           in page.js, whose three generic tips did not depend on the reason).
 */

import { useState } from "react";
import { Link as LocaleLink } from "@/i18n/navigation";
import { useTranslations } from "next-intl";
import api from "@/lib/api";
import { detailToMessage } from "@/lib/errors";
import { showToast } from "@/lib/toast";

// Mirrors constants.MAX_PRODUCER_RESUBMISSIONS. The server is the authority
// (409 past it); this only decides whether to draw the button at all, so a
// drift here is a cosmetic mismatch, never a bypass.
export const MAX_RESUBMISSIONS = 3;

const EDIT_HUB = "/producer/dashboard/edit";

// preset_key (backend) → the edit-hub card that fixes it. Anchors are the
// edit page's KEY_TO_ANCHOR values (edit/page.js): `license` opens the trust
// group, `images` the profile group, `contact-channels` the contact card that
// holds address / phone / description. `not_eligible` has no card to point
// at — the hint below tells her what to do instead. `other` and a legacy NULL
// code render the free text only.
const CARD_BY_CODE = {
  missing_docs: `${EDIT_HUB}#license`,
  missing_image: `${EDIT_HUB}#images`,
  incomplete_info: `${EDIT_HUB}#contact-channels`,
  not_eligible: null,
};

export default function RejectedBanner({
  reason,
  code,
  count,
  onResubmitted,
  onSupport,
}) {
  const t = useTranslations("dashboard.producer.status.rejected");
  const [status, setStatus] = useState("idle"); // idle | sending | error
  const [errorMsg, setErrorMsg] = useState(null);

  const used = Number.isInteger(count) && count > 0 ? count : 0;
  const capped = used >= MAX_RESUBMISSIONS;
  const known = code != null && Object.prototype.hasOwnProperty.call(CARD_BY_CODE, code);
  const href = known ? CARD_BY_CODE[code] : null;

  const resubmit = async () => {
    setStatus("sending");
    setErrorMsg(null);
    try {
      const res = await api.post("/producers/me/request-review");
      const next = Number.isInteger(res?.data?.resubmission_count)
        ? res.data.resubmission_count
        : used + 1;
      showToast.success(t("resubmit_toast"));
      setStatus("idle");
      onResubmitted?.(next);
    } catch (err) {
      setErrorMsg(detailToMessage(err?.response?.data?.detail) || t("resubmit_error"));
      setStatus("error");
    }
  };

  return (
    <div
      className="bg-red-50 border border-red-200 rounded-[16px] p-4 mb-6 text-sm space-y-3"
      role="alert"
      data-testid="status-rejected-banner"
      data-reason-code={code ?? ""}
      data-resubmissions={used}
    >
      <p className="font-semibold text-red-800">{t("title")}</p>

      {known && (
        <p className="text-red-800" data-testid="status-rejected-line" data-code={code}>
          {href ? (
            <LocaleLink
              href={href}
              className="underline underline-offset-2 hover:text-red-900"
              data-testid="status-rejected-fix-link"
            >
              {t(`by_code.${code}`)}
            </LocaleLink>
          ) : (
            t(`by_code.${code}`)
          )}
        </p>
      )}
      {code === "not_eligible" && (
        <p className="text-red-700" data-testid="status-rejected-hint">
          {t("by_code.not_eligible_hint")}
        </p>
      )}

      {reason && (
        <blockquote
          className="border-s-2 border-red-300 ps-3 text-red-600"
          data-testid="status-rejected-reason"
        >
          {reason}
        </blockquote>
      )}

      {capped ? (
        <p className="text-red-700 font-medium" data-testid="status-rejected-capped">
          {t("capped")}
        </p>
      ) : (
        <div className="flex flex-wrap items-center gap-3">
          <button
            type="button"
            onClick={resubmit}
            disabled={status === "sending"}
            className="inline-flex items-center rounded-full bg-primary px-4 py-2 text-sm font-medium text-white hover:opacity-90 disabled:opacity-60"
            data-testid="status-rejected-resubmit"
          >
            {t("resubmit_cta")}
          </button>
          <span className="text-xs text-red-700" data-testid="status-rejected-caption">
            {t("resubmit_caption", { n: used + 1, max: MAX_RESUBMISSIONS })}
          </span>
        </div>
      )}

      {status === "error" && errorMsg && (
        <p role="alert" className="text-red-700" data-testid="status-rejected-error">
          {errorMsg}
        </p>
      )}

      <button
        type="button"
        onClick={onSupport}
        className="text-primary hover:underline font-medium"
        data-testid="status-rejected-support"
      >
        {t("support_cta")}
      </button>
    </div>
  );
}
