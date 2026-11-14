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

import { useEffect, useRef } from "react";
import { EnvelopeSimple } from "@phosphor-icons/react";
import { useTranslations } from "next-intl";
import { useResendVerification } from "@/lib/use-resend-verification";

/**
 * @param {{ className?: string, live?: boolean, focusOnMount?: boolean }} props
 *   className: extra classes on the wrapper. live (default true): role="alert"
 *   — the 403 case. MEH-2918: the up-front notice passes live={false} (a
 *   standing condition, not an error to interrupt the page with) and, after a
 *   403, is re-mounted with live + focusOnMount so the press visibly answers.
 */
export default function UnverifiedEmailNotice({ className = "", live = true, focusOnMount = false }) {
  const t = useTranslations();
  const ref = useRef(/** @type {HTMLDivElement | null} */ (null));
  useEffect(() => {
    if (!focusOnMount || !ref.current) return;
    ref.current.scrollIntoView?.({ block: "center" });
    ref.current.focus?.({ preventScroll: true });
  }, [focusOnMount]);
  const { resendSent, resendSending, resendError, handleResend } =
    useResendVerification();

  return (
    <div
      ref={ref}
      role={live ? "alert" : undefined}
      tabIndex={focusOnMount ? -1 : undefined}
      data-testid="unverified-email-notice"
      className={`bg-background-alt border border-border rounded-sm p-3 text-sm flex items-start gap-2 ${className}`}
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
            className="text-primary underline decoration-[1.5px] underline-offset-[5px] decoration-primary/35 hover:decoration-current text-xs font-medium self-start disabled:opacity-50"
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
