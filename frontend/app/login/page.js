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
      setError(err.response?.data?.detail || "שגיאה בהתחברות");
    }
    setLoading(false);
  };

  return (
    <div className="max-w-md mx-auto px-4 py-16">
      <div className="bg-white rounded-[12px] p-8">
        <h1 className="text-2xl font-bold mb-6 text-center">התחברות</h1>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium mb-1">אימייל</label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              className="w-full border rounded-[12px] px-3 py-2"
              dir="ltr"
            />
          </div>
          <div>
            <label className="block text-sm font-medium mb-1">סיסמה</label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              className="w-full border rounded-[12px] px-3 py-2"
              dir="ltr"
            />
          </div>
          {error && <p className="text-red-500 text-sm">{error}</p>}
          <button
            type="submit"
            disabled={loading}
            className="w-full bg-primary text-white py-3 rounded-[12px] hover:bg-primary-light transition font-medium disabled:opacity-50"
          >
            {loading ? "מתחבר..." : "התחבר"}
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

        <p className="text-center text-sm text-text-secondary mt-6">
          אין לך חשבון?{" "}
          <Link href="/register" className="text-primary hover:underline">
            הירשם
          </Link>
        </p>
      </div>
    </div>
  );
}
