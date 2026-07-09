"use client";

import { Suspense, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import Image from "next/image";
import { ArrowRight, EnvelopeSimple, Eye, EyeSlash, Lock } from "@phosphor-icons/react";
import { useTranslations } from "next-intl";
import { useAuth } from "@/lib/auth-context";
import GoogleAuthButton from "@/components/GoogleAuthButton";
import AppleAuthButton from "@/components/AppleAuthButton";
import ButtonSpinner from "@/components/ButtonSpinner";
import { validateEmail } from "@/lib/validators";
import { safeInternalRedirect } from "@/lib/safe-redirect";
import { detailToMessage } from "@/lib/errors";
import { showToast } from "@/lib/toast";
import { env } from "@/lib/env";
import { optimizeCloudinary } from "@/lib/cloudinary";

/**
 * Module:   LoginClient
 * Purpose:  /login surface — S9 "Two Doors" (Direction C) editorial port.
 *           Visual/structural restyle only; auth flow (JWT, Google/Apple
 *           OAuth, validation, error handling) is untouched.
 * Does NOT: own SEO/metadata (see page.js) or OAuth widget styling
 *           (GoogleAuthButton.jsx / AppleAuthButton.jsx — vendor primitives).
 * Related:  frontend/messages/he.json → auth.login.* / auth.oauth.* (copy
 *           locked MEH-751/MEH-752); design-reference S9 mock.
 * History:  MEH-211 (S9 design); MEH-131 (S9 port — social-first order, open
 *           fields on cream, no white card; supersedes the old form-first
 *           FEEDBACK_FIXES fix 2, re-synced by S9 2026-06-05); MEH-788
 *           (split-screen — Cloudinary hero pane + brand overlay; register
 *           de-boxed to an editorial text link).
 * Touches:  Cloudinary (login/hero-produce-crate, via optimizeCloudinary).
 *
 * Layout: desktop = two panes (form START/right · image END/left); mobile =
 * image top band → form below. Form pane (top→bottom): gold eyebrow + small
 * Frank Ruhl welcome headline → social-first auth (Google → Apple) → "או" →
 * email + password (eye toggle + adjacent forgot link) → green submit →
 * understated register text link. Brand mood lives in the image overlay.
 */
export default function LoginClient() {
  return (
    <Suspense fallback={<LoginPageFallback />}>
      <LoginPageBody />
    </Suspense>
  );
}

function LoginPageFallback() {
  const t = useTranslations("auth.login");
  return (
    <div className="max-w-md mx-auto px-4 py-12 text-center text-fg-muted">
      {t("loading")}
    </div>
  );
}

function LoginPageBody() {
  const t = useTranslations("auth.login");
  // MEH-848: shared generic error copy (collapsed from auth.login.generic_error).
  const tError = useTranslations("error");
  const router = useRouter();
  const params = useSearchParams();
  // MEH-810: clamp ?redirect= to an internal path (open-redirect guard).
  const redirectTo = safeInternalRedirect(params.get("redirect"));
  const { login } = useAuth();
  const [email, setEmail] = useState(params.get("email") || "");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [emailTouched, setEmailTouched] = useState(false);
  const [passwordTouched, setPasswordTouched] = useState(false);
  // Eye-icon toggle for password visibility
  const [showPassword, setShowPassword] = useState(false);

  useEffect(() => {
    if (params.get("reset") === "1") {
      showToast.success(t("reset_success"));
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError("");
    if (!validateEmail(email)) {
      setError(t("email_invalid"));
      return;
    }
    setLoading(true);
    try {
      await login(email, password);
      router.push(redirectTo);
    } catch (err) {
      setError(detailToMessage(err.response?.data?.detail) || tError("generic"));
    } finally {
      setLoading(false);
    }
  };

  const googleConfigured = !!env.NEXT_PUBLIC_GOOGLE_CLIENT_ID;
  const appleConfigured = !!env.NEXT_PUBLIC_APPLE_CLIENT_ID;
  const oauthAvailable = googleConfigured || appleConfigured;

  // MEH-788: split-screen hero image. f_auto,q_auto via the helper; object-cover
  // crops to each pane (tall on desktop, top band on mobile) — no baked ar so the
  // single asset serves both layouts without distortion.
  // REUSES: components/HomeProductCard.jsx:26 (optimizeCloudinary + next/image fill)
  const heroSrc = optimizeCloudinary(
    "https://res.cloudinary.com/dfzpscjks/image/upload/login/hero-produce-crate.jpg"
  );

  // Inline field-level validation.
  // onBlur flips the `*Touched` state; error / valid states below only
  // activate after the user has interacted with the field, so the form
  // doesn't show a sea of red borders before the user types anything.
  // Submit button is disabled whenever either required field fails —
  // prevents a round-trip where the server returns a 4xx we already knew
  // about.
  const emailInvalid = emailTouched && email.length > 0 && !validateEmail(email);
  const emailValid = emailTouched && validateEmail(email);
  // MEH-418: drop the 8-char floor (post-MEH-306 there is no specific
  // minimum on /login — login validates against the stored hash, which
  // may be any length for legacy accounts). Keep a >= 1 defensive gate
  // so the submit button stays disabled on empty fields.
  const passwordInvalid = passwordTouched && password.length > 0 && password.length < 1;
  const passwordValidLength = passwordTouched && password.length >= 1;
  const formIsValid = validateEmail(email) && password.length >= 1;

  return (
    <div className="min-h-[calc(100vh-180px)] flex flex-col bg-background lg:grid lg:grid-cols-2">

      {/* Image pane — END (left) on desktop, top band on mobile (MEH-788) */}
      <div className="relative order-1 lg:order-2 h-[30vh] min-h-[220px] lg:h-auto overflow-hidden">
        <Image
          src={heroSrc}
          alt=""
          fill
          priority
          sizes="(min-width: 1024px) 50vw, 100vw"
          className="object-cover"
        />
        {/* scrim — keeps the overlay AA-readable over any part of the photo */}
        <div
          className="absolute inset-0 bg-gradient-to-t from-green-900/90 via-green-900/30 to-transparent"
          aria-hidden="true"
        />
        <div className="absolute inset-x-0 bottom-0 p-6 lg:p-10">
          <p className="font-headline-display font-black text-2xl lg:text-4xl leading-tight text-green-50">
            {t("hero_overlay")}
          </p>
        </div>
      </div>

      {/* Form pane — START (right) on desktop */}
      <div className="order-2 lg:order-1 flex items-center justify-center px-4 py-12 md:py-16">
        {/* S9 "Two Doors": open fields on cream — no floating white auth card. */}
        <div className="w-full max-w-[416px] mx-auto grid gap-6">

        {/* Head — gold eyebrow rule + Frank Ruhl 900 welcome headline */}
        <div className="grid gap-3 text-start">
          <span className="inline-flex items-center gap-3 text-accent text-[11px] font-medium tracking-[0.16em]">
            <span className="h-px w-7 bg-accent" aria-hidden="true" />
            {t("title")}
          </span>
          {/* MEH-131: utility-login scale, not /about hero — headline-lg token (32px/900) */}
          <h1 className="font-headline-lg font-black text-headline-lg leading-tight text-text">
            {t("welcome")}
          </h1>
        </div>

        {/* Social-first auth (S9 locked order): Google → Apple, then "או". */}
        {oauthAvailable && (
          <>
            <div className="grid gap-2.5">
              {googleConfigured && (
                <GoogleAuthButton
                  onSuccess={() => router.push(redirectTo)}
                  onError={(msg) => setError(msg)}
                />
              )}
              {appleConfigured && (
                <AppleAuthButton
                  onSuccess={() => router.push(redirectTo)}
                  onError={(msg) => setError(msg)}
                />
              )}
            </div>
            <div className="relative">
              <div className="absolute inset-0 flex items-center" aria-hidden="true">
                <div className="w-full border-t border-border" />
              </div>
              <div className="relative flex justify-center text-xs">
                <span className="px-3 bg-background text-fg-muted">{t("or")}</span>
              </div>
            </div>
          </>
        )}

        {/* Email + password — labels above, 54px field rhythm */}
        <form onSubmit={handleSubmit} className="grid gap-4">
          <div className="grid gap-2 text-start">
            <label htmlFor="login-email" className="text-[13.5px] font-semibold text-text">
              {t("email_label")}
            </label>
            {/* dir=ltr wrapper → logical start/end resolve to left/right for the
                LTR email value, so adornment + padding stay aligned. */}
            <div dir="ltr" className="relative">
              <span className="absolute start-3 top-1/2 -translate-y-1/2 text-primary pointer-events-none" aria-hidden="true">
                <EnvelopeSimple size={18} weight="regular" />
              </span>
              <input
                id="login-email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                onBlur={() => setEmailTouched(true)}
                required
                // MEH-991 (LOGIN-04): S9 email field shows a format example.
                placeholder="name@example.com"
                aria-invalid={emailInvalid || undefined}
                className={`w-full min-h-[54px] rounded-[8px] ps-11 pe-4 py-3.5 bg-surface-card text-text outline-none transition focus-visible:ring-2 focus-visible:ring-primary/40 ${
                  emailInvalid
                    ? "border border-red-400"
                    : emailValid
                      ? "border border-primary"
                      : "border border-border focus:border-primary"
                }`}
              />
            </div>
            {emailInvalid && (
              <p className="text-xs text-red-500 text-start" role="alert">{t("email_invalid")}</p>
            )}
            {emailValid && (
              <p className="text-xs text-primary text-start">{t("valid")}</p>
            )}
          </div>

          <div className="grid gap-2 text-start">
            {/* label-row: field label at inline-start, forgot link at inline-end */}
            <div className="flex items-baseline justify-between gap-3">
              <label htmlFor="login-password" className="text-[13.5px] font-semibold text-text">
                {t("password_label")}
              </label>
              <Link href="/forgot-password" className="text-xs font-medium text-primary hover:underline">
                {t("forgot_password")}
              </Link>
            </div>
            <div dir="ltr" className="relative">
              <span className="absolute start-3 top-1/2 -translate-y-1/2 text-primary pointer-events-none" aria-hidden="true">
                <Lock size={18} weight="regular" />
              </span>
              <input
                id="login-password"
                type={showPassword ? "text" : "password"}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                onBlur={() => setPasswordTouched(true)}
                required
                // MEH-835: DO NOT add a minLength floor — login validates the
                // stored hash only (OWASP), so legacy <8-char accounts must be
                // able to sign in. Empty-submit is still blocked via formIsValid
                // (password.length >= 1). Regression of MEH-418.
                aria-invalid={passwordInvalid || undefined}
                className={`w-full min-h-[54px] rounded-[8px] ps-11 pe-12 py-3.5 bg-surface-card text-text outline-none transition focus-visible:ring-2 focus-visible:ring-primary/40 ${
                  passwordInvalid
                    ? "border border-red-400"
                    : passwordValidLength
                      ? "border border-primary"
                      : "border border-border focus:border-primary"
                }`}
              />
              {/* rtl-ok: eye toggle pinned to the inline-end of a dir="ltr" field (logical end-, documented exception) */}
              <button
                type="button"
                onClick={() => setShowPassword((v) => !v)}
                className="absolute end-2 top-1/2 -translate-y-1/2 grid place-items-center w-11 h-11 rounded-full text-fg-muted hover:text-primary transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40"
                aria-label={showPassword ? t("password_hide") : t("password_show")}
                aria-pressed={showPassword}
              >
                {showPassword ? (
                  <EyeSlash size={20} weight="regular" aria-hidden="true" />
                ) : (
                  <Eye size={20} weight="regular" aria-hidden="true" />
                )}
              </button>
            </div>
            {passwordInvalid && (
              <p className="text-xs text-red-500 text-start" role="alert">{t("password_required")}</p>
            )}
            {passwordValidLength && (
              <p className="text-xs text-primary text-start">{t("valid")}</p>
            )}
          </div>

          {error && (
            <p className="text-red-500 text-sm text-start" role="alert">
              {error}
            </p>
          )}

          {/* Submit — S9 green pill + reading-forward arrow (Refs MEH-1033).
              Overrides the prior site-standard-rounded ("NOT green pill") constraint. */}
          <button
            type="submit"
            disabled={loading || !formIsValid}
            className="w-full min-h-[54px] flex items-center justify-center bg-primary text-white rounded-full px-6 font-bold hover:bg-primary-dark transition disabled:opacity-50 focus-visible:ring-2 focus-visible:ring-primary/40"
          >
            {loading ? (
              <span className="inline-flex items-center justify-center gap-2">
                <ButtonSpinner />
                {t("submitting")}
              </span>
            ) : (
              <span className="inline-flex items-center justify-center">
                {t("submit")}
                <ArrowRight size={18} weight="bold" aria-hidden="true" className="ms-1 rtl:rotate-180" />
              </span>
            )}
          </button>
        </form>

        {/* Register — understated editorial text link (no box, no icon) */}
        <p className="text-center text-sm text-fg-muted">
          {t("no_account")}{" "}
          <Link
            href="/register"
            className="font-medium text-accent underline underline-offset-4 decoration-accent/50 hover:decoration-accent transition"
          >
            {t("register_cta")}
          </Link>
        </p>
        </div>
      </div>
    </div>
  );
}
