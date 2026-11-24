// @ts-check
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
/// <reference path="../types/browser-globals.d.ts" />
"use client";

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
 * A tap still counts as the person's own gesture for about this long; a
 * popup opened later is blocked (Safari ~1 s, Chrome ~5 s). A tap that came
 * before the script opens the popup only inside this window (MEH-3690).
 */
const GESTURE_WINDOW_MS = 1000;

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
  const state = useRef({ tapAt: 0, failed: false });
  const [busy, setBusy] = useState(false);
  const [waiting, setWaiting] = useState(false);
  // Bumped by a tap after a failed load: loads the script again.
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    if (!clientId || typeof window === "undefined") return undefined;
    let live = true;
    const callback = makeCodeCallback(handlersRef, (b) => { if (live) setBusy(b); });
    const fail = () => {
      if (!live) return;
      state.current.failed = true;
      if (state.current.tapAt) handlersRef.current.onError(null);
      state.current.tapAt = 0;
      setWaiting(false);
    };
    loadGsiScript().then(() => {
      const oauth2 = window.google?.accounts?.oauth2;
      if (!live) return;
      // A GSI without the code client cannot open the popup: a failure, said
      // on the tap, never a button that silently does nothing.
      if (!oauth2) return fail();
      clientRef.current = oauth2.initCodeClient({
        client_id: clientId,
        scope: GOOGLE_CODE_SCOPES,
        ux_mode: "popup",
        callback: (/** @type {{ code?: string, error?: string }} */ r) => { if (live) callback(r); },
        error_callback: (/** @type {{ type?: string }} */ e) => {
          if (live && e?.type !== "popup_closed") handlersRef.current.onError(null);
        },
      });
      const { tapAt } = state.current;
      state.current.tapAt = 0;
      setWaiting(false);
      // A tap that came before the script: open the popup while the tap
      // still counts as a gesture; after that the button is ready for a
      // second tap instead of a blocked popup.
      if (tapAt && Date.now() - tapAt < GESTURE_WINDOW_MS) clientRef.current.requestCode();
      return undefined;
    }, fail);
    return () => {
      live = false;
      clientRef.current = null;
      state.current = { tapAt: 0, failed: false };
    };
  }, [clientId, attempt]);

  const start = useCallback(() => {
    if (busy || waiting) return;
    if (clientRef.current) clientRef.current.requestCode();
    else if (state.current.failed) {
      // Report this tap, and load the script again for the next one.
      handlersRef.current.onError(null);
      state.current.failed = false;
      setAttempt((n) => n + 1);
    } else {
      state.current.tapAt = Date.now();
      setWaiting(true);
    }
  }, [busy, waiting]);

  return { start, busy: busy || waiting };
}
