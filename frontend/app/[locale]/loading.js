import { getTranslations } from "next-intl/server";
import BrandLoader from "@/components/BrandLoader";

// The ONE route-level loading boundary of the site. It streams the shell on
// every navigation that lacks a nearer loading.js — a producer page, a recipe,
// an event, /about, /login — so it cannot know the shape of what is coming.
// MEH-2599 replaced the 8-card producer grid it used to draw (which flashed
// business cards on the way to a recipe) with the brand mark, revealed only
// after 400 ms. Lists that DO know their shape keep their own Skeleton.
//
// Keep this file where it is: app/[locale]/[slug]/recipes/[recipe_id]/page.jsx
// and the MEH-1045 notFound() path rely on this boundary flushing the shell
// before a throw (HTTP status stays 200 — measured there, do not restate).
export default async function Loading() {
  // MEH-876: announce the loading state to assistive tech.
  const t = await getTranslations("a11y");
  return <BrandLoader label={t("loading")} className="max-w-7xl mx-auto px-4 py-8" />;
}
