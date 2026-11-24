// @ts-check
/// <reference path="../types/browser-globals.d.ts" />
"use client";

import { useEffect, useRef } from "react";
import { hasFullCookieConsent } from "@/lib/cookie-consent";

const GSI_BASE = "https://accounts.google.com/gsi/client";

// MEH-2319: Google renders the button text in the language the LIBRARY was
// loaded in. renderButton's `locale` alone was ignored: measured 25/10 in a
// he-IL Chrome, `locale` he/iw/fr/ar/de all rendered "Continue with Google",
// and only `gsi/client?hl=he` produced «להמשיך עם Google». Google's reference
// says to put `hl` on the script src. Read once, at load, from <html lang>.
export function gsiLang() {
  const lang = (document.documentElement.lang || "he").slice(0, 2).toLowerCase();
  return lang === "en" ? "en" : "he";
}

function gsiSrc() {
  return `${GSI_BASE}?hl=${gsiLang()}`;
}

// MEH-1784 — document-scoped singleton state. Module scope is exactly the right
// lifetime: shared by every consumer within one document, and reset by a real
// page load, which re-evaluates the module.
let gsiInitialized = false;
let initializedClientId = null;
// The ref object owned by the currently-mounted consumer. A REF, not a
// function: the consumers pass inline arrows that are recreated every render,
// so holding the function directly would pin the callback to whichever render
// happened to mount. Holding the ref lets the owner update its own handler
// without re-registering anything with GSI.
let ownerRef = null;

// MEH-3744: one place that adds the script tag, for the hook and the preload.
function appendGsiScript() {
  const script = document.createElement("script");
  script.src = gsiSrc();
  script.async = true;
  document.body.appendChild(script);
  return script;
}

/**
 * Resolve once the GSI library is ready, reusing the tag the preload or
 * another consumer already added (MEH-3690: our own Google button). A tag that
 * fails to load is removed and the promise rejects, so the next call retries.
 *
 * @returns {Promise<void>}
 */
export function loadGsiScript() {
  if (window.google?.accounts) return Promise.resolve();
  return new Promise((resolve, reject) => {
    // DO NOT match on the exact src: any `hl` is the same GSI (MEH-2319).
    const script = document.querySelector(`script[src^="${GSI_BASE}"]`) || appendGsiScript();
    script.addEventListener("load", () => resolve(), { once: true });
    script.addEventListener("error", () => {
      script.remove();
      reject(new Error("gsi_load_failed"));
    }, { once: true });
  });
}

/**
 * Load the GSI script ahead of need, once the page has finished loading and
 * the browser is idle — so a sign-in modal opened later draws Google's button
 * at once instead of after a ~1 s download (MEH-3744). Loads only: no
 * initialize(), no One Tap; useGoogleSignIn finds the tag and waits for it.
 * Skipped for a signed-in visitor (a token in localStorage, as auth-context
 * keeps it), when Google is not configured, and without full cookie consent:
 * a guest who has not agreed to third-party cookies makes no request to Google
 * until she opens the modal herself (same gate as lib/analytics.js).
 * A tag that fails to load (blocker, offline) is removed, so the next modal
 * open adds its own and retries — a dead tag would leave no button at all.
 *
 * @param {string|null|undefined} clientId
 * @returns {() => void} cancels a preload that has not started yet
 */
let preloadStarted = false;

export function preloadGsiWhenIdle(clientId) {
  if (!clientId || typeof window === "undefined" || preloadStarted) return () => {};
  let signedIn = false;
  try { signedIn = Boolean(window.localStorage.getItem("token")); } catch { /* storage blocked: treat as guest */ }
  if (signedIn || !hasFullCookieConsent()) return () => {};
  preloadStarted = true;

  let idleId = 0;
  let timer = 0;
  const load = () => {
    if (window.google?.accounts?.id || document.querySelector(`script[src^="${GSI_BASE}"]`)) return;
    const script = appendGsiScript();
    script.addEventListener("error", () => script.remove(), { once: true });
  };
  const whenIdle = () => {
    if (typeof window.requestIdleCallback === "function") idleId = window.requestIdleCallback(load, { timeout: 4000 });
    else timer = window.setTimeout(load, 2000);
  };
  if (document.readyState === "complete") whenIdle();
  else window.addEventListener("load", whenIdle, { once: true });

  return () => {
    window.removeEventListener("load", whenIdle);
    if (idleId) window.cancelIdleCallback?.(idleId);
    if (timer) window.clearTimeout(timer);
    preloadStarted = false;
  };
}

/** Test seam: forget that a preload was started (module state). */
export function resetGsiPreloadForTests() {
  preloadStarted = false;
}

