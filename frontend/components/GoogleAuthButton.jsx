// @ts-check
/// <reference path="../types/browser-globals.d.ts" />
"use client";

import { useRef } from "react";
import { useTranslations } from "next-intl";
import { PasskeyStepRequired, useAuth } from "@/lib/auth-context";
import { usePathname, useRouter } from "@/i18n/navigation";
import { gsiLang, useGoogleSignIn } from "@/lib/use-google-sign-in";
import { env } from "@/lib/env";
import { detailToMessage } from "@/lib/errors";

/** @param {{ onSuccess?: () => void, onError?: (message: string) => void, termsAccepted?: boolean }} props */
export default function GoogleAuthButton({ onSuccess, onError, termsAccepted = false }) {
  const t = useTranslations("auth.oauth");
  const { loginWithGoogle } = useAuth();
  const router = useRouter();
  const pathname = usePathname();
  const buttonRef = useRef(null);
  const clientId = env.NEXT_PUBLIC_GOOGLE_CLIENT_ID;
  // MEH-2080: read at callback time through a ref, so a box ticked after the
  // button rendered still counts without relying on the hook's closure.
  const termsRef = useRef(termsAccepted);
  termsRef.current = termsAccepted;

  const handleCredentialResponse = async (response) => {
    try {
      await loginWithGoogle(response.credential, { termsAccepted: termsRef.current });
      onSuccess?.();
    } catch (err) {
      // MEH-3305: the recovery-code form lives on /login (the ticket stays in
      // the auth context across the client-side move); on /login it shows in place.
      if (err instanceof PasskeyStepRequired) {
        if (pathname !== "/login") router.push("/login");
        return;
      }
      onError?.(detailToMessage(err.response?.data?.detail) || t("google_error"));
    }
  };

  useGoogleSignIn(clientId, handleCredentialResponse, () => {
    if (buttonRef.current) {
      window.google.accounts.id.renderButton(buttonRef.current, {
        theme: "outline",
        size: "large",
        width: buttonRef.current.offsetWidth,
        text: "continue_with",
        locale: gsiLang(),
      });
    }
  });

  if (!clientId) return null;

  // MEH-3343: reserve the 40px GSI "large" button before Google's script
  // paints it — the late iframe pushed the form below it down 40px (CLS 0.03
  // per element on /login, /register, /favorites). ProducerOAuthButtons
  // already reserves its own container the same way.
  return <div ref={buttonRef} className="w-full min-h-10" data-testid="google-auth-slot" />;
}
