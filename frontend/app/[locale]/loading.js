import { getTranslations } from "next-intl/server";
import BrandLoader from "@/components/BrandLoader";

// The ONE route-level loading boundary of the site: it streams on every
// navigation without a nearer loading.js, so it cannot know the coming page's
// shape — hence the brand mark (MEH-2599), not a grid. Lists that know their
// shape keep their own Skeleton. Keep the file here: the recipe route and the
// MEH-1045 notFound() path rely on this boundary flushing the shell.
export default async function Loading() {
  // MEH-876: announce the loading state to assistive tech.
  const t = await getTranslations("a11y");
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
