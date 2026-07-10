"use client";

import { Suspense, useState, useEffect } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import Image from "next/image";
import { useTranslations } from "next-intl";
import { EnvelopeSimple } from "@phosphor-icons/react";
import { useAuth } from "@/lib/auth-context";
import GoogleAuthButton from "@/components/GoogleAuthButton";
import AppleAuthButton from "@/components/AppleAuthButton";
import ButtonSpinner from "@/components/ButtonSpinner";
import PasswordInput from "@/components/PasswordInput";
import { firstFailureMessage } from "@/lib/passwordMessages";
import { PASSWORD_MIN_LENGTH, validateEmail } from "@/lib/validators";
import api from "@/lib/api";
import { safeInternalRedirect } from "@/lib/safe-redirect";
import { env } from "@/lib/env";
import { optimizeCloudinary } from "@/lib/cloudinary";

/**
 * Module:   RegisterClient
 * Purpose:  /register surface — consumer signup form, MEH-788 split-editorial
 *           shell (image pane + form pane, mirroring /login). Visual shell
 *           only; signup flow (OWASP ack, password policy, referral claim,
 *           OAuth) is untouched.
 * Does NOT: own SEO/metadata (page.js server wrapper) or the password
 *           checklist UX (PasswordInput.jsx, MEH-306). Producer signup is
 *           register/producer/.
 * Related:  frontend/messages/he.json → auth.register.consumer.* (copy
 *           locked); overlay reuses auth.login.hero_overlay (same locked
 *           string as /login — single owner, no duplicate key).
 * Touches:  Cloudinary (register/hero-box-produce, via optimizeCloudinary).
 * History:  MEH-306 (password policy); MEH-328 (OWASP ack flow); MEH-49
 *           (referral); MEH-788 (split-editorial image pane; headline-lg
 *           parity + value-prop strip removal, mirrors MEH-131); MEH-837
 *           (OAuth success honors clamped ?redirect= — Suspense boundary
 *           added for useSearchParams, mirrors LoginClient).
 *           MEH-839 (de-box container + filled-green CTA → /login parity;
 *           OAuth render order FROZEN form-first, MEH-132 #3 untouched).
 */

export default function RegisterClient() {
  return (
    <Suspense fallback={<RegisterPageFallback />}>
      <RegisterPageBody />
    </Suspense>
  );
}

function RegisterPageFallback() {
  return (
    <div className="min-h-[calc(100vh-200px)] flex items-center justify-center px-4 py-16">
      <ButtonSpinner />
    </div>
  );
}

