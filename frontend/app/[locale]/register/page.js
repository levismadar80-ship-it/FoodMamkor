"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { Leaf } from "@phosphor-icons/react";
import { useAuth } from "@/lib/auth-context";
import GoogleAuthButton from "@/components/GoogleAuthButton";
import AppleAuthButton from "@/components/AppleAuthButton";
import ButtonSpinner from "@/components/ButtonSpinner";
import PasswordInput from "@/components/PasswordInput";
import { firstFailureMessage } from "@/lib/passwordMessages";
import { PASSWORD_MIN_LENGTH, validateEmail } from "@/lib/validators";
import api from "@/lib/api";
import { env } from "@/lib/env";

export default function RegisterPage() {
  const t = useTranslations();
  const { register } = useAuth();
  const router = useRouter();
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
  // tasks_for_claude_code.md tasks 7+8 — per-field touched state for
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
        setError(firstFailureMessage(detail.failures));
      } else {
        setError(typeof detail === "string" ? detail : t("auth.register.consumer.errors.generic"));
      }
    } finally {
      setLoading(false);
    }
  };

  const set = (field) => (e) => {
    setForm((prev) => ({ ...prev, [field]: e.target.value }));
  };

  // tasks_for_claude_code.md task 8 — inline field-level validity.
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

  if (emailSent) {
    // MEH-328 Chunk D: unconditional inbox-check screen. Backend returns
    // an identical 200 ack regardless of whether the email was new or
    // already registered — same UI for both, OWASP-compliant.
    return (
      <div className="min-h-[calc(100vh-200px)] flex items-center justify-center px-4 py-16">
        <div className="bg-white rounded-[20px] p-8 sm:p-10 w-full max-w-md border border-border shadow-[0_4px_32px_rgba(46,104,83,0.08)] text-center">
          <div className="w-16 h-16 rounded-full bg-amber-50 mx-auto mb-4 flex items-center justify-center text-3xl">📬</div>
          <h1 className="font-headline text-2xl font-bold text-site-text mb-2">{t("auth.register.consumer.email_sent.title")}</h1>
          <p className="text-site-muted text-sm mb-3">{t("auth.register.consumer.email_sent.body")}</p>
          <p className="text-site-muted text-xs mb-6">{t("auth.register.consumer.email_sent.hint")}</p>
          <Link href="/" className="block w-full bg-primary text-white py-3 rounded-[12px] hover:bg-primary-light transition font-medium text-center">
            {t("auth.register.consumer.email_sent.back_home")}
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-[calc(100vh-200px)] flex items-center justify-center px-4 py-16">
      <div className="bg-white rounded-[20px] p-8 sm:p-10 w-full max-w-md border border-border shadow-[0_4px_32px_rgba(46,104,83,0.08)] text-center">
        {/* Brand mark + heading */}
        <div className="mb-6">
          <div
            className="w-16 h-16 rounded-full bg-light mx-auto mb-4 flex items-center justify-center"
            aria-hidden="true"
          >
            <Leaf size={32} weight="duotone" className="text-primary" aria-hidden="true" />
          </div>
          <h1 className="font-headline text-2xl font-bold text-site-text mb-1">{t("auth.register.consumer.heading")}</h1>
          <p className="text-site-muted text-sm">{t("auth.register.consumer.subtitle")}</p>
        </div>

        {/* Value-prop strip */}
        <div className="flex justify-center gap-5 mb-5 text-site-muted" style={{ fontFamily: "Frank Ruhl Libre, serif", fontSize: "14px" }}>
          <span>{t("auth.register.consumer.value_props.discover")}</span>
          <span>{t("auth.register.consumer.value_props.favorites")}</span>
          <span>{t("auth.register.consumer.value_props.rate")}</span>
        </div>

        {/* MEH-49: referral discount badge */}
        {referralCode && (
          <div className="mb-4 rounded-[10px] bg-[#EAF3DE] border border-[#2e6853]/20 px-4 py-2 text-sm text-[#2e6853] font-medium">
            {t("auth.register.consumer.referral_badge")}
          </div>
        )}

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
              className={`w-full border rounded-[12px] px-3 py-2 text-right transition ${
                nameInvalid
                  ? "border-red-400"
                  : nameValid
                    ? "border-primary"
                    : ""
              }`}
              dir="rtl"
            />
            {nameInvalid && (
              <p className="text-xs text-red-500 mt-1 text-right" role="alert">{t("auth.register.consumer.validation.name_required")}</p>
            )}
            {nameValid && (
              <p className="text-xs text-primary mt-1 text-right">{t("auth.register.consumer.validation.valid_hint")}</p>
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
              className={`w-full border rounded-[12px] px-3 py-2 text-right transition ${
                emailInvalid
                  ? "border-red-400"
                  : emailValid
                    ? "border-primary"
                    : ""
              }`}
              dir="ltr"
            />
            {emailInvalid && (
              <p className="text-xs text-red-500 mt-1 text-right" role="alert">{t("auth.register.consumer.validation.email_invalid")}</p>
            )}
            {emailValid && (
              <p className="text-xs text-primary mt-1 text-right">{t("auth.register.consumer.validation.valid_hint")}</p>
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
          {error && <p className="text-red-500 text-sm" role="alert">{error}</p>}
          <button
            type="submit"
            disabled={loading || !formIsValid}
            className="w-full bg-primary text-white py-3 rounded-[12px] hover:bg-primary-light transition font-medium disabled:opacity-50"
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
          <p className="text-center mt-3 text-site-muted" style={{ fontFamily: "DM Sans, sans-serif", fontSize: "12px" }}>
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
                <span className="px-3 bg-white text-site-muted">{t("auth.register.consumer.oauth_divider")}</span>
              </div>
            </div>
            <div className="space-y-2.5">
              {googleConfigured && (
                <GoogleAuthButton
                  onSuccess={() => router.push("/")}
                  onError={(msg) => setError(msg)}
                />
              )}
              {appleConfigured && (
                <AppleAuthButton
                  onSuccess={() => router.push("/")}
                  onError={(msg) => setError(msg)}
                />
              )}
            </div>
          </>
        )}

        <p className="text-center text-sm text-site-muted mt-6">
          {t("auth.register.consumer.have_account")}{" "}
          <Link href="/login" className="text-primary hover:underline">
            {t("auth.register.consumer.login_link")}
          </Link>
        </p>
        <p className="text-center text-sm text-site-muted mt-2">
          {t("auth.register.consumer.cta_producer")}{" "}
          <Link href="/register/producer" className="text-secondary hover:underline">
            {t("auth.register.consumer.cta_producer_link")}
          </Link>
        </p>
      </div>
    </div>
  );
}
