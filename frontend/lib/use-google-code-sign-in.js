// @ts-check
/// <reference path="../types/browser-globals.d.ts" />
"use client";

/**
 * Module:   use-google-code-sign-in
 * Purpose:  Sign-in for our own Google button (MEH-3690): open Google's popup
 *           (GIS code client), swap the one-time code at POST
 *           /auth/google/code, and hand the caller the verified Google ID
 *           token — the same token Google's rendered button used to give.
 * Touches:  accounts.google.com (the GSI script and the popup);
 *           POST /auth/google/code.
 * Does NOT: sign anyone in. The caller posts the ID token to the route it
 *           already used (loginWithGoogle → /auth/google, …). Draw the
 *           button: components/ui/GoogleButton.jsx does.
 * Related:  backend/app/routers/auth_google_code.py (the swap);
 *           lib/use-google-sign-in.js (loadGsiScript, the idle preload).
 * History:  MEH-3690 (creation).
 */

import { useCallback, useEffect, useRef, useState } from "react";
import api from "@/lib/api";
import { GoogleCodeResponseSchema } from "@/lib/api-responses";
import { loadGsiScript } from "@/lib/use-google-sign-in";

/** `openid` is what makes Google return an ID token with the code. */
const GOOGLE_CODE_SCOPES = "openid email profile";

/**
 * Swap Google's one-time code for the verified ID token.
 * @param {string} code
 * @returns {Promise<string>}
 */
async function swapGoogleCode(code) {
  const res = await api.post("/auth/google/code", { code });
  const parsed = GoogleCodeResponseSchema.safeParse(res.data);
  if (!parsed.success) throw new Error("google_code_bad_response");
  return parsed.data.id_token;
}

/**
 * @typedef {{ onIdToken: (idToken: string) => (void | Promise<void>), onError: (err: unknown) => void }} Handlers
 *   onError gets the request error (with `.response.data.detail`) or null
 *   when Google itself failed (popup blocked, script did not load). A popup
 *   the person closed, or a consent she declined, is not an error.
 */

/**
 * @param {{ current: Handlers }} handlers
 * @param {(busy: boolean) => void} setBusy
 */
function makeCodeCallback(handlers, setBusy) {
  /** @param {{ code?: string, error?: string }} response */
  return async (response) => {
    if (!response?.code) {
      if (response?.error !== "access_denied") handlers.current.onError(null);
      return;
    }
    setBusy(true);
    try {
      await handlers.current.onIdToken(await swapGoogleCode(response.code));
    } catch (err) {
      handlers.current.onError(err);
    } finally {
      setBusy(false);
    }
  };
}

/**
 * @param {string|null|undefined} clientId - NEXT_PUBLIC_GOOGLE_CLIENT_ID
 * @param {Handlers} handlers
 * @returns {{ start: () => void, busy: boolean }}
 */
export function useGoogleCodeSignIn(clientId, handlers) {
  const handlersRef = useRef(handlers);
  // The newest handlers, without re-running the effect below; Google calls
  // them only after a tap, so updating after the render is in time.
  useEffect(() => { handlersRef.current = handlers; });
  /** @type {{ current: GoogleCodeClient | null }} */
  const clientRef = useRef(null);
  const state = useRef({ pending: false, failed: false });
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!clientId || typeof window === "undefined") return undefined;
    let live = true;
    const callback = makeCodeCallback(handlersRef, (b) => { if (live) setBusy(b); });
    loadGsiScript().then(() => {
      const oauth2 = window.google?.accounts?.oauth2;
      if (!live || !oauth2) return;
      clientRef.current = oauth2.initCodeClient({
        client_id: clientId,
        scope: GOOGLE_CODE_SCOPES,
        ux_mode: "popup",
        callback: (/** @type {{ code?: string, error?: string }} */ r) => { if (live) callback(r); },
        error_callback: (/** @type {{ type?: string }} */ e) => {
          if (live && e?.type !== "popup_closed") handlersRef.current.onError(null);
        },
      });
      // A tap that came before the script: open the popup now.
      if (state.current.pending) clientRef.current.requestCode();
      state.current.pending = false;
    }, () => {
      state.current.failed = true;
      if (live && state.current.pending) handlersRef.current.onError(null);
      state.current.pending = false;
    });
    return () => {
      live = false;
      clientRef.current = null;
      state.current = { pending: false, failed: false };
    };
  }, [clientId]);

  const start = useCallback(() => {
    if (busy) return;
    if (clientRef.current) clientRef.current.requestCode();
    else if (state.current.failed) handlersRef.current.onError(null);
    else state.current.pending = true;
  }, [busy]);

  return { start, busy };
}
