"use client";

import { Suspense, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import { useTranslations } from "next-intl";
import api from "@/lib/api";

function VerifyEmailContent() {
  const t = useTranslations();
  const searchParams = useSearchParams();
  const token = searchParams.get("token");
  const [verifyState, setVerifyState] = useState("loading"); // loading | success | error
  const [errorMsg, setErrorMsg] = useState("");

  useEffect(() => {
    if (!token) {
      setVerifyState("error");
      setErrorMsg(t("auth.verifyEmail.errors.invalid_link"));
      return;
    }
    api
      .get("/auth/verify-email", { params: { token } })
      .then(() => {
        setVerifyState("success");
        // Full page reload so AuthProvider re-fetches /auth/me and
        // picks up email_verified: true, dismissing the banner.
        setTimeout(() => {
          window.location.href = "/";
        }, 2000);
      })
      .catch((err) => {
        setVerifyState("error");
        setErrorMsg(
          err.response?.data?.detail || t("auth.verifyEmail.errors.invalid_or_expired")
        );
      });
  }, [token, t]);

  if (verifyState === "loading") {
    return (
      <div className="min-h-[calc(100vh-200px)] flex items-center justify-center px-4 py-16">
        <div className="bg-white rounded-[20px] p-8 sm:p-10 w-full max-w-md border border-border shadow-[0_4px_32px_rgba(46,104,83,0.08)] text-center">
          <div className="w-16 h-16 rounded-full bg-amber-50 mx-auto mb-4 flex items-center justify-center text-3xl">
            ✉️
          </div>
          <h1 className="font-headline text-2xl font-bold text-text mb-2">{t("auth.verifyEmail.loading_title")}</h1>
          <p className="text-fg-muted text-sm">{t("auth.verifyEmail.loading_subtitle")}</p>
        </div>
      </div>
    );
  }

  if (verifyState === "success") {
    return (
      <div className="min-h-[calc(100vh-200px)] flex items-center justify-center px-4 py-16">
        <div className="bg-white rounded-[20px] p-8 sm:p-10 w-full max-w-md border border-border shadow-[0_4px_32px_rgba(46,104,83,0.08)] text-center">
          <div className="w-16 h-16 rounded-full bg-green-50 mx-auto mb-4 flex items-center justify-center text-3xl">
            ✅
          </div>
          <h1 className="font-headline text-2xl font-bold text-text mb-2">{t("auth.verifyEmail.success_title")}</h1>
          <p className="text-fg-muted text-sm mb-6">{t("auth.verifyEmail.success_subtitle")}</p>
          <Link
            href="/"
            className="block w-full bg-primary text-white py-3 rounded-[12px] hover:bg-primary-dark transition font-medium text-center"
          >
            {t("auth.verifyEmail.success_cta")}
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-[calc(100vh-200px)] flex items-center justify-center px-4 py-16">
      <div className="bg-white rounded-[20px] p-8 sm:p-10 w-full max-w-md border border-border shadow-[0_4px_32px_rgba(46,104,83,0.08)] text-center">
        <div className="w-16 h-16 rounded-full bg-red-50 mx-auto mb-4 flex items-center justify-center text-3xl">
          ❌
        </div>
        <h1 className="font-headline text-2xl font-bold text-text mb-2">{t("auth.verifyEmail.error_title")}</h1>
        <p className="text-fg-muted text-sm mb-6">{errorMsg}</p>
        <Link
          href="/"
          className="block w-full bg-primary text-white py-3 rounded-[12px] hover:bg-primary-dark transition font-medium text-center"
        >
          {t("auth.verifyEmail.error_cta")}
        </Link>
      </div>
    </div>
  );
}

export default function VerifyEmailClient() {
  const t = useTranslations();
  return (
    <Suspense
      fallback={
        <div className="min-h-[calc(100vh-200px)] flex items-center justify-center">
          <p className="text-fg-muted">{t("auth.verifyEmail.fallback_loading")}</p>
        </div>
      }
    >
      <VerifyEmailContent />
    </Suspense>
  );
}
