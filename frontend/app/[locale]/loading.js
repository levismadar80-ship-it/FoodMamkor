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
  return <BrandLoader label={t("loading")} className="max-w-7xl mx-auto px-4 py-8" />;
}
