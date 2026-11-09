"use client";

/**
 * Module:   HistoryBackLink
 * Purpose:  MEH-2857 — «→ חזרה» on an item page (group buy, event, experience,
 *           recipe) that returns to the exact page the visitor came from, with
 *           its scroll and filters (router.back). It shows only when there IS
 *           such a page inside the site; a visitor who landed from WhatsApp or
 *           Google sees the page's location breadcrumb only.
 * Does NOT: show where the page lives on the site — that is the breadcrumb's
 *           job (NN/g: breadcrumbs are location, not history). No global store:
 *           the answer is read from the browser on mount.
 * Related:  components/Breadcrumb.jsx; messages producer.detail.back_label /
 *           producer.detail.aria.back (existing copy).
 * History:  MEH-2857 (creation).
 */

import { useEffect, useLayoutEffect, useState } from "react";
import { useTranslations } from "next-intl";

// Before paint on the client, so an in-app arrival never shows the page
// without the link first; plain effect on the server (no layout there).
const useIsomorphicLayoutEffect = typeof window === "undefined" ? useEffect : useLayoutEffect;

/**
 * Did the visitor reach this page from inside the site, with a page to go
 * back to?
 *   - In-app (client-side) navigation: the tab's first document was another
 *     path. document.referrer does not change on client navigation, so the
 *     tab's own first navigation entry is the witness.
 *   - A full load from our own site (same-origin referrer) — but only with a
 *     history entry behind it; a link opened in a new tab has none, and
 *     router.back() there would do nothing.
 */
export function cameFromInsideSite(win = typeof window === "undefined" ? undefined : window) {
  if (!win) return false;
  try {
    const first = win.performance?.getEntriesByType?.("navigation")?.[0]?.name;
    if (first && new URL(first).pathname !== win.location.pathname) return true;
    const ref = win.document.referrer;
    return Boolean(ref) && new URL(ref).origin === win.location.origin && win.history.length > 1;
  } catch {
    return false; // an unparsable URL is not a reason to offer a dead button
  }
}

export default function HistoryBackLink({ className = "" }) {
  const t = useTranslations("producer.detail");
  const [show, setShow] = useState(false);

  // A browser-only fact: deciding it during render would mismatch the server
  // HTML, so it is read once after mount (before paint on the client).
  useIsomorphicLayoutEffect(() => {
    setShow(cameFromInsideSite());
  }, []);

  if (!show) return null;
  return (
    <button
      type="button"
      // Next's app-router `router.back()` is exactly this call; using it
      // directly keeps the link free of the router context, so every page
      // (and its tests) can render it as-is.
      onClick={() => window.history.back()}
      aria-label={t("aria.back")}
      data-testid="history-back"
      className={`inline-flex items-center min-h-touch text-sm text-primary hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40 rounded ${className}`}
    >
      {t("back_label")}
    </button>
  );
}
