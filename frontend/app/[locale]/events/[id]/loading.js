// @ts-check
"use client";

/**
 * Module:   events/[id]/loading
 * Purpose:  MEH-3983 — an event page's own frame while it renders on the server, instead of the site-wide loader's blank first 0.4 s.
 * Does NOT: fetch or read the URL.
 * Related:  components/Skeleton.jsx SkeletonEventDetail (the same frame EventDetailClient shows while it reads); app/[locale]/loading.js (the fallback this replaces here);
 *           e2e/flows/manual/nav-throttled.spec.ts (0 blank frames).
 * History:  MEH-3983 (creation).
 */

// MEH-3983: an event page renders on the server, and until now the wait showed
// the site-wide loader (app/[locale]/loading.js) — a blank cream screen for its
// first 0.4 s. This draws the event's own frame from the first frame, the same
// one EventDetailClient shows while it reads the event (components/Skeleton.jsx).
// DO NOT call getTranslations() here: loading.js has no locale (MEH-2878).

import { useTranslations } from "next-intl";
import { SkeletonEventDetail } from "@/components/Skeleton";
import { useScrollTopOnArrival } from "@/lib/route-memory";

export default function EventPageLoading() {
  const t = useTranslations("a11y");
  useScrollTopOnArrival();
  // data-route-loader: the footer stays hidden while this is on screen (MEH-3878).
  return (
    <div className="min-h-screen" data-route-loader="">
      <SkeletonEventDetail label={t("loading")} testId="event-page-loading" />
    </div>
  );
}
