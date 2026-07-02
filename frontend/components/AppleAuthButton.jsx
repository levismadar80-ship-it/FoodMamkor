"use client";

import { useEffect } from "react";
import { useTranslations } from "next-intl";
import { useAuth } from "@/lib/auth-context";
import { env } from "@/lib/env";
import { detailToMessage } from "@/lib/errors";

export default function AppleAuthButton({ onSuccess, onError }) {
  const t = useTranslations("auth.oauth");
  const { loginWithApple } = useAuth();
  const clientId = env.NEXT_PUBLIC_APPLE_CLIENT_ID;
  const redirectUri = env.NEXT_PUBLIC_APPLE_REDIRECT_URI;

  useEffect(() => {
    if (!clientId || typeof window === "undefined") return;

    const script = document.createElement("script");
    script.src = "https://appleid.cdn-apple.com/appleauth/static/jsapi/appleid/1/en_US/appleid.auth.js";
    script.async = true;
    script.onload = () => {
      window.AppleID?.auth.init({
        clientId,
        scope: "name email",
        redirectURI: redirectUri || window.location.origin,
        usePopup: true,
      });
    };
    document.body.appendChild(script);

    const handleAppleAuth = async (event) => {
      try {
        const { authorization, user } = event.detail;
        const name = user ? `${user.name?.firstName || ""} ${user.name?.lastName || ""}`.trim() : null;
        await loginWithApple(authorization.id_token, name);
        onSuccess?.();
      } catch (err) {
        onError?.(detailToMessage(err.response?.data?.detail) || t("apple_error"));
      }
    };

    const handleAppleError = (event) => {
      if (event.detail?.error !== "popup_closed_by_user") {
        onError?.(t("apple_error"));
      }
    };

    document.addEventListener("AppleIDSignInOnSuccess", handleAppleAuth);
    document.addEventListener("AppleIDSignInOnFailure", handleAppleError);

    return () => {
      script.remove();
      document.removeEventListener("AppleIDSignInOnSuccess", handleAppleAuth);
      document.removeEventListener("AppleIDSignInOnFailure", handleAppleError);
    };
  }, [clientId]);

  if (!clientId) return null;

  return (
    <button
      type="button"
      onClick={() => window.AppleID?.auth.signIn()}
      className="w-full bg-black text-white py-3 rounded-[8px] hover:bg-gray-900 transition font-medium flex items-center justify-center gap-2 focus-visible:ring-2 focus-visible:ring-black/40"
      aria-label={t("apple_continue")}
    >
      <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
        <path d="M17.05 20.28c-.98.95-2.05.88-3.08.4-1.09-.5-2.08-.48-3.24 0-1.44.62-2.2.44-3.06-.4C2.79 15.25 3.51 7.59 9.05 7.31c1.35.07 2.29.74 3.08.8 1.18-.24 2.31-.93 3.57-.84 1.51.12 2.65.72 3.4 1.8-3.12 1.87-2.38 5.98.48 7.13-.57 1.5-1.31 2.99-2.54 4.09zM12.03 7.25c-.15-2.23 1.66-4.07 3.74-4.25.29 2.58-2.34 4.5-3.74 4.25z" />
      </svg>
      {t("apple_continue")}
    </button>
  );
}
