"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { useAuth } from "@/lib/auth-context";
import GoogleAuthButton from "@/components/GoogleAuthButton";
import AppleAuthButton from "@/components/AppleAuthButton";

export default function LoginPage() {
  const router = useRouter();
  const { login } = useAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      await login(email, password);
      router.push("/");
    } catch (err) {
      setError(err.response?.data?.detail || "משהו השתבש, נסי שוב");
    }
    setLoading(false);
  };

  // Check if OAuth is configured — when neither Google nor Apple is set,
  // we skip the whole OAuth section + divider to avoid an empty block.
  const googleConfigured =
    typeof process !== "undefined" && !!process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID;
  const appleConfigured =
    typeof process !== "undefined" && !!process.env.NEXT_PUBLIC_APPLE_CLIENT_ID;
  const oauthAvailable = googleConfigured || appleConfigured;

  return (
    <div className="max-w-md mx-auto px-4 py-16">
      <div className="bg-white rounded-[16px] p-8 border border-border">
        <h1 className="font-headline text-3xl font-bold mb-6 text-center text-site-text">
          כניסה לחשבון
        </h1>

        {/* OAuth block (only when something is configured) */}
        {oauthAvailable && (
          <>
            <div className="space-y-3 mb-2">
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

            {/* — או — divider */}
            <div className="relative my-6">
              <div className="absolute inset-0 flex items-center">
                <div className="w-full border-t border-border" />
              </div>
              <div className="relative flex justify-center text-sm">
                <span className="px-3 bg-white text-site-muted">— או —</span>
              </div>
            </div>
          </>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label htmlFor="login-email" className="block text-sm font-medium mb-1 text-site-text">
              אימייל
            </label>
            <input
              id="login-email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              className="w-full border border-border rounded-[8px] px-3 py-2 bg-white focus-visible:ring-2 focus-visible:ring-primary/40 outline-none"
              dir="ltr"
            />
          </div>
          <div>
            <label htmlFor="login-password" className="block text-sm font-medium mb-1 text-site-text">
              סיסמה
            </label>
            <input
              id="login-password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              className="w-full border border-border rounded-[8px] px-3 py-2 bg-white focus-visible:ring-2 focus-visible:ring-primary/40 outline-none"
              dir="ltr"
            />
          </div>
          {error && (
            <p className="text-red-500 text-sm" role="alert">{error}</p>
          )}
          <button
            type="submit"
            disabled={loading}
            className="w-full bg-primary text-white py-3 rounded-[8px] hover:bg-primary-light transition font-medium disabled:opacity-50"
          >
            {loading ? "מתחברת..." : "כניסה"}
          </button>
        </form>

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
