"use client";

import { useState } from "react";
import { useAuth } from "@/lib/auth-context";
import api from "@/lib/api";

export default function UpgradePage() {
  const { user } = useAuth();
  const [email, setEmail] = useState(user?.email ?? "");
  const [submitted, setSubmitted] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const handleNotify = async (e) => {
    e.preventDefault();
    if (!email) return;
    setSubmitting(true);
    try {
      await api.post("/newsletter", { email });
    } catch {
      // Swallow — sign up is best-effort; show success regardless
    }
    setSubmitted(true);
    setSubmitting(false);
  };

  return (
    <div className="max-w-2xl mx-auto px-4 py-16">
      <div className="bg-background border border-border rounded-[16px] p-8 text-center">
        <div className="text-5xl mb-4" aria-hidden="true">⭐</div>
        <h1 className="font-headline text-3xl font-bold text-site-text mb-2">שדרגו לפרמיום</h1>
        <p className="text-site-muted mb-8">קבלו יותר חשיפה ויותר אפשרויות לעסק שלכם</p>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-8">
          {/* Free Plan */}
          <div className="border border-border rounded-[16px] p-6">
            <h3 className="font-semibold text-lg text-site-text mb-1">חינם</h3>
            <p className="text-3xl font-bold text-primary mb-4">₪0</p>
            <ul className="text-right text-sm space-y-2 text-site-muted">
              <li>✓ הופעה במפה</li>
              <li>✓ עד 3 תמונות</li>
              <li>✓ פרטי קשר</li>
              <li>✓ אזורי משלוח</li>
              <li className="opacity-40">✗ מוצרים ללא הגבלה</li>
              <li className="opacity-40">✗ תמונות ללא הגבלה</li>
              <li className="opacity-40">✗ סטטיסטיקות</li>
            </ul>
          </div>

          {/* Premium Plan */}
          <div className="border-2 border-secondary rounded-[16px] p-6 relative">
            {/* eslint-disable-next-line no-restricted-syntax -- rtl-ok: horizontal centering idiom */}
            <span className="absolute -top-3 left-1/2 -translate-x-1/2 bg-secondary text-white text-xs px-3 py-1 rounded-full">
              מומלץ
            </span>
            <h3 className="font-semibold text-lg text-site-text mb-1">פרמיום</h3>
            <p className="text-3xl font-bold text-secondary mb-4">בקרוב</p>
            <ul className="text-right text-sm space-y-2 text-site-muted">
              <li>✓ הופעה במפה</li>
              <li>✓ תמונות ללא הגבלה</li>
              <li>✓ פרטי קשר</li>
              <li>✓ אזורי משלוח</li>
              <li>✓ רשימת מוצרים מלאה</li>
              <li>✓ סטטיסטיקות צפיות</li>
              <li>✓ תגית פרמיום</li>
            </ul>
          </div>
        </div>

        {submitted ? (
          <div className="bg-light border border-primary/20 rounded-[16px] px-6 py-5">
            <p className="text-primary font-semibold">🎉 נרשמת! נעדכן אותך כשפרמיום יושק.</p>
          </div>
        ) : (
          <form onSubmit={handleNotify} className="flex flex-col sm:flex-row gap-3 justify-center">
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="האימייל שלך"
              required
              dir="ltr"
              className="border border-border rounded-[12px] px-4 py-3 text-sm flex-1 max-w-xs focus:outline-none focus:ring-2 focus:ring-primary/40 bg-white"
            />
            <button
              type="submit"
              disabled={submitting}
              className="bg-secondary text-white px-6 py-3 rounded-full hover:bg-secondary/90 transition font-medium disabled:opacity-60 focus-visible:ring-2 focus-visible:ring-secondary/40"
            >
              {submitting ? "שולח..." : "עדכנו אותי כשיושק"}
            </button>
          </form>
        )}
      </div>
    </div>
  );
}
