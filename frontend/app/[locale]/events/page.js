import { Suspense } from "react";
import { getTranslations } from "next-intl/server";
import EventsClient from "./EventsClient";
import { BRAND_NAME } from "@/lib/constants";
import { buildAlternates, buildEntityTitle, urlForLocalePath, OG_LOCALE } from "@/lib/i18n-seo";
import { getHubCount, hubRobots } from "@/lib/listing-supply";

// MEH-2878: stays per-request on purpose. Its client body reads
// useSearchParams() inside <Suspense>; on a cached (static) route Next renders
// that subtree only in the browser, so the cached HTML would lose the page's
// H1 and body (measured: production has the H1 in its HTML, a cached build
// did not). Per-request keeps today's server-rendered HTML. Remove this only
// together with moving the H1 out of the Suspense subtree.
export const dynamic = "force-dynamic";

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

// EventsClient uses useSearchParams() for the ?city= / ?category= deep-links.
// Next.js 14 requires a Suspense boundary around any component that reads
// search params in the App Router. MEH-2245: the tab is the route — this page
// is the events tab; /experiences mounts the same component on the other tab.
export default async function EventsPage({ params }) {
  // MEH-858 F2: Suspense fallback was a hardcoded HE string (leaked Hebrew on
  // /en). Wire the existing events.list.loading_events key — same rendered
  // string in HE, proper EN parity. Server component → getTranslations.
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "events.list" });
  return (
    // MEH-2754: min-h-screen keeps the footer below the fold while this
    // fallback shows, so swapping in the page shifts nothing in view.
    <Suspense
      fallback={
        <div className="max-w-5xl mx-auto px-4 py-16 text-center text-fg-muted min-h-screen" data-testid="page-suspense-fallback">
          {t("loading_events")}
        </div>
      }
    >
      <EventsClient initialTab="events" />
    </Suspense>
  );
}
