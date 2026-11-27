// @ts-check
"use client";

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