/**
 * Singleton hook for Google Sign-In (GSI). Fixes the two-owner problem
 * (MEH-274) where GoogleAuthButton and ProducerOAuthButtons each called
 * google.accounts.id.initialize() independently, leaving a stale producer
 * callback active on /login after client-side navigation from /register/producer.
 *
 * Guarantees:
 * - The GSI script is loaded at most once per document.
 * - google.accounts.id.initialize() runs at most ONCE per document (MEH-1784),
 *   with a stable module-level dispatcher rather than any component's own
 *   function. That indirection is what makes "once" compatible with
 *   "each consumer keeps its own callback": the registration never moves, the
 *   pointer behind it does.
 * - onReady runs on EVERY mount, initialized or not. This is load-bearing and
 *   not an oversight: onReady is what calls renderButton(). A guard that skips
 *   it stops the second button being drawn, the double-init warning disappears
 *   because nothing was rendered, and every negative assertion goes green over
 *   a dead page. That failure is silent where the original defect was noisy.
 * - cancel() is called before initialize() and on unmount — clears any One Tap
 *   armed by a previous page's component (MEH-274, unchanged).
 *
 * KNOWN LIMIT — one live consumer at a time. google.accounts.id registers a
 * single callback per document and renderButton() takes no per-button override,
 * so two SIMULTANEOUSLY-mounted consumers would still resolve last-mount-wins.
 * That is not reachable today: GoogleAuthButton is on /login, /register,
 * /claim and — since MEH-3661 — inside LoginPromptModal, which opens only for
 * a guest on pages with none of those (business page, map, favorites hearts);
 * ProducerOAuthButtons only on /register/producer, so the two never share a
 * document — they interleave sequentially via client-side navigation, which is
 * exactly what this hook now handles correctly. Making simultaneous consumers
 * work would need a different SDK surface; that is MEH-282, deliberately deferred.
 *
 * @param {string|null|undefined} clientId - NEXT_PUBLIC_GOOGLE_CLIENT_ID
 * @param {function} callback - GSI CredentialResponse handler
 * @param {function} [onReady] - Called after initialize(); use to renderButton
 */
export function useGoogleSignIn(clientId, callback, onReady) {
  // Always holds this consumer's latest handler, without re-running the effect.
  const callbackRef = useRef(callback);
  callbackRef.current = callback;

  useEffect(() => {
    if (!clientId || typeof window === "undefined") return;

    // Claim ownership synchronously, before any async script load can resolve.
    // Whoever mounted last owns the credential — which is the component the
    // user can actually see.
    const myRef = callbackRef;
    ownerRef = myRef;

    function init() {
      window.google.accounts.id.cancel();

      if (!gsiInitialized || initializedClientId !== clientId) {
        window.google.accounts.id.initialize({
          client_id: clientId,
          // Stable, module-owned. Never a component's function.
          callback: (response) => ownerRef?.current?.(response),
        });
        gsiInitialized = true;
        initializedClientId = clientId;
      }

      onReady?.();
    }

    // MEH-1784 — release the slot ONLY if this mount still holds it.
    // An unconditional `ownerRef = null` is wrong in two orderings that both
    // occur in practice: React StrictMode's mount→unmount→mount double-invoke,
    // and a navigation where the incoming component's effect runs before the
    // outgoing one's cleanup. In either case the departing mount would null a
    // slot the live component had already claimed, leaving the visible button
    // wired to nothing — the same dead-callback outcome this ticket removes,
    // reintroduced from the other side.
    const release = () => {
      window.google?.accounts.id.cancel();
      if (ownerRef === myRef) ownerRef = null;
    };

    // Script already present AND ready — the common case for mount #2, since
    // mount #1 loaded it. This branch is why "initialize once" is reachable at
    // all: init() runs, sees gsiInitialized, and calls only onReady().
    if (window.google?.accounts?.id) {
      init();
      return release;
    }

    // DO NOT match on the exact src — a script loaded with another `hl` (or
    // none) is still the one GSI instance in this document (MEH-2319).
    const existing = document.querySelector(`script[src^="${GSI_BASE}"]`);
    if (existing) {
      existing.addEventListener("load", init, { once: true });
      // MEH-3744: with the preload, the tag can still be loading when this
      // mount goes away; a late init() must not run for a closed modal.
      return () => {
        existing.removeEventListener("load", init);
        release();
      };
    }

    const script = appendGsiScript();
    script.onload = init;

    return () => {
      release();
      script.remove();
    };
    // callback/onReady intentionally omitted — the ref indirection above keeps
    // the handler current without re-running this effect, which is what allows
    // initialize() to stay at exactly one call per document.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clientId]);
}
