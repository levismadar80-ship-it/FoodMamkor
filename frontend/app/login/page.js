"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
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

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError("");
    if (!validateEmail(email)) {
      setError("כתובת האימייל אינה תקינה");
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

  const emailInvalid = emailTouched && email.length > 0 && !validateEmail(email);

  return (
    <div className="min-h-[calc(100vh-200px)] flex items-center justify-center px-4 py-16">
      <div className="bg-white rounded-[20px] p-8 sm:p-10 w-full max-w-md border border-border shadow-[0_4px_32px_rgba(46,104,83,0.08)] text-center">
        {/* Brand mark + heading */}
        <div className="mb-6">
          <div
            className="w-16 h-16 rounded-full bg-light mx-auto mb-4 flex items-center justify-center"
            aria-hidden="true"
          >
            <span className="text-3xl">🌿</span>
          </div>
          <h1 className="font-headline text-2xl font-bold text-site-text mb-1">
            כניסה למהמקור
          </h1>
          <p className="text-site-muted text-sm">ברוכה הבאה 🌱</p>
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
                emailInvalid ? "border-red-400" : "border-border focus:border-primary"
              }`}
              dir="ltr"
            />
            {emailInvalid && (
              <p className="text-xs text-red-500 mt-1 text-right">כתובת האימייל אינה תקינה</p>
            )}
          </div>
          <div>
            <label htmlFor="login-password" className="sr-only">
              סיסמה
            </label>
            <input
              id="login-password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              minLength={8}
              placeholder="סיסמה (לפחות 8 תווים)"
              className="w-full border border-border rounded-[10px] px-4 py-3 bg-white focus-visible:ring-2 focus-visible:ring-primary/40 outline-none focus:border-primary transition"
              dir="ltr"
            />
          </div>
          {error && (
            <p className="text-red-500 text-sm text-right" role="alert">
              {error}
            </p>
          )}
          <button
            type="submit"
            disabled={loading}
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
