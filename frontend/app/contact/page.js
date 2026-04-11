"use client";

import { useState } from "react";
import api from "@/lib/api";

// Single source of truth for the public contact inbox shown on this page.
// Must match the backend CONTACT_EMAIL env var (backend/.env.example,
// backend/app/config.py::Settings.contact_email) so the visible address
// matches where POST /contact actually delivers.
const CONTACT_EMAIL = "levismadar80@gmail.com";

export default function ContactPage() {
  const [form, setForm] = useState({ name: "", email: "", message: "" });
  const [status, setStatus] = useState("idle"); // idle | loading | success | error
  const [errorMsg, setErrorMsg] = useState("");

  const set = (field) => (e) => setForm({ ...form, [field]: e.target.value });

  const handleSubmit = async (e) => {
    e.preventDefault();
    setStatus("loading");
    setErrorMsg("");
    try {
      await api.post("/contact", form);
      setStatus("success");
      setForm({ name: "", email: "", message: "" });
    } catch (err) {
      setStatus("error");
      setErrorMsg(
        err.response?.data?.detail ||
          "שליחת הטופס נכשלה. ניתן לשלוח אלינו מייל ישירות לכתובת למטה."
      );
    }
  };

  const mailtoHref = `mailto:${CONTACT_EMAIL}?subject=${encodeURIComponent(
    "פנייה דרך האתר"
  )}&body=${encodeURIComponent(
    `שם: ${form.name}\nאימייל: ${form.email}\n\n${form.message}`
  )}`;

  return (
    <main className="min-h-screen">
      <div className="max-w-2xl mx-auto px-4 py-16">
        <div className="bg-white rounded-[16px] p-8 border border-border shadow-[0_2px_12px_rgba(46,104,83,0.04)]">
          <h1 className="font-headline text-5xl font-bold text-site-text mb-2 text-center">
            דברי איתנו
          </h1>
          <p className="text-site-muted text-center mb-2">
            שאלות, רעיונות, או סתם שלום — נשמח לשמוע 🌿
          </p>
          <p className="text-sm text-site-muted text-center mb-8">
            נחזור אלייך תוך <strong>3 ימי עסקים</strong>.
          </p>

          <div className="bg-light/60 border border-border rounded-[12px] p-4 mb-6 text-sm">
            <p className="flex items-center gap-2 flex-wrap">
              <span>📧</span>
              <span>כתובת מייל:</span>
              <a
                href={`mailto:${CONTACT_EMAIL}`}
                className="text-primary hover:underline font-medium break-all"
                dir="ltr"
              >
                {CONTACT_EMAIL}
              </a>
            </p>
            <p className="flex items-center gap-2 mt-2">
              <span>⏱️</span>
              <span>זמן מענה: עד 3 ימי עסקים</span>
            </p>
          </div>

          {status === "success" ? (
            <div className="text-center py-8">
              <div className="text-5xl mb-4">✅</div>
              <h2 className="font-headline text-2xl font-bold text-site-text mb-2">
                תודה! קיבלנו את הפנייה.
              </h2>
              <p className="text-site-muted">נחזור אלייך תוך 3 ימי עסקים 🌿</p>
              <button
                type="button"
                onClick={() => setStatus("idle")}
                className="mt-6 text-primary hover:underline text-sm"
              >
                שליחת פנייה נוספת
              </button>
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label className="block text-sm font-medium mb-1 text-site-text">
                  שם מלא *
                </label>
                <input
                  type="text"
                  value={form.name}
                  onChange={set("name")}
                  required
                  className="w-full border border-border rounded-[12px] px-3 py-2 focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/40"
                />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1 text-site-text">
                  אימייל *
                </label>
                <input
                  type="email"
                  value={form.email}
                  onChange={set("email")}
                  required
                  dir="ltr"
                  className="w-full border border-border rounded-[12px] px-3 py-2 focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/40"
                />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1 text-site-text">
                  איך נוכל לעזור? *
                </label>
                <textarea
                  value={form.message}
                  onChange={set("message")}
                  required
                  rows={5}
                  className="w-full border border-border rounded-[12px] px-3 py-2 resize-none focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/40"
                />
              </div>

              {status === "error" && (
                <div className="text-sm text-red-600 bg-red-50 rounded-[12px] p-3">
                  <p>{errorMsg}</p>
                  <a
                    href={mailtoHref}
                    className="text-primary hover:underline inline-block mt-2"
                  >
                    פתיחת מייל ישירות →
                  </a>
                </div>
              )}

              <button
                type="submit"
                disabled={status === "loading"}
                className="w-full bg-primary text-white py-3 rounded-[12px] hover:bg-primary-light transition font-medium disabled:opacity-50"
              >
                {status === "loading" ? "שולחת..." : "שליחה"}
              </button>

              <p className="text-xs text-site-muted text-center">
                בשליחת הטופס את/ה מאשר/ת שקראת את{" "}
                <a href="/privacy" className="text-primary hover:underline">
                  מדיניות הפרטיות
                </a>
                .
              </p>
            </form>
          )}
        </div>
      </div>
    </main>
  );
}
