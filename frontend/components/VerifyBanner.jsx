"use client";

import { useState } from "react";
import { EnvelopeSimple } from "@phosphor-icons/react";
import { useTranslations } from "next-intl";
import { useAuth } from "@/lib/auth-context";
import api from "@/lib/api";

/**
 * VerifyBanner — email-verification nudge for logged-in, unverified users.
 *
 * Relocated out of Header.jsx (MEH-731): it used to render inside the sticky
 * <header>, which grew the floating-navbar band and pushed the homepage hero
 * down, breaking the pill's floating-over-hero look. Now rendered as the first
 * block of <main> (app/[locale]/layout.js) so the pill stays pure; still shows
 * on every page and while scrolled. Gate unchanged: user && !email_verified.
 *
 * Touches:  POST /auth/resend-verify (Resend email).
 * Does NOT: render any nav chrome — that's Header.jsx.
 * History:  MEH-39 (origin, inside Header); MEH-731 (extracted + relocated).
 */
export default function VerifyBanner() {
  const { user } = useAuth();
  const t = useTranslations();
  const [resendSent, setResendSent] = useState(false);
  const [resendSending, setResendSending] = useState(false);
  const [resendError, setResendError] = useState("");

  // Same condition the banner carried inside Header (user && !verified).
  if (!user || user.email_verified !== false) return null;

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
    }
    setResendSending(false);
  };

  return (
    <div className="bg-amber-50 border-b border-amber-200 px-4 py-2.5 flex items-center justify-center gap-3 text-sm flex-wrap">
      <span className="text-amber-800 inline-flex items-center gap-1"><EnvelopeSimple size={16} className="text-current" />{t("auth.verify.banner")}</span>
      {resendError ? (
        <span className="text-red-600 text-xs font-medium">{resendError}</span>
      ) : !resendSent ? (
        <button
          onClick={handleResend}
          disabled={resendSending}
          className="text-primary hover:underline text-xs font-medium disabled:opacity-50"
        >
          {t("auth.verify.resend")}
        </button>
      ) : (
        <span className="text-green-700 text-xs font-medium">{t("auth.verify.sent")}</span>
      )}
    </div>
  );
}
