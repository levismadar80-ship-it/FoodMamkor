"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { useAuth } from "@/lib/auth-context";
import GoogleAuthButton from "@/components/GoogleAuthButton";
import AppleAuthButton from "@/components/AppleAuthButton";
import CitySearch from "@/components/CitySearch";
import PasswordStrength from "@/components/PasswordStrength";
import { passwordValid, validateIsraeliPhone, validateEmail } from "@/lib/validators";

export default function RegisterPage() {
  const router = useRouter();
  const { register } = useAuth();
  const [form, setForm] = useState({ email: "", name: "", password: "", city: "", phone: "" });
  const [agreedToTerms, setAgreedToTerms] = useState(false);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError("");

    // Client-side validation
    if (!validateEmail(form.email)) {
      setError("אימייל לא תקין");
      return;
    }
    if (!passwordValid(form.password)) {
      setError("הסיסמה לא עומדת בדרישות");
      return;
    }
    if (form.phone && !validateIsraeliPhone(form.phone)) {
      setError("מספר טלפון לא תקין — נסי שוב");
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

  const phoneValid = !form.phone || validateIsraeliPhone(form.phone);

  return (
    <div className="max-w-md mx-auto px-4 py-16">
      <div className="bg-white rounded-[12px] p-8">
        <h1 className="font-headline text-3xl font-bold mb-6 text-center">הצטרפי לקהילה</h1>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium mb-1">שם מלא *</label>
            <input value={form.name} onChange={set("name")} required className="w-full border rounded-[12px] px-3 py-2" />
          </div>
          <div>
            <label className="block text-sm font-medium mb-1">אימייל *</label>
            <input type="email" value={form.email} onChange={set("email")} required className="w-full border rounded-[12px] px-3 py-2" dir="ltr" />
          </div>
          <div>
            <label className="block text-sm font-medium mb-1">סיסמה *</label>
            <input
              type="password"
              value={form.password}
              onChange={set("password")}
              required
              minLength={8}
              className="w-full border rounded-[12px] px-3 py-2 focus-visible:ring-2 focus-visible:ring-primary/40 outline-none"
              dir="ltr"
            />
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
              placeholder="0501234567"
              className={`w-full border rounded-[12px] px-3 py-2 focus-visible:ring-2 focus-visible:ring-primary/40 outline-none ${
                form.phone && !phoneValid ? "border-red-400" : ""
              }`}
              dir="ltr"
              aria-invalid={form.phone ? !phoneValid : undefined}
            />
            {form.phone && !phoneValid && (
              <p className="text-xs text-red-500 mt-1">❌ מספר טלפון לא תקין — נסי שוב</p>
            )}
            {form.phone && phoneValid && (
              <p className="text-xs text-primary mt-1">✓ מספר תקין</p>
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
            disabled={loading || !agreedToTerms}
            className="w-full bg-primary text-white py-3 rounded-[12px] hover:bg-primary-light transition font-medium disabled:opacity-50"
          >
            {loading ? "נרשמת..." : "הצטרפי"}
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
