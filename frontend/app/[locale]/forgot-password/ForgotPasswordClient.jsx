"use client";

import { useState } from "react";
import { Link } from "@/i18n/navigation";
import AuthSplitLayout from "@/components/auth/AuthSplitLayout";
import { useTranslations } from "next-intl";
import api from "@/lib/api";
import Input from "@/components/ui/Input";
import CollectionNotice from "@/components/CollectionNotice";
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

  // MEH-2568: the /login template (AuthSplitLayout) instead of a white card
  // with a leaf badge. Copy and testids unchanged.
  return (
    <AuthSplitLayout
      testId="forgot-password-page"
      title={t("auth.passwordRecovery.forgot.title")}
      subtitle={t("auth.passwordRecovery.forgot.subtitle")}
    >
      {submitted ? (
        /* MEH-215 journey C: the anti-enumeration ack (MEH-328). Same node
             for a known and an unknown address — the spec asserts exactly that. */
        <div
          data-testid="forgot-sent"
          className="bg-green-50 border border-primary/20 rounded-[12px] px-5 py-4 text-primary text-sm"
        >
          <p className="font-medium mb-1">
            {t("auth.passwordRecovery.forgot.success_main")}
          </p>
          <p className="text-fg-muted text-xs mt-2">
            {t("auth.passwordRecovery.forgot.success_contact_prefix")}{" "}
            <a
              href={`mailto:${CONTACT_EMAIL}`}
              className="text-primary hover:underline break-all"
              dir="ltr"
            >
              {CONTACT_EMAIL}
            </a>
          </p>
        </div>
      ) : (
        <form onSubmit={handleSubmit} className="space-y-4 text-start">
          {/* MEH-1145 Wave E1: plain email field → ui/Input (placeholder-only,
                no label invented; recipe converges to the canon). */}
          <Input
            data-testid="forgot-email"
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder={t("auth.passwordRecovery.forgot.email_placeholder")}
            required
            dir="ltr"
          />
          {/* MEH-1981: notice-at-collection — purpose of the one field this
                form takes. Copy approved verbatim 02/09 (rule 22). */}
          <CollectionNotice
            message={t("privacy.collection_notice.password_reset")}
            linkLabel={t("auth.register.consumer.terms.privacy_link")}
            testId="forgot-collection-notice"
          />
          {error && (
            <p className="text-red-600 text-sm text-center" role="alert">
              {error}
            </p>
          )}
          <button
            type="submit"
            data-testid="forgot-submit"
            disabled={loading || !email}
            className="w-full bg-primary text-white py-3.5 rounded-[10px] hover:bg-primary-dark transition font-medium disabled:opacity-50"
          >
            {loading
              ? t("auth.passwordRecovery.forgot.submit_sending")
              : t("auth.passwordRecovery.forgot.submit")}
          </button>
          <p className="text-center text-sm text-fg-muted">
            <Link
              href="/login"
              data-testid="forgot-back-to-login"
              className="text-primary hover:underline"
            >
              {t("auth.passwordRecovery.forgot.back_to_login")}
            </Link>
          </p>
        </form>
      )}
    </AuthSplitLayout>
  );
}
