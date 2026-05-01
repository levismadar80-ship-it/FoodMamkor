"use client";

import { Suspense, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { Eye, EyeSlash, Leaf } from "@phosphor-icons/react";
import api from "@/lib/api";
import PasswordInput from "@/components/PasswordInput";
import { firstFailureMessage } from "@/lib/passwordMessages";
import { PASSWORD_MIN_LENGTH } from "@/lib/validators";

export default function ResetPasswordPage() {
  return (
    <Suspense fallback={<div className="max-w-md mx-auto px-4 py-12 text-center text-site-muted">טוען...</div>}>
      <ResetPasswordForm />
    </Suspense>
  );
}

function ResetPasswordForm() {
  const router = useRouter();
  const params = useSearchParams();
  const token = params.get("token") || "";

  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  // showConfirm only — the new-password's eye toggle now lives inside
  // <PasswordInput> (MEH-306 sub-B).
  const [showConfirm, setShowConfirm] = useState(false);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [done, setDone] = useState(false);

  if (!token) {
    return (
      <div className="min-h-[calc(100vh-200px)] flex items-center justify-center px-4 py-16">
        <div className="bg-white rounded-[20px] p-8 sm:p-10 w-full max-w-md border border-border shadow-[0_4px_32px_rgba(46,104,83,0.08)] text-center">
          <p className="text-red-600 font-medium mb-4">קישור האיפוס לא תקין</p>
          <Link href="/forgot-password" className="text-primary hover:underline text-sm">
            בקשי קישור חדש
          </Link>
        </div>
      </div>
    );
  }

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError("");
    if (password.length < PASSWORD_MIN_LENGTH) {
      setError(`הסיסמה חייבת להכיל לפחות ${PASSWORD_MIN_LENGTH} תווים`);
      return;
    }
    if (password !== confirm) {
      setError("הסיסמאות אינן תואמות");
      return;
    }
    setLoading(true);
    try {
      await api.post("/auth/reset-password", { token, new_password: password });
      setDone(true);
      setTimeout(() => router.push("/login?reset=1"), 2000);
    } catch (err) {
      const status = err.response?.status;
      const detail = err.response?.data?.detail;
      if (status === 404) {
        setError("קישור האיפוס לא תקין. בקשי קישור חדש.");
      } else if (status === 410) {
        setError("קישור האיפוס פג תוקף. בקשי קישור חדש.");
      } else if (
        status === 422 &&
        detail &&
        typeof detail === "object" &&
        Array.isArray(detail.failures)
      ) {
        // MEH-306: backend ships {failures: ["too_short"|"too_common"|"same_as_current"]}.
        // same_as_current can only fire here (server-only check via current_hash) —
        // PasswordInput's checklist shows a "נבדק בשרת" pending tile pre-submit.
        setError(firstFailureMessage(detail.failures));
      } else {
        setError("שגיאה בעדכון הסיסמה, נסי שוב");
      }
    } finally {
      setLoading(false);
    }
  };

  if (done) {
    return (
      <div className="min-h-[calc(100vh-200px)] flex items-center justify-center px-4 py-16">
        <div className="bg-white rounded-[20px] p-8 sm:p-10 w-full max-w-md border border-border shadow-[0_4px_32px_rgba(46,104,83,0.08)] text-center">
          <div className="w-16 h-16 rounded-full bg-light mx-auto mb-4 flex items-center justify-center" aria-hidden="true">
            <Leaf size={32} weight="duotone" className="text-primary" />
          </div>
          <p className="text-primary font-semibold text-lg mb-1">✓ הסיסמה עודכנה בהצלחה</p>
          <p className="text-site-muted text-sm">מעבירים אותך לדף הכניסה...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-[calc(100vh-200px)] flex items-center justify-center px-4 py-16">
      <div className="bg-white rounded-[20px] p-8 sm:p-10 w-full max-w-md border border-border shadow-[0_4px_32px_rgba(46,104,83,0.08)] text-center">
        <div className="w-16 h-16 rounded-full bg-light mx-auto mb-4 flex items-center justify-center" aria-hidden="true">
          <Leaf size={32} weight="duotone" className="text-primary" />
        </div>
        <h1 className="font-headline text-2xl font-bold text-site-text mb-1">סיסמה חדשה</h1>
        <p className="text-site-muted text-sm mb-6">הזיני סיסמה חדשה (לפחות {PASSWORD_MIN_LENGTH} תווים)</p>

        <form onSubmit={handleSubmit} className="space-y-4 text-right">
          {/* MEH-306: PasswordInput owns the new-password input + eye toggle
              + live policy preview (length, breach). showCurrentPasswordReuse
              renders a "נבדק בשרת" pending tile because the server is the
              only authority on reuse (current_hash isn't exposed here). */}
          <PasswordInput
            name="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="סיסמה חדשה"
            ariaLabel="סיסמה חדשה"
            showCurrentPasswordReuse={true}
          />

          <div className="relative">
            <input
              type={showConfirm ? "text" : "password"}
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
              placeholder="אישור סיסמה"
              required
              dir="ltr"
              className="w-full border border-border rounded-[10px] px-4 py-3 bg-white focus-visible:ring-2 focus-visible:ring-primary/40 outline-none transition focus:border-primary pr-10"
            />
            <button
              type="button"
              onClick={() => setShowConfirm((v) => !v)}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-site-muted hover:text-site-text" // rtl-ok: eye toggle inside dir="ltr" input
              aria-label={showConfirm ? "הסתר סיסמה" : "הצג סיסמה"}
            >
              {showConfirm ? <EyeSlash size={18} /> : <Eye size={18} />}
            </button>
          </div>

          {error && (
            <div className="text-red-600 text-sm text-center" role="alert">
              <p>{error}</p>
              {error.includes("קישור") && (
                <Link href="/forgot-password" className="text-primary hover:underline text-xs mt-1 block">
                  בקשי קישור חדש
                </Link>
              )}
            </div>
          )}

          <button
            type="submit"
            disabled={loading || !password || !confirm}
            className="w-full bg-primary text-white py-3.5 rounded-[10px] hover:bg-primary-dark transition font-medium disabled:opacity-50"
          >
            {loading ? "מעדכן..." : "עדכני סיסמה"}
          </button>
        </form>
      </div>
    </div>
  );
}
