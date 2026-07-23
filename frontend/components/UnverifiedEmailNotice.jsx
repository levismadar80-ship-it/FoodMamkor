"use client";

/**
 * Module:   UnverifiedEmailNotice
 * Purpose:  Inline notice shown in a producer create form when the API rejects
 *           the publish with the verified-email 403 — the gate message plus a
 *           "שלחו שוב" resend CTA, so the producer can recover in place instead
 *           of hitting a dead-end error string.
 * Touches:  POST /auth/resend-verify (via useResendVerification).
 * Does NOT: detect the error (callers gate on lib/errors.js
 *           :isUnverifiedEmailError) or render other error types.
 * Related:  lib/use-resend-verification.js, lib/errors.js,
 *           components/VerifyBanner.jsx (the global sibling nudge).
 * History:  MEH-1164 sub-chunk B.
 */

import { EnvelopeSimple } from "@phosphor-icons/react";
import { useTranslations } from "next-intl";
import { useResendVerification } from "@/lib/use-resend-verification";

/**
 * @param {{ className?: string }} props  optional extra classes on the wrapper.
 */
export default function UnverifiedEmailNotice({ className = "" }) {
  const t = useTranslations();
  const { resendSent, resendSending, resendError, handleResend } =
    useResendVerification();

  return (
    <div
      role="alert"
      className={`bg-background-alt border border-border rounded-[8px] p-3 text-sm flex items-start gap-2 ${className}`}
    >
      <EnvelopeSimple size={18} className="text-accent mt-0.5 shrink-0" aria-hidden="true" />
      <div className="flex flex-col gap-1">
        <span className="text-text">{t("auth.verify.publish_gate")}</span>
        {resendError ? (
          <span className="text-error text-xs font-medium">{resendError}</span>
        ) : !resendSent ? (
          <button
            type="button"
            onClick={handleResend}
            disabled={resendSending}
            className="text-primary hover:underline text-xs font-medium self-start disabled:opacity-50"
          >
            {t("auth.verify.resend")}
          </button>
        ) : (
          <span className="text-green-700 text-xs font-medium">{t("auth.verify.sent")}</span>
        )}
      </div>
    </div>
  );
}
