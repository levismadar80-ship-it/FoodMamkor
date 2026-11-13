// @ts-check
"use client";

/**
 * Module:   producers/loading
 * Purpose:  MEH-3059 — what shows while «כל בתי העסק» renders: the page's own
 *           frame (breadcrumb, real H1, search row, chip row, card grid), not
 *           the site-wide brand mark. /producers reads ?page=N, so it renders
 *           per request and cannot be prefetched; the root loading.js painted a
 *           beige logo screen for 0.15–1 s (staging, 13/11) and the real page
 *           then replaced it — the "re-rendered" look Sapir reported.
 * Does NOT: fetch anything or read the URL. The H1 is the default title only
 *           (a ?q= search arrives with its own title once the page lands).
 * Related:  app/[locale]/loading.js (the site-wide fallback this one replaces
 *           for /producers/**), components/ProducersClient.jsx (the layout
 *           this mirrors — breadcrumb mb-4, H1 row mb-6, search row mb-3),
 *           app/[locale]/producers/page.jsx (the wrapper width).
 * History:  MEH-3059 (creation).
 */

import { useTranslations } from "next-intl";
import Breadcrumb from "@/components/Breadcrumb";
import { SkeletonProducerGrid } from "@/components/Skeleton";

// One per filter chip in the live row; widths only vary so it does not read as
// a striped bar. Decorative — the grid below carries the status role.
const CHIP_WIDTHS = [64, 88, 72, 96, 60];

// DO NOT make this an async server component that calls getTranslations()
// without a locale — loading.js gets no params, so next-intl would fall back to
// headers() and every /producers/** route would render per request (MEH-2878).
export default function ProducersLoading() {
  const t = useTranslations("producers");
  return (
    <div className="max-w-7xl mx-auto px-4 py-8" data-testid="producers-loading">
      <Breadcrumb
        items={[{ href: "/", label: t("breadcrumb.home") }, { label: t("breadcrumb.all") }]}
        className="mb-4"
      />
      <div className="flex items-center justify-between gap-3 mb-6">
        <h1 className="font-headline-lg text-3xl font-bold text-text">{t("title.all")}</h1>
      </div>
      <div className="skeleton-box rounded-full min-h-touch mb-3" aria-hidden="true" />
      <div className="flex gap-2 mb-6 overflow-hidden" aria-hidden="true">
        {CHIP_WIDTHS.map((w) => (
          <div key={w} className="skeleton-box rounded-full h-9 shrink-0" style={{ width: w }} />
        ))}
      </div>
      <SkeletonProducerGrid count={8} />
    </div>
  );
}
