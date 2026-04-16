"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Eye, EyeSlash, Leaf } from "@phosphor-icons/react";
import { useAuth } from "@/lib/auth-context";
import GoogleAuthButton from "@/components/GoogleAuthButton";
import AppleAuthButton from "@/components/AppleAuthButton";
import ButtonSpinner from "@/components/ButtonSpinner";
import { validateEmail } from "@/lib/validators";

/**
 * Login page (docs/archive/FEEDBACK_FIXES.md fix 2).
 *
 * Layout order per the brief:
 *   1. Leaf-in-circle brand mark
 *   2. Heading "כניסה למהמקור" + "ברוכה הבאה 🌱"
 *   3. Email + password form FIRST
 *   4. "— או —" divider
 *   5. Google + Apple buttons BELOW
 *
 * The previous version had OAuth on top. Flipping the order per spec.
 */
export default function LoginPage() {
  const router = useRouter();
  const { login } = useAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [emailTouched, setEmailTouched] = useState(false);
  const [passwordTouched, setPasswordTouched] = useState(false);
  // tasks_for_claude_code.md task 7 — eye-icon toggle for password visibility
  const [showPassword, setShowPassword] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError("");
    if (!validateEmail(email)) {
      setError("האימייל לא תקין");
      return;
    }
    setLoading(true);
    try {
      await login(email, password);
      router.push("/");
    } catch (err) {
      setError(err.response?.data?.detail || "משהו השתבש, נסי שוב");
    }
    setLoading(false);
  };

  const googleConfigured =
    typeof process !== "undefined" && !!process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID;
  const appleConfigured =
    typeof process !== "undefined" && !!process.env.NEXT_PUBLIC_APPLE_CLIENT_ID;
  const oauthAvailable = googleConfigured || appleConfigured;

  // tasks_for_claude_code.md task 8 — inline field-level validation.
  // onBlur flips the `*Touched` state; error / valid states below only
  // activate after the user has interacted with the field, so the form
  // doesn't show a sea of red borders before the user types anything.
  // Submit button is disabled whenever either required field fails —
  // prevents a round-trip where the server returns a 4xx we already knew
  // about.
  const emailInvalid = emailTouched && email.length > 0 && !validateEmail(email);
  const emailValid = emailTouched && validateEmail(email);
  const passwordInvalid = passwordTouched && password.length > 0 && password.length < 8;
  const passwordValidLength = passwordTouched && password.length >= 8;
  const formIsValid = validateEmail(email) && password.length >= 8;

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
          <h1 className="font-headline text-2xl font-bold text-site-text mb-1">
            כניסה למהמקור
          </h1>
          <p className="text-site-muted text-sm">ברוכה הבאה</p>
        </div>

        {/* Email + password form — FIRST per spec */}
        <form onSubmit={handleSubmit} className="space-y-3 text-right mb-5">
          <div>
            <label htmlFor="login-email" className="sr-only">
              אימייל
            </label>
            <input
              id="login-email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              onBlur={() => setEmailTouched(true)}
              required
              placeholder="האימייל שלך"
              aria-invalid={emailInvalid || undefined}
              className={`w-full border rounded-[10px] px-4 py-3 bg-white focus-visible:ring-2 focus-visible:ring-primary/40 outline-none transition ${
                emailInvalid
                  ? "border-red-400"
                  : emailValid
                    ? "border-primary"
                    : "border-border focus:border-primary"
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
            <label htmlFor="login-password" className="sr-only">
              סיסמה
            </label>
            {/* Eye toggle — positioned at the END of the LTR password
                field (physical right). `pr-11` reserves space so typed
                text never overlaps the icon. */}
            <div className="relative">
              <input
                id="login-password"
                type={showPassword ? "text" : "password"}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                onBlur={() => setPasswordTouched(true)}
                required
                minLength={8}
                placeholder="סיסמה (לפחות 8 תווים)"
                aria-invalid={passwordInvalid || undefined}
                className={`w-full border rounded-[10px] pr-11 pl-4 py-3 bg-white focus-visible:ring-2 focus-visible:ring-primary/40 outline-none transition ${
                  passwordInvalid
                    ? "border-red-400"
                    : passwordValidLength
                      ? "border-primary"
                      : "border-border focus:border-primary"
                }`}
                dir="ltr"
              />
              <button
                type="button"
                onClick={() => setShowPassword((v) => !v)}
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
            {passwordValidLength && (
              <p className="text-xs text-primary mt-1 text-right">✓ תקין</p>
            )}
          </div>
          {error && (
            <p className="text-red-500 text-sm text-right" role="alert">
              {error}
            </p>
          )}
          <button
            type="submit"
            disabled={loading || !formIsValid}
            className="w-full bg-primary text-white py-3.5 rounded-[10px] hover:bg-primary-light transition font-medium disabled:opacity-50 focus-visible:ring-2 focus-visible:ring-primary/40"
          >
            {loading ? (
              <span className="inline-flex items-center gap-2">
                <ButtonSpinner />
                מתחברת...
              </span>
            ) : (
              "כניסה"
            )}
          </button>
        </form>

        {/* OAuth block — only when something is configured, BELOW the form */}
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
          אין לך חשבון?{" "}
          <Link href="/register" className="text-primary hover:underline">
            הצטרפי →
          </Link>
        </p>
      </div>
    </div>
  );
}
