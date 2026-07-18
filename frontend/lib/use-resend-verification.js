"use client";

/**
 * Module:   use-resend-verification
 * Purpose:  Shared resend-verification-email action + status state, so both
 *           the global VerifyBanner nudge and the per-form unverified-email
 *           notice drive the same POST /auth/resend-verify flow identically.
 * Touches:  POST /auth/resend-verify (Resend email, via lib/api).
 * Does NOT: render any UI or gate on auth state — callers own visibility.
 * Related:  components/VerifyBanner.jsx (original inline home of this logic),
 *           components/UnverifiedEmailNotice.jsx (form consumer),
 *           lib/errors.js:isUnverifiedEmailError (the 403 detector).
 * History:  MEH-1164 sub-chunk B (extracted from VerifyBanner.jsx:57-72).
 */

import { useState } from "react";
import { useTranslations } from "next-intl";
import api from "@/lib/api";

/**
 * Resend-verification action + status, extracted verbatim from VerifyBanner so
 * the banner and the form notices can't drift. Rate-limit (429) surfaces the
 * dedicated copy; any other failure surfaces the generic retry copy.
 *
 * @returns {{
 *   resendSent: boolean,
 *   resendSending: boolean,
 *   resendError: string,
 *   handleResend: () => Promise<void>,
 * }}
 */
export function useResendVerification() {
  const t = useTranslations();
  const [resendSent, setResendSent] = useState(false);
  const [resendSending, setResendSending] = useState(false);
  const [resendError, setResendError] = useState("");

  const handleResend = async () => {
    if (resendSending) return;
    setResendSending(true);
    setResendError("");
    try {
      await api.post("/auth/resend-verify");
      setResendSent(true);
    } catch (err) {
      if (err.response?.status === 429) {
        setResendError(t("auth.verify.rate_limited"));
      } else {
        setResendError(t("error.try_again"));
      }
    } finally {
      // finally (not a trailing statement) so a throw inside the catch — e.g.
      // t() — can never leave the button permanently disabled across the 4
      // forms that now share this hook. (PR #1884 review nit.)
      setResendSending(false);
    }
  };

  return { resendSent, resendSending, resendError, handleResend };
}
