"use client";

import { useRef } from "react";
import { useTranslations } from "next-intl";
import { useAuth } from "@/lib/auth-context";
import { useGoogleSignIn } from "@/lib/use-google-sign-in";
import { env } from "@/lib/env";

export default function GoogleAuthButton({ onSuccess, onError }) {
  const t = useTranslations("auth.oauth");
  const { loginWithGoogle } = useAuth();
  const buttonRef = useRef(null);
  const clientId = env.NEXT_PUBLIC_GOOGLE_CLIENT_ID;

  const handleCredentialResponse = async (response) => {
    try {
      await loginWithGoogle(response.credential);
      onSuccess?.();
    } catch (err) {
      onError?.(err.response?.data?.detail || t("google_error"));
    }
  };

  useGoogleSignIn(clientId, handleCredentialResponse, () => {
    if (buttonRef.current) {
      window.google.accounts.id.renderButton(buttonRef.current, {
        theme: "outline",
        size: "large",
        width: buttonRef.current.offsetWidth,
        text: "continue_with",
        locale: "he",
      });
    }
  });

  if (!clientId) return null;

  return <div ref={buttonRef} className="w-full" />;
}
