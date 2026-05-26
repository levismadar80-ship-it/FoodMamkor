"use client";

import { useState } from "react";
import { CheckCircle, Leaf } from "@phosphor-icons/react";
import { useTranslations } from "next-intl";
import api from "@/lib/api";
import { CONTACT_EMAIL } from "@/lib/env.client";

// MEH-653: CONTACT_EMAIL now read from NEXT_PUBLIC_CONTACT_EMAIL (lib/env.client)
// with a "contact@mehamakor.co.il" fallback. Must still match the backend
// CONTACT_EMAIL env var (backend/.env.example, backend/app/config.py::
// Settings.contact_email) so the visible address matches where POST /contact
// actually delivers.

export default function ContactClient() {
  const t = useTranslations("contact");
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
      setErrorMsg(err.response?.data?.detail || t("error_default"));
    }
  };

  const mailtoHref = `mailto:${CONTACT_EMAIL}?subject=${encodeURIComponent(
    t("mailto_subject")
  )}&body=${encodeURIComponent(
    `${t("mailto_body_prefix")} ${form.name}\n${t("mailto_body_email")} ${form.email}\n\n${form.message}`
  )}`;

  return (
    <main className="min-h-screen">
      <div className="max-w-2xl mx-auto px-4 py-16">
        <div className="bg-white rounded-[16px] p-8 border border-border shadow-[0_2px_12px_rgba(46,104,83,0.04)]">
          <h1 className="font-headline text-5xl font-bold text-text mb-2 text-center">
            {t("title")}
          </h1>
          <p className="text-fg-muted text-center mb-2">
            {t("subtitle")}
          </p>
          <p className="text-sm text-fg-muted text-center mb-8">
            {t.rich("response_time_inline", {
              strong: (chunks) => <strong>{chunks}</strong>,
            })}
          </p>

          <div className="bg-green-50/60 border border-border rounded-[12px] p-4 mb-6 text-sm">
            <p className="flex items-center gap-2 flex-wrap">
              <span>📧</span>
              <span>{t("email_label")}</span>
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
              <span>{t("response_sla")}</span>
            </p>
          </div>

          {status === "success" ? (
            <div className="text-center py-8">
              <div className="mb-4 flex justify-center">
                <CheckCircle size={56} weight="fill" className="text-primary" aria-hidden="true" />
              </div>
              <h2 className="font-headline text-2xl font-bold text-text mb-2">
                {t("success_title")}
              </h2>
              <p className="text-fg-muted inline-flex items-center gap-1.5">
                {t("success_message")}
                <Leaf size={14} weight="duotone" className="text-primary" aria-hidden="true" />
              </p>
              <button
                type="button"
                onClick={() => setStatus("idle")}
                className="mt-6 text-primary hover:underline text-sm"
              >
                {t("success_send_another")}
              </button>
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label className="block text-sm font-medium mb-1 text-text">
                  {t("field_name_label")}
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
                <label className="block text-sm font-medium mb-1 text-text">
                  {t("field_email_label")}
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
                <label className="block text-sm font-medium mb-1 text-text">
                  {t("field_message_label")}
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
                    {t("open_mail_fallback")}
                  </a>
                </div>
              )}

              <button
                type="submit"
                disabled={status === "loading"}
                className="w-full bg-primary text-white py-3 rounded-[12px] hover:bg-primary-light transition font-medium disabled:opacity-50"
              >
                {status === "loading" ? t("submit_loading") : t("submit")}
              </button>

              <p className="text-xs text-fg-muted text-center">
                {t.rich("privacy_notice", {
                  link: (chunks) => (
                    <a href="/privacy" className="text-primary hover:underline">
                      {chunks}
                    </a>
                  ),
                })}
              </p>
            </form>
          )}
        </div>
      </div>
    </main>
  );
}
