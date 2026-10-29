"use client";

import { Suspense, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { EnvelopeSimple, CheckCircle, LinkBreak } from "@phosphor-icons/react";
import { useTranslations } from "next-intl";
import api from "@/lib/api";
import { useAuth } from "@/lib/auth-context";
import { detailToMessage } from "@/lib/errors";
import StatusPage from "@/components/StatusPage";

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

  // MEH-2567: all three states use the shared StatusPage layout (line icon,
  // no card); the red filled X and the amber envelope are gone. Copy unchanged.
  if (verifyState === "loading") {
    return (
      <StatusPage
        icon={EnvelopeSimple}
        title={t("auth.verifyEmail.loading_title")}
        body={t("auth.verifyEmail.loading_subtitle")}
        bodyRole="status"
      />
    );
  }

  if (verifyState === "success") {
    return <VerifySuccess t={t} user={user} authLoading={authLoading} />;
  }

  return (
    <StatusPage
      icon={LinkBreak}
      title={t("auth.verifyEmail.error_title")}
      body={errorMsg}
      primary={{ href: "/", label: t("auth.verifyEmail.error_cta") }}
    />
  );
}

// MEH-2492: three cases. Auth still resolving → title only (no CTA yet, so a
// logged-in user never sees «כניסה להמשך» flash). Logged in → "redirecting" +
// a CTA to the same landing. Logged out → the next step, and no auto-redirect.
function VerifySuccess({ t, user, authLoading }) {
  const loggedIn = !authLoading && Boolean(user);
  const loggedOut = !authLoading && !user;
  return (
    <StatusPage
      testid="verify-email-success"
      icon={CheckCircle}
      title={t("auth.verifyEmail.success_title")}
      body={
        loggedIn
          ? t("auth.verifyEmail.success_subtitle")
          : loggedOut
            ? t("auth.verifyEmail.success_login_subtitle")
            : null
      }
      primary={
        loggedIn
          ? { href: landingAfterVerify(user), label: t("auth.verifyEmail.success_cta"), testid: "verify-email-continue" }
          : loggedOut
            ? { href: LOGIN_PATH, label: t("auth.verifyEmail.success_login_cta"), testid: "verify-email-login" }
            : null
      }
    />
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
