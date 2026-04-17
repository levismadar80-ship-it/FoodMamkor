"use client";

import { useState } from "react";
import api from "@/lib/api";

export default function UpgradePage() {
  const [email, setEmail] = useState("");
  const [submitted, setSubmitted] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!email) return;
    setSubmitting(true);
    try {
      await api.post("/newsletter", { email });
    } catch {
      // Non-blocking: treat as success regardless
    }
    setSubmitted(true);
    setSubmitting(false);
  };

  return (
    <div className="max-w-2xl mx-auto px-4 py-16">
      <div className="bg-white rounded-[12px] p-8 text-center">
        <div className="text-5xl mb-4">⭐</div>
        <h1 className="text-3xl font-bold mb-2">שדרגו לפרמיום</h1>
        <p className="text-text-secondary mb-8">קבלו יותר חשיפה ויותר אפשרויות לעסק שלכם</p>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-8">
          {/* Free Plan */}
          <div className="border rounded-[12px] p-6">
            <h3 className="font-semibold text-lg mb-1">חינם</h3>
            <p className="text-3xl font-bold text-primary mb-4">₪0</p>
            <ul className="text-right text-sm space-y-2 text-text-secondary">
              <li>✓ הופעה במפה</li>
              <li>✓ עד 3 תמונות</li>
              <li>✓ פרטי קשר</li>
              <li>✓ אזורי משלוח</li>
              <li className="text-gray-300">✗ מוצרים ללא הגבלה</li>
              <li className="text-gray-300">✗ תמונות ללא הגבלה</li>
              <li className="text-gray-300">✗ סטטיסטיקות</li>
            </ul>
          </div>

          {/* Premium Plan */}
          <div className="border-2 border-secondary rounded-[12px] p-6 relative">
            <span className="absolute -top-3 left-1/2 -translate-x-1/2 bg-secondary text-white text-xs px-3 py-1 rounded-full">
              בקרוב
            </span>
            <h3 className="font-semibold text-lg mb-1">פרמיום</h3>
            <p className="text-3xl font-bold text-secondary mb-4">בקרוב</p>
            <ul className="text-right text-sm space-y-2 text-text-secondary">
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

        {/* Email capture */}
        <div className="bg-light rounded-[12px] p-6">
          <h2 className="font-bold text-lg mb-1">עדכני אותי כשפרמיום יוצא</h2>
          <p className="text-text-secondary text-sm mb-4">נודיע לך ראשונה — ללא ספאם</p>
          {submitted ? (
            <p className="text-primary font-medium">נרשמת! 🌱 נעדכן אותך כשפרמיום יוצא.</p>
          ) : (
            <form onSubmit={handleSubmit} className="flex flex-col sm:flex-row gap-3">
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="כתובת האימייל שלך"
                required
                dir="ltr"
                className="flex-1 border border-border rounded-[12px] px-4 py-2 focus:outline-none focus:border-primary text-sm"
              />
              <button
                type="submit"
                disabled={submitting}
                className="bg-primary text-white px-6 py-2 rounded-[12px] hover:bg-primary-dark transition text-sm font-medium disabled:opacity-50"
              >
                {submitting ? "שולח..." : "עדכני אותי"}
              </button>
            </form>
          )}
        </div>
      </div>
    </div>
  );
}
