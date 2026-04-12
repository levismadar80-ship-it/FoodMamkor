"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Eye, EyeSlash } from "@phosphor-icons/react";
import { useAuth } from "@/lib/auth-context";
import GoogleAuthButton from "@/components/GoogleAuthButton";
import AppleAuthButton from "@/components/AppleAuthButton";
import ButtonSpinner from "@/components/ButtonSpinner";
import CitySearch from "@/components/CitySearch";
import PasswordStrength from "@/components/PasswordStrength";
import { validateIsraeliPhone, validateEmail } from "@/lib/validators";

export default function RegisterPage() {
  const router = useRouter();
  const { register } = useAuth();
  const [form, setForm] = useState({ email: "", name: "", password: "", city: "", phone: "" });
  const [agreedToTerms, setAgreedToTerms] = useState(false);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  // tasks_for_claude_code.md tasks 7+8 — per-field touched state for
  // onBlur inline validation + eye toggle for password visibility.
  const [nameTouched, setNameTouched] = useState(false);
  const [emailTouched, setEmailTouched] = useState(false);
  const [passwordTouched, setPasswordTouched] = useState(false);
  const [phoneTouched, setPhoneTouched] = useState(false);
  const [showPassword, setShowPassword] = useState(false);

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
      router.push("/");
    } catch (err) {
      setError(err.response?.data?.detail || "משהו השתבש, נסי שוב");
    }
    setLoading(false);
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

  return (
    <div className="max-w-md mx-auto px-4 py-16">
      <div className="bg-white rounded-[12px] p-5 md:p-8">
        <h1 className="font-headline text-3xl font-bold mb-6 text-center">הצטרפי לקהילה</h1>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium mb-1">שם מלא *</label>
            <input
              value={form.name}
              onChange={set("name")}
              onBlur={() => setNameTouched(true)}
              required
              aria-invalid={nameInvalid || undefined}
              className={`w-full border rounded-[12px] px-4 py-3 text-right transition ${
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
              className={`w-full border rounded-[12px] px-4 py-3 transition ${
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
            {/* Eye toggle + relative wrapper — same pattern as /login. */}
            <div className="relative">
              <input
                type={showPassword ? "text" : "password"}
                value={form.password}
                onChange={set("password")}
                onBlur={() => setPasswordTouched(true)}
                required
                minLength={8}
                aria-invalid={passwordInvalid || undefined}
                className={`w-full border rounded-[12px] pl-11 pr-4 py-3 focus-visible:ring-2 focus-visible:ring-primary/40 outline-none transition ${
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
                className="absolute left-3 top-1/2 -translate-y-1/2 text-site-muted hover:text-site-text transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40 rounded-full p-2"
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
              placeholder="חפשי עיר..."
            />
          </div>
          <div>
            <label className="block text-sm font-medium mb-1">טלפון</label>
            <input
              value={form.phone}
              onChange={set("phone")}
              onBlur={() => setPhoneTouched(true)}
              placeholder="0501234567"
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
              קראתי ואני מסכימ/ה{" "}
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
        </form>

        <GoogleAuthButton
          onSuccess={() => router.push("/")}
          onError={(msg) => setError(msg)}
        />
        <AppleAuthButton
          onSuccess={() => router.push("/")}
          onError={(msg) => setError(msg)}
        />

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
