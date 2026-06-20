"use client";

import { useState } from "react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { Leaf } from "@phosphor-icons/react";
import api from "@/lib/api";
import { CONTACT_EMAIL } from "@/lib/env.client";

export default function ForgotPasswordClient() {
  const t = useTranslations();
  const [email, setEmail] = useState("");
  const [submitted, setSubmitted] = useState(false);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!email) return;
    setError("");
    setLoading(true);
    try {
      await api.post("/auth/forgot-password", { email });
      setSubmitted(true);
    } catch {
      setError(t("auth.passwordRecovery.forgot.errors.send_failed"));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-[calc(100vh-200px)] flex items-center justify-center px-4 py-16">
      <div className="bg-white rounded-[20px] p-8 sm:p-10 w-full max-w-md border border-border shadow-[0_4px_32px_rgba(46,104,83,0.08)] text-center">
        <div className="w-16 h-16 rounded-full bg-green-50 mx-auto mb-4 flex items-center justify-center" aria-hidden="true">
          <Leaf size={32} className="text-primary" />
        </div>
        <h1 className="font-headline-md text-2xl font-bold text-text mb-1">{t("auth.passwordRecovery.forgot.title")}</h1>
        <p className="text-fg-muted text-sm mb-6">{t("auth.passwordRecovery.forgot.subtitle")}</p>

        {submitted ? (
          <div className="bg-green-50 border border-primary/20 rounded-[12px] px-5 py-4 text-primary text-sm">
            <p className="font-medium mb-1">{t("auth.passwordRecovery.forgot.success_main")}</p>
            <p className="text-fg-muted text-xs mt-2">
              {t("auth.passwordRecovery.forgot.success_contact_prefix")}{" "}
              <a href={`mailto:${CONTACT_EMAIL}`} className="text-primary hover:underline">
                {CONTACT_EMAIL}
              </a>
            </p>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-4 text-start">
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder={t("auth.passwordRecovery.forgot.email_placeholder")}
              required
              dir="ltr"
              className="w-full border border-border rounded-[10px] px-4 py-3 bg-white focus-visible:ring-2 focus-visible:ring-primary/40 outline-none transition focus:border-primary"
            />
            {error && (
              <p className="text-red-600 text-sm text-center" role="alert">{error}</p>
            )}
            <button
              type="submit"
              disabled={loading || !email}
              className="w-full bg-primary text-white py-3.5 rounded-[10px] hover:bg-primary-dark transition font-medium disabled:opacity-50"
            >
              {loading ? t("auth.passwordRecovery.forgot.submit_sending") : t("auth.passwordRecovery.forgot.submit")}
            </button>
            <p className="text-center text-sm text-fg-muted">
              <Link href="/login" className="text-primary hover:underline">
                {t("auth.passwordRecovery.forgot.back_to_login")}
              </Link>
            </p>
          </form>
        )}
      </div>
    </div>
  );
}
