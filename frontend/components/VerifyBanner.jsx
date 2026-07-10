"use client";

import { useState } from "react";
import { EnvelopeSimple, X } from "@phosphor-icons/react";
import { useTranslations } from "next-intl";
import { useAuth } from "@/lib/auth-context";
import api from "@/lib/api";

// MEH-1071: per-session dismiss key. sessionStorage (not localStorage) so the
// nudge returns in a fresh browser session but stays gone for the current one.
const DISMISS_KEY = "verify-banner-dismissed";

/**
 * VerifyBanner — email-verification nudge for logged-in, unverified users.
 *
 * Relocated out of Header.jsx (MEH-731): it used to render inside the sticky
 * <header>, which grew the floating-navbar band and pushed the homepage hero
 * down, breaking the pill's floating-over-hero look. Now rendered as the first
 * block of <main> (app/[locale]/layout.js) so the pill stays pure; still shows
 * on every page and while scrolled. Gate: user && !email_verified && !dismissed.
 *
 * MEH-1071: on-brand restyle (bg-background-alt + border-border, replacing the
 * off-token amber surface; EnvelopeSimple gold accent) + a per-session dismiss
 * (Phosphor X on the end side, 44px target) that writes sessionStorage so the
 * banner stays hidden for the session and returns in a fresh one. SSR-safe: the
 * dismiss state reads sessionStorage only behind a `typeof window` guard.
 *
 * Touches:  POST /auth/resend-verify (Resend email).
 * Does NOT: render any nav chrome — that's Header.jsx.
 * History:  MEH-39 (origin, inside Header); MEH-731 (extracted + relocated);
 *           MEH-1071 (brand restyle + per-session dismiss).
 */
export default function VerifyBanner() {
  const { user } = useAuth();
  const t = useTranslations();
  const [resendSent, setResendSent] = useState(false);
  const [resendSending, setResendSending] = useState(false);
  const [resendError, setResendError] = useState("");
  // SSR-safe lazy init: sessionStorage is only touched behind a typeof-window
  // guard. The banner never renders on the server (user is null there), so no
  // hydration mismatch — the client is the first place this runs with a user.
  const [dismissed, setDismissed] = useState(
    () => typeof window !== "undefined" && sessionStorage.getItem(DISMISS_KEY) === "1"
  );

  // Same condition the banner carried inside Header (user && !verified), now
  // also gated on the per-session dismiss.
  if (!user || user.email_verified !== false || dismissed) return null;

  const handleDismiss = () => {
    if (typeof window !== "undefined") {
      sessionStorage.setItem(DISMISS_KEY, "1");
    }
    setDismissed(true);
  };

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
    // MEH-1071: on-brand surface (background-alt + border-border) replaces the
    // amber-50/amber-200 treatment. Relative so the end-side dismiss button can
    // pin; pe-11 reserves room for it so the centered content never overlaps.
    <div className="relative bg-background-alt border-b border-border px-4 py-2.5">
      <div className="flex items-center justify-center gap-3 text-sm flex-wrap pe-11">
        <span className="text-text inline-flex items-center gap-1"><EnvelopeSimple size={16} className="text-accent" />{t("auth.verify.banner")}</span>
        {resendError ? (
          <span className="text-error text-xs font-medium">{resendError}</span>
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
      {/* Dismiss — end side (RTL: visual left), 44px tap target. */}
      <button
        type="button"
        onClick={handleDismiss}
        aria-label="סגירת הודעת אימות"
        className="absolute end-1 top-1/2 -translate-y-1/2 flex items-center justify-center w-11 h-11 rounded-full text-fg-muted hover:text-text focus-ring"
      >
        <X size={18} aria-hidden="true" />
      </button>
    </div>
  );
}
