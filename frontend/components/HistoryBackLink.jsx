// @ts-check
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
 * History:  MEH-2857 (creation); MEH-3057 (always its own row); MEH-3944 (in
 *           the server HTML, shown before paint by html[data-came-from-site]).
 *
 * The same test runs before the first paint in lib/prehydration-flags-inline.js
 * (an inline script cannot import); HistoryBackBeforePaint.test.jsx holds the
 * two equal.
 */

import { useEffect, useLayoutEffect, useState } from "react";
import { useTranslations } from "next-intl";

// Before paint on the client, so an in-app arrival never shows the page
// without the link first; plain effect on the server (no layout there).
const useIsomorphicLayoutEffect = typeof window === "undefined" ? useEffect : useLayoutEffect;

// en is the only prefixed locale (localePrefix "as-needed"); a language switch
// rewrites the path in place, so paths are compared without it.
const stripLocale = (path) => path.replace(/^\/en(?=\/|$)/, "") || "/";

/**
 * Is there a page of OURS right behind this one in the tab's history?
 *   - Where the browser can say (Navigation API: Chromium, Android webviews):
 *     `navigation.canGoBack` — true only when a same-origin entry sits behind
 *     the current one. A landing from WhatsApp / Google is index 0 (cross-
 *     origin entries are not exposed), a language switch replaces in place.
 *   - Elsewhere: the tab's first document was another page of the site (by
 *     path, locale prefix ignored) — i.e. the visitor moved here client-side.
 *     document.referrer is NOT used: it survives reloads and back/forward
 *     rebuilds, and history.length counts forward entries, so both could show
 *     a button that leaves the site or does nothing (fresh-review finding).
 *     The fallback can miss (a reload after an in-app arrival); it does not
 *     show a dead button.
 */
export function cameFromInsideSite(win = typeof window === "undefined" ? undefined : window) {
  if (!win) return false;
  try {
    if (typeof win.navigation?.canGoBack === "boolean") return win.navigation.canGoBack;
    const first = win.performance?.getEntriesByType?.("navigation")?.[0]?.name;
    if (!first) return false;
    return stripLocale(new URL(first).pathname) !== stripLocale(win.location.pathname);
  } catch {
    return false; // an unparsable URL is not a reason to offer a dead button
  }
}

export default function HistoryBackLink({ className = "" }) {
  const t = useTranslations("producer.detail");
  // MEH-3944: null until the read below. The server HTML and the first client
  // render then carry the button marked data-history-back-only, which
  // globals.css shows only when the inline flags script found a page of the
  // site behind this one. Before, the server HTML had no button and hydration
  // added it above the gallery: a hard load with a page of ours behind (a
  // reload, the E2E's page.goto chain) pushed the page down 52px on a phone.
  const [show, setShow] = useState(/** @type {boolean | null} */ (null));

  // A browser-only fact: deciding it during render would mismatch the server
  // HTML, so it is read once after mount (before paint on the client). After
  // it the answer is a plain true / false, so a later in-app visit never
  // relies on the flag the first document set.
  useIsomorphicLayoutEffect(() => {
    setShow(cameFromInsideSite());
  }, []);

  if (show === false) return null;
  return (
    <button
      type="button"
      // Next's app-router `router.back()` is exactly this call; using it
      // directly keeps the link free of the router context, so every page
      // (and its tests) can render it as-is.
      // MEH-3057: a row of its own (`flex w-fit`, not inline-flex) — as an
      // inline box the next inline item (the category chip) sat on the same
      // line, touching it. Block-level here, so no page can put it back.
      onClick={() => window.history.back()}
      aria-label={t("aria.back")}
      data-testid="history-back"
      data-history-back-only={show === null ? "" : undefined}
      className={`flex w-fit items-center min-h-touch text-sm text-primary hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40 rounded ${className}`}
    >
      {t("back_label")}
    </button>
  );
}
