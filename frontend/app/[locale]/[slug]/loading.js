// @ts-check
"use client";

/**
 * Module:   [slug]/loading
 * Purpose:  MEH-3983 — what shows while a business page renders on the server:
 *           the page's own frame (cover, name, meta lines), from the first
 *           frame. Before it, app/[locale]/loading.js drew a blank cream screen
 *           (its brand mark fades in only after 0.4 s) for 0.3–0.8 s on prod
 *           between a tapped card and the business page.
 * Does NOT: fetch or read the URL. Cover the recipe pages under [slug]/recipes
 *           (they keep the site-wide loader, recipes/loading.js).
 * Related:  components/Skeleton.jsx SkeletonProducerPage (the geometry),
 *           app/[locale]/loading.js (the site-wide fallback this replaces
 *           here), app/[locale]/producers/loading.js (MEH-3059, same fix for
 *           the list), e2e/flows/manual/nav-throttled.spec.ts (0 blank frames).
 * History:  MEH-3983 (creation).
 */

import { useEffect, useLayoutEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { SkeletonProducerPage } from "@/components/Skeleton";
import { cameFromInsideSite } from "@/components/HistoryBackLink";
import { MAP_REFERRER } from "@/lib/map-view-state";
import { useScrollTopOnArrival } from "@/lib/route-memory";

// Before paint on the client; a plain effect on the server (no layout there).
const useIsomorphicLayoutEffect = typeof window === "undefined" ? useEffect : useLayoutEffect;

/**
 * Which row the business page will show above its cover on a phone.
 * @param {Window & typeof globalThis} win
 * @returns {"back" | "map" | null}
 */
function pickBackRow(win) {
  if (new URLSearchParams(win.location.search).get("from") === MAP_REFERRER) return "map";
  return cameFromInsideSite(win) ? "back" : null;
}

// (Not exported: a non-default export in a Next special file breaks its type
// contract under `next build --webpack`, MEH-1119.)
// DO NOT make this an async server component that calls getTranslations()
// without a locale — loading.js gets no params, so next-intl would fall back to
// headers() and every business page would render per request (MEH-2878).
export default function ProducerPageLoading() {
  const t = useTranslations("a11y");
  // The frame is drawn at the top of the page, so open it there (lib/route-memory.js).
  useScrollTopOnArrival();
  // The page shows a row above the cover on a phone: «חזרה למפה» on ?from=map,
  // else «→ חזרה» when a page of the site is behind it (ProducerDetail.jsx,
  // breadcrumb block). The frame holds the same row, read the same way, before
  // paint, so the cover does not move when the page replaces the frame.
  const [backRow, setBackRow] = useState(/** @type {"back" | "map" | null} */ (null));
  useIsomorphicLayoutEffect(() => {
    setBackRow(pickBackRow(window));
  }, []);
  // data-route-loader: the footer stays hidden while this is on screen (MEH-3878, globals.css).
  return (
    <div className="min-h-screen" data-route-loader="">
      <SkeletonProducerPage label={t("loading")} testId="producer-page-loading" backRow={backRow} />
    </div>
  );
}
