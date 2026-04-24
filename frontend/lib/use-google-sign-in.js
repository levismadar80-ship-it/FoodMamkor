"use client";

import { useEffect } from "react";

const GSI_SRC = "https://accounts.google.com/gsi/client";

/**
 * Singleton hook for Google Sign-In (GSI). Fixes the two-owner problem
 * (MEH-274) where GoogleAuthButton and ProducerOAuthButtons each called
 * google.accounts.id.initialize() independently, leaving a stale producer
 * callback active on /login after client-side navigation from /register/producer.
 *
 * Guarantees:
 * - The GSI script is loaded at most once per document.
 * - cancel() is called before every initialize() — clears any One Tap
 *   armed by a previous page's component.
 * - cancel() is called on unmount — prevents the current callback from
 *   firing after the component is gone.
 *
 * @param {string|null|undefined} clientId - NEXT_PUBLIC_GOOGLE_CLIENT_ID
 * @param {function} callback - GSI CredentialResponse handler
 * @param {function} [onReady] - Called after initialize(); use to renderButton
 */
export function useGoogleSignIn(clientId, callback, onReady) {
  useEffect(() => {
    if (!clientId || typeof window === "undefined") return;

    function init() {
      window.google.accounts.id.cancel();
      window.google.accounts.id.initialize({ client_id: clientId, callback });
      onReady?.();
    }

    if (window.google?.accounts?.id) {
      init();
      return () => window.google?.accounts.id.cancel();
    }

    const existing = document.querySelector(`script[src="${GSI_SRC}"]`);
    if (existing) {
      existing.addEventListener("load", init, { once: true });
      return () => window.google?.accounts.id.cancel();
    }

    const script = document.createElement("script");
    script.src = GSI_SRC;
    script.async = true;
    script.onload = init;
    document.body.appendChild(script);

    return () => {
      window.google?.accounts.id.cancel();
      script.remove();
    };
    // callback/onReady intentionally omitted — GSI callbacks are one-shot;
    // re-initializing on every render would cause the double-init warning.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clientId]);
}
