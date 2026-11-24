// @ts-check
/// <reference path="../types/browser-globals.d.ts" />
"use client";

import { useRef } from "react";
import { useTranslations } from "next-intl";
import { PasskeyStepRequired, useAuth } from "@/lib/auth-context";
import { usePathname, useRouter } from "@/i18n/navigation";
import { useGoogleCodeSignIn } from "@/lib/use-google-code-sign-in";
import GoogleButton from "@/components/ui/GoogleButton";
import { env } from "@/lib/env";
import { detailToMessage } from "@/lib/errors";

/** @param {{ onSuccess?: (credential: string) => void, onError?: (message: string) => void, termsAccepted?: boolean }} props */
export default function GoogleAuthButton({ onSuccess, onError, termsAccepted = false }) {
  const t = useTranslations("auth.oauth");
  const { loginWithGoogle } = useAuth();
  const router = useRouter();
  const pathname = usePathname();
  const clientId = env.NEXT_PUBLIC_GOOGLE_CLIENT_ID;
  // MEH-2080: read at callback time through a ref, so a box ticked after the
  // button rendered still counts without relying on the hook's closure.
  const termsRef = useRef(termsAccepted);
  termsRef.current = termsAccepted;

  /** @param {unknown} err */
  const fail = (err) => {
    // @ts-ignore — an axios error carries response.data.detail; anything else has none.
    onError?.(detailToMessage(err?.response?.data?.detail) || t("google_error"));
  };

  // MEH-3690: the ID token now comes from our own button's code swap; it is
  // the same Google-signed token the rendered button handed over, so
  // loginWithGoogle and every caller's onSuccess are unchanged.
  /** @param {string} credential */
  const signIn = async (credential) => {
    try {
      await loginWithGoogle(credential, { termsAccepted: termsRef.current });
      // MEH-3675: the credential goes to the caller too — the owner-invite
      // page sends it once more so a fresh sign-in replaces the email code.
      onSuccess?.(credential);
    } catch (err) {
      // MEH-3305: the recovery-code form lives on /login (the ticket stays in
      // the auth context across the client-side move); on /login it shows in place.
      if (err instanceof PasskeyStepRequired) {
        if (pathname !== "/login") router.push("/login");
        return;
      }
      fail(err);
    }
  };

  const { start, busy } = useGoogleCodeSignIn(clientId, { onIdToken: signIn, onError: fail });

  if (!clientId) return null;

  return <GoogleButton onClick={start} busy={busy} label={t("google_continue")} />;
}
