"use client";

import { useState } from "react";
import { Leaf } from "@phosphor-icons/react";
import api from "@/lib/api";

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState("");
  const [submitted, setSubmitted] = useState(false);
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!email) return;
    setLoading(true);
    try {
      await api.post("/auth/forgot-password", { email });
    } catch {
      // Endpoint may not exist yet — fail-open, always show success
    } finally {
      setLoading(false);
    }
    setSubmitted(true);
  };

  return (
    <div className="min-h-[calc(100vh-200px)] flex items-center justify-center px-4 py-16">
      <div className="bg-white rounded-[20px] p-8 sm:p-10 w-full max-w-md border border-border shadow-[0_4px_32px_rgba(46,104,83,0.08)] text-center">
        <div className="w-16 h-16 rounded-full bg-light mx-auto mb-4 flex items-center justify-center" aria-hidden="true">
          <Leaf size={32} weight="duotone" className="text-primary" />
        </div>
        <h1 className="font-headline text-2xl font-bold text-site-text mb-1">איפוס סיסמה</h1>
        <p className="text-site-muted text-sm mb-6">נשלח לך קישור לאיפוס סיסמה לאימייל</p>

        {submitted ? (
          <div className="bg-light border border-primary/20 rounded-[12px] px-5 py-4 text-primary text-sm">
            <p className="font-medium mb-1">✓ אם האימייל קיים במערכת — ישלח קישור לאיפוס</p>
            <p className="text-site-muted text-xs mt-2">
              לא קיבלת? צרי קשר:{" "}
              <a href="mailto:levismadar80@gmail.com" className="text-primary hover:underline">
                levismadar80@gmail.com
              </a>
            </p>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-4 text-right">
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="האימייל שלך"
              required
              dir="ltr"
              className="w-full border border-border rounded-[10px] px-4 py-3 bg-white focus-visible:ring-2 focus-visible:ring-primary/40 outline-none transition focus:border-primary"
            />
            <button
              type="submit"
              disabled={loading || !email}
              className="w-full bg-primary text-white py-3.5 rounded-[10px] hover:bg-primary-dark transition font-medium disabled:opacity-50"
            >
              {loading ? "שולח..." : "שלחי קישור לאיפוס"}
            </button>
          </form>
        )}
      </div>
    </div>
  );
}
