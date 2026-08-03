"use client";

import { useEffect, useRef } from "react";

const GSI_SRC = "https://accounts.google.com/gsi/client";

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
 * That is not reachable today: GoogleAuthButton is only on /login + /register,
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

    const existing = document.querySelector(`script[src="${GSI_SRC}"]`);
    if (existing) {
      existing.addEventListener("load", init, { once: true });
      return release;
    }

    const script = document.createElement("script");
    script.src = GSI_SRC;
    script.async = true;
    script.onload = init;
    document.body.appendChild(script);

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
