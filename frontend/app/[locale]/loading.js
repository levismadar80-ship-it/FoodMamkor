"use client";

import { useTranslations } from "next-intl";
import BrandLoader from "@/components/BrandLoader";

// MEH-2878: a CLIENT component on purpose. As a server component this file
// called getTranslations("a11y") with no locale — loading.js gets no params —
// so next-intl fell back to headers(), and that one call opted EVERY route
// under [locale] into per-request rendering (88 of 89 routes ƒ in the build;
// 27 page types cached again, listed in static-routes.expected.json). The client
// provider in the layout already ships the a11y namespace
// (lib/client-messages.js keeps it in the root set).
// DO NOT turn this back into an async server component that reads next-intl
// without a locale — the postbuild guard (scripts/static-routes-guard.mjs) reds on it in CI.

// The ONE route-level loading boundary of the site: it streams on every
// navigation without a nearer loading.js, so it cannot know the coming page's
// shape — hence the brand mark (MEH-2599), not a grid. Lists that know their
// shape keep their own Skeleton. Keep the file here: the recipe route and the
// MEH-1045 notFound() path rely on this boundary flushing the shell.
export default function Loading() {
  // MEH-876: announce the loading state to assistive tech.
  const t = useTranslations("a11y");
  // MEH-2754: the wrapper is at least one screen tall. The loader alone is
  // 40vh (.brand-loader min-height), which on a phone left the site footer in
  // the first screen while the page streamed; when the real page arrived the
  // footer jumped below the fold — one layout shift of 0.42 CLS on the home
  // page (Lighthouse, Moto G profile, 06/11). With the footer starting below
  // the fold the swap moves nothing the visitor can see. The mark itself stays
  // where it was (top 40vh band).
  return (
    <div className="min-h-screen" data-testid="route-loading">
      <BrandLoader label={t("loading")} className="max-w-7xl mx-auto px-4 py-8" />
    </div>
  );
}
