// @ts-check
"use client";

/**
 * Module:   experiences/[id]/loading
 * Purpose:  MEH-3983 — an experience page's own frame while it renders on the server, instead of the site-wide loader's blank first 0.4 s.
 * Does NOT: fetch or read the URL.
 * Related:  components/Skeleton.jsx SkeletonDetail (the same frame ExperienceDetailClient shows while it reads); app/[locale]/loading.js (the fallback this replaces here);
 *           e2e/flows/manual/nav-throttled.spec.ts (0 blank frames).
 * History:  MEH-3983 (creation).
 */

// MEH-3983: an experience page renders on the server, and until now the wait
// showed the site-wide loader (app/[locale]/loading.js) — a blank cream screen
// for its first 0.4 s. This draws the experience's own frame from the first
// frame, the same SkeletonDetail ExperienceDetailClient shows while it reads.
// DO NOT call getTranslations() here: loading.js has no locale (MEH-2878).

import { useTranslations } from "next-intl";
import { SkeletonDetail } from "@/components/Skeleton";
import { useScrollTopOnArrival } from "@/lib/route-memory";

export default function ExperiencePageLoading() {
  const t = useTranslations("a11y");
  useScrollTopOnArrival();
  // data-route-loader: the footer stays hidden while this is on screen (MEH-3878).
  return (
    <div className="min-h-screen" data-route-loader="">
      <SkeletonDetail width="max-w-[1100px]" label={t("loading")} testId="experience-page-loading" />
    </div>
  );
}
