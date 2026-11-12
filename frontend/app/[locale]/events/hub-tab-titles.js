import { getTranslations } from "next-intl/server";
import { BRAND_NAME, BRAND_NAME_LATIN } from "@/lib/constants";

// MEH-2980: the events ↔ experiences switch no longer navigates (it rewrites the
// URL in place), so Next never re-runs generateMetadata and the tab title would
// keep the first route's name. Both pages hand EventsClient the two finished
// titles, built exactly as the layout template builds them
// (app/[locale]/layout.js — `%s | <brand>`), and the client sets document.title.
// REUSES: the seo.events / seo.experiences `title` keys the two
// generateMetadata functions already read — no new copy.
export async function hubTabTitles(locale) {
  const brand = locale === "en" ? BRAND_NAME_LATIN : BRAND_NAME;
  const [tEvents, tExperiences] = await Promise.all([
    getTranslations({ locale, namespace: "seo.events" }),
    getTranslations({ locale, namespace: "seo.experiences" }),
  ]);
  return {
    events: `${tEvents("title")} | ${brand}`,
    experiences: `${tExperiences("title")} | ${brand}`,
  };
}
