// @ts-check
"use client";

/**
 * Module:   useUnsavedGuard
 * Purpose:  Warns before an owner leaves a dashboard form with unsaved edits:
 *           the browser's own prompt on refresh / tab close, and a confirm on
 *           any in-app link that leaves the page.
 * Touches:  window `beforeunload`; a capture-phase `click` listener on document.
 * Does NOT: know what is dirty — the page passes `dirty`; or block router.push
 *           calls (the App Router exposes no route-change event, so only link
 *           clicks are caught).
 * Related:  app/[locale]/producer/dashboard/edit/page.js (the aggregate of
 *           every card) · app/[locale]/producer/dashboard/offer/page.js.
 * History:  MEH-1100 (both guards, written in edit/page.js); MEH-3785 (moved
 *           here so the offer page, which left the edit tab, keeps them).
 */

import { useEffect } from "react";

/**
 * @param {boolean} dirty  some edit on the page is not saved
 * @param {string} message  the in-app confirm's text (translated by the caller)
 */
export function useUnsavedGuard(dirty, message) {
  // Guard 1: native tab-close / refresh prompt, only while dirty.
  useEffect(() => {
    if (!dirty) return;
    const handler = (/** @type {BeforeUnloadEvent} */ e) => {
      e.preventDefault();
      e.returnValue = "";
    };
    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, [dirty]);

  // Guard 2: in-app navigation. Intercept anchor clicks at capture phase
  // while dirty — the tab nav, header and BottomNav links alike. New-tab
  // clicks (target=_blank / modifier keys) and same-path links pass through.
  useEffect(() => {
    if (!dirty) return;
    const onClick = (/** @type {MouseEvent} */ e) => {
      if (e.defaultPrevented || e.button !== 0) return;
      if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
      const target = /** @type {Element | null} */ (e.target);
      const anchor = /** @type {HTMLAnchorElement | null} */ (target?.closest?.("a[href]") ?? null);
      if (!anchor || anchor.target === "_blank") return;
      const href = anchor.getAttribute("href");
      if (!href || href.startsWith("#")) return;
      const url = new URL(anchor.href, window.location.href);
      if (url.origin === window.location.origin && url.pathname === window.location.pathname) return;
      if (!window.confirm(message)) {
        e.preventDefault();
        e.stopPropagation();
      }
    };
    document.addEventListener("click", onClick, true);
    return () => document.removeEventListener("click", onClick, true);
  }, [dirty, message]);
}