function RegisterPageBody() {
  const t = useTranslations();
  // MEH-628: scoped translator for password-policy failure copy.
  const tValidation = useTranslations("auth.passwordValidation");
  const { register } = useAuth();
  const router = useRouter();
  const params = useSearchParams();
  // MEH-837: honor a post-signup ?redirect= the same way /login does, clamped
  // to an internal path via the MEH-810 helper (open-redirect guard). Missing/
  // empty/external → "/" (preserves prior hardcoded behavior).
  const redirectTo = safeInternalRedirect(params.get("redirect"));
  const [form, setForm] = useState({ email: "", name: "", password: "" });
  const [agreedToTerms, setAgreedToTerms] = useState(false);
  const [error, setError] = useState("");
  // MEH-328 Chunk D: emailExistsError state removed. Backend returns an
  // identical 200 ack for new-email / password-collision / oauth-collision;
  // the legitimate owner finds out via the duplicate-attempt email.
  const [loading, setLoading] = useState(false);
  const [referralCode, setReferralCode] = useState(null);

  // MEH-49: detect referral code from localStorage (set by /ref/[code] landing page)
  useEffect(() => {
    try {
      const code = localStorage.getItem("referral_code");
      if (code) setReferralCode(code);
    } catch {
      // private browsing — ignore
    }
  }, []);
  // Per-field touched state for
  // onBlur inline validation. Password eye toggle + live policy
  // feedback now lives in <PasswordInput> (MEH-306 sub-B).
  const [nameTouched, setNameTouched] = useState(false);
  const [emailTouched, setEmailTouched] = useState(false);
  const [passwordOk, setPasswordOk] = useState(false);
  // MEH-328 Chunk D: emailSent toggles the inbox-check success screen.
  // emailExpected state removed — backend no longer carries email_sent,
  // and the OWASP ack copy is unconditional ("if the email is free, …").
  const [emailSent, setEmailSent] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError("");

    // Client-side validation. The inline onBlur rules below already
    // disable the submit button when any field fails, so this is a
    // belt-and-suspenders server-round-trip guard.
    if (!form.name.trim()) {
      setError(t("auth.register.consumer.validation.name_required"));
      return;
    }
    if (!validateEmail(form.email)) {
      setError(t("auth.register.consumer.validation.email_invalid"));
      return;
    }
    if (form.password.length < PASSWORD_MIN_LENGTH) {
      // PasswordInput already shows the inline checklist; this is the
      // belt-and-suspenders submit guard with the same Hebrew copy.
      setError(t("auth.register.consumer.validation.password_min", { min: PASSWORD_MIN_LENGTH }));
      return;
    }
    setLoading(true);
    try {
      // MEH-328: register() returns the OWASP ack ({detail}); no token,
      // no auto-login. Any 200 → render the inbox-check screen.
      await register(form);
      // MEH-49: claim referral after successful registration (best-effort).
      // The user isn't yet authenticated post-MEH-328, so this endpoint
      // would 401 — but it's still wrapped in try/catch for safety, and
      // referral claim is moved to post-verify in a follow-up.
      if (referralCode) {
        try {
          await api.post("/referral/claim", { code: referralCode });
          localStorage.removeItem("referral_code");
        } catch {
          // referral claim is non-blocking
        }
      }
      setEmailSent(true);
    } catch (err) {
      const status = err.response?.status;
      const detail = err.response?.data?.detail;
      if (
        status === 422 &&
        detail &&
        typeof detail === "object" &&
        Array.isArray(detail.failures)
      ) {
        // MEH-306: backend returns {failures: ["too_short"|"too_common"|...]}
        // on policy rejection. Map the first to the matching Hebrew string.
        setError(firstFailureMessage(detail.failures, tValidation));
      } else {
        setError(typeof detail === "string" ? detail : t("error.generic"));
      }
    } finally {
      setLoading(false);
    }
  };

  const set = (field) => (e) => {
    setForm((prev) => ({ ...prev, [field]: e.target.value }));
  };

  // Inline field-level validity.
  // *Invalid flags only go true after the field has been touched (i.e.
  // user moved focus away) AND the current value fails validation —
  // this way the form doesn't show a sea of red borders before the
  // user has interacted with anything. *Valid flags similarly gate on
  // touched. `formIsValid` is used for the submit button disabled
  // state and does NOT require touched — it's a pure "does the current
  // input pass every required rule" check.
  const nameTrimmed = form.name.trim();
  const nameInvalid = nameTouched && !nameTrimmed;
  const nameValid = nameTouched && !!nameTrimmed;
  const emailInvalid = emailTouched && form.email.length > 0 && !validateEmail(form.email);
  const emailValid = emailTouched && validateEmail(form.email);
  // MEH-306: passwordOk comes from <PasswordInput>'s onValidityChange and
  // already covers length + (debounced) breach. Backend re-validates on
  // submit including deny-list, so the submit guard above is redundant
  // belt-and-suspenders not the only check.
  const formIsValid =
    !!nameTrimmed &&
    validateEmail(form.email) &&
    passwordOk &&
    agreedToTerms;

  const googleConfigured = !!env.NEXT_PUBLIC_GOOGLE_CLIENT_ID;
  const appleConfigured = !!env.NEXT_PUBLIC_APPLE_CLIENT_ID;
  const oauthAvailable = googleConfigured || appleConfigured;

  // MEH-788: split-screen hero image (4000×6000 portrait). f_auto,q_auto via
  // the helper; object-cover crops to each pane — no baked ar so the single
  // asset serves the tall desktop pane and the mobile top band undistorted.
  // REUSES: app/[locale]/login/LoginClient.jsx:104 (optimizeCloudinary + next/image fill)
  const heroSrc = optimizeCloudinary(
    "https://res.cloudinary.com/dfzpscjks/image/upload/register/hero-box-produce.jpg"
  );

  if (emailSent) {
    // MEH-328 Chunk D: unconditional inbox-check screen. Backend returns
    // an identical 200 ack regardless of whether the email was new or
    // already registered — same UI for both, OWASP-compliant.
    return (
      <div className="min-h-[calc(100vh-200px)] flex items-center justify-center px-4 py-16">
        {/* MEH-839: de-boxed to match the main form (RegisterClient.jsx:254) —
            cream-open, no floating white card. text-center kept: this is a
            centered confirmation (login has no equivalent screen); the parity
            fix is the white-card chrome, not the alignment. */}
        <div className="w-full max-w-[416px] mx-auto text-center">
          <div
            className="w-16 h-16 rounded-full bg-background mx-auto mb-4 flex items-center justify-center"
            aria-hidden="true"
          >
            <EnvelopeSimple size={32} className="text-fg-muted" aria-hidden="true" />
          </div>
          <h1 className="font-headline-lg text-3xl font-black text-text mb-2">{t("auth.register.consumer.email_sent.title")}</h1>
          <p className="text-fg-muted text-sm mb-3">{t("auth.register.consumer.email_sent.body")}</p>
          <p className="text-fg-muted text-xs mb-6">{t("auth.register.consumer.email_sent.hint")}</p>
          <Link href="/" className="block w-full border-2 border-primary-dark text-primary-dark bg-transparent py-3 rounded-md hover:bg-primary-dark hover:text-white transition font-medium text-center">
            {t("auth.register.consumer.email_sent.back_home")}
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-[calc(100vh-200px)] flex flex-col bg-background lg:grid lg:grid-cols-2">

      {/* Image pane — END (left) on desktop, top band on mobile.
          REUSES: app/[locale]/login/LoginClient.jsx:129 (split pane + scrim + overlay) */}
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
          {/* Same locked string as /login — deliberately reads the auth.login
              key (single owner) instead of duplicating it under auth.register. */}
          <p className="font-headline-display font-black text-2xl lg:text-4xl leading-tight text-green-50">
            {t("auth.login.hero_overlay")}
          </p>
        </div>
      </div>

      {/* Form pane — START (right) on desktop */}
      <div className="order-2 lg:order-1 flex items-center justify-center px-4 py-12 md:py-16">
      {/* MEH-839: de-boxed to match /login (LoginClient.jsx:157) — open form on
          cream, no floating white card. Children order UNCHANGED: form-first,
          OAuth below (MEH-132 #3 auth-order freeze respected). */}
      <div className="w-full max-w-[416px] mx-auto">
        {/* Brand mark + heading */}
        {/* MEH-909: decorative Leaf badge removed for register↔login parity (MEH-839). */}
        <div className="mb-6 text-start">
          {/* MEH-929: gold eyebrow rule — exact parity with LoginClient's
              eyebrow (LoginClient.jsx:161-164). */}
          <span className="inline-flex items-center gap-3 text-accent text-[11px] font-medium tracking-[0.16em] mb-3">
            <span className="h-px w-7 bg-accent" aria-hidden="true" />
            {t("auth.register.consumer.eyebrow")}
          </span>
          {/* MEH-788: headline-lg token (32px/900) — utility-page scale, exact
              parity with LoginClient's welcome headline (MEH-131 precedent). */}
          <h1 className="font-headline-lg font-black text-headline-lg leading-tight text-text mb-1">{t("auth.register.consumer.heading")}</h1>
          <p className="text-fg-muted text-sm">{t("auth.register.consumer.subtitle")}</p>
        </div>

        {/* MEH-788: feature strip removed — mirrors login's MEH-131 strip drop;
            its discover-string also violated the licensed-businesses DNA LOCK.
            The three orphaned keys stay in the JSONs (untouched), same as
            login's retained value_save/rate/publish. */}

        {/* MEH-1056: the MEH-49 referral discount badge is removed — a blanket
            platform promise no business opted into (MEH-1050 ruling). The
            referralCode state + /referral/claim call below stay live; copy only. */}

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label htmlFor="register-name" className="block text-sm font-medium mb-1">{t("auth.register.consumer.fields.name")}</label>
            <input
              id="register-name"
              value={form.name}
              onChange={set("name")}
              onBlur={() => setNameTouched(true)}
              required
              aria-invalid={nameInvalid || undefined}
              className={`w-full border rounded-md px-3 py-2 min-h-[44px] text-start transition ${
                nameInvalid
                  ? "border-error"
                  : nameValid
                    ? "border-primary"
                    : ""
              }`}
              dir="rtl"
            />
            {nameInvalid && (
              <p className="text-xs text-error mt-1 text-start" role="alert">{t("auth.register.consumer.validation.name_required")}</p>
            )}
            {nameValid && (
              <p className="text-xs text-primary mt-1 text-start">{t("auth.register.consumer.validation.valid_hint")}</p>
            )}
          </div>
          <div>
            <label htmlFor="register-email" className="block text-sm font-medium mb-1">{t("auth.register.consumer.fields.email")}</label>
            <input
              id="register-email"
              type="email"
              value={form.email}
              onChange={set("email")}
              onBlur={() => setEmailTouched(true)}
              required
              aria-invalid={emailInvalid || undefined}
              // text-right kept: email input is dir="ltr"; physical right = start side in the RTL form; logical text-start would follow the field's own ltr direction instead
              className={`w-full border rounded-md px-3 py-2 min-h-[44px] text-right transition ${
                emailInvalid
                  ? "border-error"
                  : emailValid
                    ? "border-primary"
                    : ""
              }`}
              dir="ltr"
            />
            {emailInvalid && (
              <p className="text-xs text-error mt-1 text-start" role="alert">{t("auth.register.consumer.validation.email_invalid")}</p>
            )}
            {emailValid && (
              <p className="text-xs text-primary mt-1 text-start">{t("auth.register.consumer.validation.valid_hint")}</p>
            )}
          </div>
          <div>
            <label htmlFor="pw-password" className="block text-sm font-medium mb-1">{t("auth.register.consumer.fields.password")}</label>
            {/* MEH-306: PasswordInput owns input + eye toggle + live policy
                checklist (length + breach). Form-level error div above
                renders 422-failure messages from the submit handler. */}
            <PasswordInput
              name="password"
              value={form.password}
              onChange={set("password")}
              ariaLabel={t("auth.register.consumer.fields.password_aria")}
              onValidityChange={setPasswordOk}
            />
          </div>
          <label className="flex items-start gap-2 text-sm cursor-pointer">
            <input
              type="checkbox"
              checked={agreedToTerms}
              onChange={(e) => setAgreedToTerms(e.target.checked)}
              className="w-4 h-4 accent-primary mt-0.5 flex-shrink-0"
              required
            />
            <span className="leading-relaxed">
              {t("auth.register.consumer.terms.intro")}{" "}
              <a href="/terms" target="_blank" className="text-primary hover:underline">
                {t("auth.register.consumer.terms.tos_link")}
              </a>{" "}
              {t("auth.register.consumer.terms.and")}
              <a href="/privacy" target="_blank" className="text-primary hover:underline">
                {t("auth.register.consumer.terms.privacy_link")}
              </a>
            </span>
          </label>
          {/* MEH-328 Chunk D: "האימייל כבר רשום" inline warning removed.
              Duplicate-attempt email (Chunks A+B) is the only signal. */}
          {error && <p className="text-error text-sm" role="alert">{error}</p>}
          {/* MEH-839: filled-green primary, mirrors /login's CTA fill
              (LoginClient.jsx:303) — was a ghost/outline. Height stays in
              register's 44px field rhythm (MEH-838), not login's 54px. */}
          <button
            type="submit"
            disabled={loading || !formIsValid}
            className="w-full min-h-[44px] flex items-center justify-center bg-primary text-white py-3 rounded-md font-bold hover:bg-primary-dark transition disabled:opacity-50 focus-visible:ring-2 focus-visible:ring-primary/40"
          >
            {loading ? (
              <span className="inline-flex items-center gap-2">
                <ButtonSpinner />
                {t("auth.register.consumer.actions.submitting")}
              </span>
            ) : (
              t("auth.register.consumer.actions.submit")
            )}
          </button>
          <p className="text-center mt-3 text-fg-muted font-body-md text-xs">
            {t("auth.register.consumer.email_hint")}
          </p>
        </form>

        {oauthAvailable && (
          <>
            <div className="relative my-5">
              <div className="absolute inset-0 flex items-center">
                <div className="w-full border-t border-border" />
              </div>
              <div className="relative flex justify-center text-xs">
                {/* MEH-839: cream notch to match the de-boxed surface (was bg-white; mirrors LoginClient.jsx:193). */}
                <span className="px-3 bg-background text-fg-muted">{t("auth.register.consumer.oauth_divider")}</span>
              </div>
            </div>
            <div className="space-y-2.5">
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
          </>
        )}

        <p className="text-center text-sm text-fg-muted mt-6">
          {t("auth.register.consumer.have_account")}{" "}
          <Link href="/login" className="text-primary underline">
            {t("auth.register.consumer.login_link")}
          </Link>
        </p>
        <p className="text-center text-sm text-fg-muted mt-2">
          {t("auth.register.consumer.cta_producer")}{" "}
          <Link href="/register/producer" className="text-primary underline">
            {t("auth.register.consumer.cta_producer_link")}
          </Link>
        </p>
      </div>
      </div>
    </div>
  );
}
