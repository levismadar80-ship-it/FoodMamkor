import { getTranslations } from "next-intl/server";
import EventsClient from "./EventsClient";
import { hubTabTitles } from "./hub-tab-titles";
import { BRAND_NAME } from "@/lib/constants";
import { buildAlternates, buildEntityTitle, urlForLocalePath, OG_LOCALE } from "@/lib/i18n-seo";
import { getHubCount, hubRobots } from "@/lib/listing-supply";

// MEH-2984: ISR, like /group-buys — no longer `force-dynamic` (MEH-2878).
// That flag was there because EventsClient read useSearchParams() inside a
// <Suspense>, which on a static route renders only in the browser and drops
// the H1 from the cached HTML. EventsClient now reads the query in a mount
// effect, so the whole page (H1 included) is in the server HTML, and a
// static page can be prefetched by the hub tabs — no whole-page loader when
// arriving from /group-buys or /rescue. generateMetadata's supply count
// revalidates hourly (lib/listing-supply.js).
// DO NOT add useSearchParams back to EventsClient without re-reading this.

// MEH-739: per-locale hreflang + self canonical via buildAlternates (was a
// hand-built single-canonical entry with no hreflang languages map).
// MEH-475 Wave 6: metadata strings → seo.events.* (was hardcoded HE). Refs MEH-476.
export async function generateMetadata({ params }) {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "seo.events" });
  // MEH-2369: a hub that is KNOWN to be empty is noindex (an empty listing
  // reads to Google as a soft 404); an unknown count stays indexable.
  const robots = hubRobots(await getHubCount("events"));
  return {
    ...(robots ? { robots } : {}),
    // MEH-2853: plain title — the layout template `%s | <brand>` adds the brand.
    title: t("title"),
    description: t("description"),
    openGraph: {
      title: buildEntityTitle(t("og_title"), locale),
      description: t("og_description"),
      type: "website",
      // MEH-740: per-page og:url = self (mirrors #916 terms/privacy).
      url: urlForLocalePath("/events", locale),
      siteName: BRAND_NAME,
      locale: OG_LOCALE[locale],
      // Next.js replaces openGraph object on override — re-declare image.
      images: ["/og-image.png"],
    },
    // MEH-1060 (SEO-10): explicit Twitter card mirroring og (was inheriting the
    // layout's generic site card).
    twitter: {
      card: "summary_large_image",
      title: buildEntityTitle(t("og_title"), locale),
      description: t("og_description"),
      images: ["/og-image.png"],
    },
    alternates: buildAlternates("/events", locale),
  };
}

// MEH-2245: the tab is the route — this page is the events tab; the other
// route mounts the same EventsClient on the other tab.
export default async function EventsPage({ params }) {
  const { locale } = await params;
  // MEH-2980: both tab titles, so an in-place tab switch can retitle the page.
  const titles = await hubTabTitles(locale);
  return <EventsClient initialTab="events" titles={titles} />;
}
