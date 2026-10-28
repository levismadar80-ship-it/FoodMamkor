"use client";

import { Suspense, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import { Envelope, CheckCircle, XCircle } from "@phosphor-icons/react";
import { useTranslations } from "next-intl";
import api from "@/lib/api";
import { useAuth } from "@/lib/auth-context";
import { detailToMessage } from "@/lib/errors";

// MEH-2492: registration never logs the owner in (MEH-328 anti-enumeration,
// docs/SECURITY.md "verify via email link and then log in"), and the link is
// often opened in another browser or the mail app. So a logged-out visitor is
// the common case here: tell them to log in, never auto-send them home.
const REDIRECT_DELAY_MS = 1500;
const LOGIN_PATH = "/login";

// Where a verified, already-logged-in user goes next.
function landingAfterVerify(user) {
  return user?.producer_id ? "/producer/dashboard" : "/";
}

function useRedirectWhenLoggedIn(verifyState) {
  const { user, loading } = useAuth();
  useEffect(() => {
    if (verifyState !== "success" || loading || !user) return undefined;
    // Full page load so AuthProvider re-fetches /auth/me and picks up
    // email_verified: true (dismisses the banner).
    const timer = setTimeout(() => {
      window.location.assign(landingAfterVerify(user));
    }, REDIRECT_DELAY_MS);
    return () => clearTimeout(timer);
  }, [verifyState, loading, user]);
  return { user, loading };
}

function VerifyEmailContent() {
  const t = useTranslations();
  const searchParams = useSearchParams();
  const token = searchParams.get("token");
  const [verifyState, setVerifyState] = useState("loading"); // loading | success | error
  const [errorMsg, setErrorMsg] = useState("");
  const { user, loading: authLoading } = useRedirectWhenLoggedIn(verifyState);

  useEffect(() => {
    if (!token) {
      setVerifyState("error");
      setErrorMsg(t("auth.verifyEmail.errors.invalid_link"));
      return;
    }
    api
      .get("/auth/verify-email", { params: { token } })
      .then(() => setVerifyState("success"))
      .catch((err) => {
        setVerifyState("error");
        setErrorMsg(
          detailToMessage(err.response?.data?.detail) || t("auth.verifyEmail.errors.invalid_or_expired")
        );
      });
  }, [token, t]);

  if (verifyState === "loading") {
    return (
      <div className="min-h-[calc(100vh-200px)] flex items-center justify-center px-4 py-16">
        <div className="bg-white rounded-[20px] p-8 sm:p-10 w-full max-w-md border border-border shadow-[0_4px_32px_rgba(46,104,83,0.08)] text-center">
          <div className="w-16 h-16 rounded-full bg-amber-50 mx-auto mb-4 flex items-center justify-center">
            <Envelope size={32} weight="fill" className="text-amber-500" aria-hidden="true" />
          </div>
          <h1 className="font-headline-md text-2xl font-bold text-text mb-2">{t("auth.verifyEmail.loading_title")}</h1>
          <p className="text-fg-muted text-sm">{t("auth.verifyEmail.loading_subtitle")}</p>
        </div>
      </div>
    );
  }

  if (verifyState === "success") {
    return <VerifySuccess t={t} user={user} authLoading={authLoading} />;
  }

  return (
    <div className="min-h-[calc(100vh-200px)] flex items-center justify-center px-4 py-16">
      <div className="bg-white rounded-[20px] p-8 sm:p-10 w-full max-w-md border border-border shadow-[0_4px_32px_rgba(46,104,83,0.08)] text-center">
        <div className="w-16 h-16 rounded-full bg-red-50 mx-auto mb-4 flex items-center justify-center">
          <XCircle size={32} weight="fill" className="text-red-500" aria-hidden="true" />
        </div>
        <h1 className="font-headline-md text-2xl font-bold text-text mb-2">{t("auth.verifyEmail.error_title")}</h1>
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

// MEH-2492: three cases. Auth still resolving → title only (no CTA yet, so a
// logged-in user never sees «כניסה להמשך» flash). Logged in → "redirecting" +
// a CTA to the same landing. Logged out → the next step, and no auto-redirect.
function VerifySuccess({ t, user, authLoading }) {
  const loggedIn = !authLoading && Boolean(user);
  const loggedOut = !authLoading && !user;
  return (
    <div className="min-h-[calc(100vh-200px)] flex items-center justify-center px-4 py-16">
      <div
        data-testid="verify-email-success"
        className="bg-white rounded-[20px] p-8 sm:p-10 w-full max-w-md border border-border shadow-[0_4px_32px_rgba(46,104,83,0.08)] text-center"
      >
        <div className="w-16 h-16 rounded-full bg-green-50 mx-auto mb-4 flex items-center justify-center">
          <CheckCircle size={32} weight="fill" className="text-primary" aria-hidden="true" />
        </div>
        <h1 className="font-headline-md text-2xl font-bold text-text mb-2">{t("auth.verifyEmail.success_title")}</h1>
        {loggedIn && (
          <>
            <p className="text-fg-muted text-sm mb-6">{t("auth.verifyEmail.success_subtitle")}</p>
            <Link
              href={landingAfterVerify(user)}
              data-testid="verify-email-continue"
              className="block w-full bg-primary text-white py-3 rounded-[12px] hover:bg-primary-dark transition font-medium text-center"
            >
              {t("auth.verifyEmail.success_cta")}
            </Link>
          </>
        )}
        {loggedOut && (
          <>
            <p className="text-fg-muted text-sm mb-6">{t("auth.verifyEmail.success_login_subtitle")}</p>
            <Link
              href={LOGIN_PATH}
              data-testid="verify-email-login"
              className="block w-full bg-primary text-white py-3 rounded-[12px] hover:bg-primary-dark transition font-medium text-center"
            >
              {t("auth.verifyEmail.success_login_cta")}
            </Link>
          </>
        )}
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
