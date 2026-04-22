"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { Eye, EyeSlash, Leaf } from "@phosphor-icons/react";
import { useAuth } from "@/lib/auth-context";
import GoogleAuthButton from "@/components/GoogleAuthButton";
import AppleAuthButton from "@/components/AppleAuthButton";
import ButtonSpinner from "@/components/ButtonSpinner";
import CitySearch from "@/components/CitySearch";
import PasswordStrength from "@/components/PasswordStrength";
import { validateIsraeliPhone, validateEmail } from "@/lib/validators";
import api from "@/lib/api";

export default function RegisterPage() {
  const { register } = useAuth();
  const [form, setForm] = useState({ email: "", name: "", password: "", city: "", phone: "" });
  const [agreedToTerms, setAgreedToTerms] = useState(false);
  const [error, setError] = useState("");
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
  // onBlur inline validation + eye toggle for password visibility.
  const [nameTouched, setNameTouched] = useState(false);
  const [emailTouched, setEmailTouched] = useState(false);
  const [passwordTouched, setPasswordTouched] = useState(false);
  const [phoneTouched, setPhoneTouched] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [emailSent, setEmailSent] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError("");

    // Client-side validation. The inline onBlur rules below already
    // disable the submit button when any field fails, so this is a
    // belt-and-suspenders server-round-trip guard.
    if (!form.name.trim()) {
      setError("שם מלא הוא שדה חובה");
      return;
    }
    if (!validateEmail(form.email)) {
      setError("האימייל לא תקין");
      return;
    }
    if (form.password.length < 8) {
      setError("סיסמא חייבת להכיל לפחות 8 תווים");
      return;
    }
    if (form.phone && !validateIsraeliPhone(form.phone)) {
      setError("מספר טלפון לא תקין");
      return;
    }

    setLoading(true);
    try {
      await register(form);
      // MEH-49: claim referral after successful registration (best-effort)
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
      setError(err.response?.data?.detail || "משהו השתבש, נסי שוב");
    } finally {
      setLoading(false);
    }
  };

  const set = (field) => (e) => setForm({ ...form, [field]: e.target.value });

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
  const passwordInvalid = passwordTouched && form.password.length > 0 && form.password.length < 8;
  const passwordValidLength = passwordTouched && form.password.length >= 8;
  const phoneInvalid = phoneTouched && form.phone.length > 0 && !validateIsraeliPhone(form.phone);
  const phoneValid = phoneTouched && form.phone.length > 0 && validateIsraeliPhone(form.phone);

  const formIsValid =
    !!nameTrimmed &&
    validateEmail(form.email) &&
    form.password.length >= 8 &&
    (!form.phone || validateIsraeliPhone(form.phone)) &&
    agreedToTerms;

  const googleConfigured =
    typeof process !== "undefined" && !!process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID;
  const appleConfigured =
    typeof process !== "undefined" && !!process.env.NEXT_PUBLIC_APPLE_CLIENT_ID;
  const oauthAvailable = googleConfigured || appleConfigured;

  if (emailSent) {
    return (
      <div className="min-h-[calc(100vh-200px)] flex items-center justify-center px-4 py-16">
        <div className="bg-white rounded-[20px] p-8 sm:p-10 w-full max-w-md border border-border shadow-[0_4px_32px_rgba(46,104,83,0.08)] text-center">
          <div className="w-16 h-16 rounded-full bg-amber-50 mx-auto mb-4 flex items-center justify-center text-3xl">📧</div>
          <h1 className="font-headline text-2xl font-bold text-site-text mb-2">בדקי את האימייל שלך</h1>
          <p className="text-site-muted text-sm mb-1">שלחנו הודעת אימות ל-{form.email}</p>
          <p className="text-site-muted text-sm mb-6">לחצי על הקישור במייל כדי להפעיל את החשבון</p>
          <Link href="/" className="block w-full bg-primary text-white py-3 rounded-[12px] hover:bg-primary-light transition font-medium text-center">
            המשיכי לאתר
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
          <h1 className="font-headline text-2xl font-bold text-site-text mb-1">הצטרפי לקהילה</h1>
          <p className="text-site-muted text-sm">ברוכה הבאה למהמקור 🌿</p>
        </div>

        {/* Value-prop strip */}
        <div className="flex justify-center gap-5 mb-5 text-site-muted" style={{ fontFamily: "Frank Ruhl Libre, serif", fontSize: "14px" }}>
          <span>🗺️ גלי יצרנים</span>
          <span>❤️ שמרי מועדפים</span>
          <span>⭐ דרגי ושתפי</span>
        </div>

        {/* MEH-49: referral discount badge */}
        {referralCode && (
          <div className="mb-4 rounded-[10px] bg-[#EAF3DE] border border-[#2e6853]/20 px-4 py-2 text-sm text-[#2e6853] font-medium">
            הגעת דרך חברה 🌿 10% הנחה בהזמנה הראשונה
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium mb-1">שם מלא *</label>
            <input
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
              <p className="text-xs text-red-500 mt-1 text-right">שם מלא הוא שדה חובה</p>
            )}
            {nameValid && (
              <p className="text-xs text-primary mt-1 text-right">✓ תקין</p>
            )}
          </div>
          <div>
            <label className="block text-sm font-medium mb-1">אימייל *</label>
            <input
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
              <p className="text-xs text-red-500 mt-1 text-right">האימייל לא תקין</p>
            )}
            {emailValid && (
              <p className="text-xs text-primary mt-1 text-right">✓ תקין</p>
            )}
          </div>
          <div>
            <label className="block text-sm font-medium mb-1">סיסמה *</label>
            {/* Eye toggle — positioned at the END of the LTR password field (physical right). */}
            <div className="relative">
              <input
                type={showPassword ? "text" : "password"}
                value={form.password}
                onChange={set("password")}
                onBlur={() => setPasswordTouched(true)}
                required
                minLength={8}
                aria-invalid={passwordInvalid || undefined}
                className={`w-full border rounded-[12px] pr-11 pl-3 py-2 text-right focus-visible:ring-2 focus-visible:ring-primary/40 outline-none transition ${
                  passwordInvalid
                    ? "border-red-400"
                    : passwordValidLength
                      ? "border-primary"
                      : ""
                }`}
                dir="ltr"
              />
              <button
                type="button"
                onClick={() => setShowPassword((v) => !v)}
                // eslint-disable-next-line no-restricted-syntax -- rtl-ok: eye toggle inside dir="ltr" input
                className="absolute right-3 top-1/2 -translate-y-1/2 text-site-muted hover:text-site-text transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40 rounded-full p-1"
                aria-label={showPassword ? "הסתירי סיסמה" : "הציגי סיסמה"}
                aria-pressed={showPassword}
                tabIndex={0}
              >
                {showPassword ? (
                  <EyeSlash size={20} weight="regular" aria-hidden="true" />
                ) : (
                  <Eye size={20} weight="regular" aria-hidden="true" />
                )}
              </button>
            </div>
            {passwordInvalid && (
              <p className="text-xs text-red-500 mt-1 text-right">סיסמא חייבת להכיל לפחות 8 תווים</p>
            )}
            <PasswordStrength password={form.password} />
          </div>
          <div>
            <label className="block text-sm font-medium mb-1">עיר</label>
            <CitySearch
              id="register-city"
              label="עיר"
              value={form.city}
              onChange={(val) => setForm({ ...form, city: val })}
              placeholder="הרצליה"
            />
          </div>
          <div>
            <label className="block text-sm font-medium mb-1">טלפון</label>
            <input
              value={form.phone}
              onChange={set("phone")}
              onBlur={() => setPhoneTouched(true)}
              placeholder="050-1234567"
              aria-invalid={phoneInvalid || undefined}
              className={`w-full border rounded-[12px] px-3 py-2 focus-visible:ring-2 focus-visible:ring-primary/40 outline-none transition ${
                phoneInvalid
                  ? "border-red-400"
                  : phoneValid
                    ? "border-primary"
                    : ""
              }`}
              dir="ltr"
            />
            {phoneInvalid && (
              <p className="text-xs text-red-500 mt-1 text-right">מספר טלפון לא תקין</p>
            )}
            {phoneValid && (
              <p className="text-xs text-primary mt-1 text-right">✓ תקין</p>
            )}
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
              קראתי ואני מסכימה{" "}
              <a href="/terms" target="_blank" className="text-primary hover:underline">
                לתנאי השימוש
              </a>{" "}
              ו
              <a href="/privacy" target="_blank" className="text-primary hover:underline">
                למדיניות הפרטיות
              </a>
            </span>
          </label>
          {error && <p className="text-red-500 text-sm">{error}</p>}
          <button
            type="submit"
            disabled={loading || !formIsValid}
            className="w-full bg-primary text-white py-3 rounded-[12px] hover:bg-primary-light transition font-medium disabled:opacity-50"
          >
            {loading ? (
              <span className="inline-flex items-center gap-2">
                <ButtonSpinner />
                נרשמת...
              </span>
            ) : (
              "הצטרפי"
            )}
          </button>
          <p className="text-center mt-3 text-site-muted" style={{ fontFamily: "DM Sans, sans-serif", fontSize: "12px" }}>
            לאחר ההרשמה תישלח הודעת אימות לאימייל שלך
          </p>
        </form>

        {oauthAvailable && (
          <>
            <div className="relative my-5">
              <div className="absolute inset-0 flex items-center">
                <div className="w-full border-t border-border" />
              </div>
              <div className="relative flex justify-center text-xs">
                <span className="px-3 bg-white text-site-muted">או</span>
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
          יש לך כבר חשבון?{" "}
          <Link href="/login" className="text-primary hover:underline">
            כניסה לחשבון
          </Link>
        </p>
        <p className="text-center text-sm text-site-muted mt-2">
          רוצה להוסיף את העסק שלך?{" "}
          <Link href="/register/producer" className="text-secondary hover:underline">
            הצטרפי כבית עסק
          </Link>
        </p>
      </div>
    </div>
  );
}
