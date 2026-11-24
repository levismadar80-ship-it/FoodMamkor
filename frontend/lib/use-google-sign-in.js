// @ts-check
/**
 * Module:   use-google-sign-in
 * Purpose:  The one place that adds Google's GSI <script>: loadGsiScript() for
 *           our own Google button, and preloadGsiWhenIdle() so the library is
 *           ready before a sign-in modal opens.
 * Does NOT: open the popup or swap the code — lib/use-google-code-sign-in.js
 *           does. Draw Google's own button: since MEH-3690 nothing does.
 * History:  MEH-274 / MEH-1784 (the old initialize() singleton, removed in
 *           MEH-3690 with its last caller); MEH-2319 (hl); MEH-3744 (preload).
 */
/// <reference path="../types/browser-globals.d.ts" />
"use client";

import { hasFullCookieConsent } from "@/lib/cookie-consent";

const GSI_BASE = "https://accounts.google.com/gsi/client";

// MEH-2319: the library is loaded in the page language (`hl`), read once, at
// load, from <html lang>. It decided the label of Google's rendered button;
// our own button has its own label, and `hl` stays so Google's texts match.
export function gsiLang() {
  const lang = (document.documentElement.lang || "he").slice(0, 2).toLowerCase();
  return lang === "en" ? "en" : "he";
}

function gsiSrc() {
  return `${GSI_BASE}?hl=${gsiLang()}`;
}

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
 * initialize(), no One Tap; loadGsiScript finds the tag and waits for it.
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
