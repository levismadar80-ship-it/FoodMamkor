import { Suspense } from "react";
import { getTranslations } from "next-intl/server";
import EventsClient from "../events/EventsClient";
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

// MEH-740: static metadata → generateMetadata so og:url can be per-locale self.
// MEH-475 Wave 6: metadata strings → seo.experiences.* (was hardcoded HE) +
// hreflang leftover fixed (canonical-only → buildAlternates). Refs MEH-476.
export async function generateMetadata({ params }) {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "seo.experiences" });
  // MEH-2369: a hub that is KNOWN to be empty is noindex (an empty listing
  // reads to Google as a soft 404); an unknown count stays indexable.
  const robots = hubRobots(await getHubCount("experiences"));
  return {
    ...(robots ? { robots } : {}),
    // MEH-2853: plain title — the layout template `%s | <brand>` adds the brand.
    title: t("title"),
    description: t("description"),
    openGraph: {
      title: buildEntityTitle(t("og_title"), locale),
      description: t("og_description"),
      type: "website",
      url: urlForLocalePath("/experiences", locale),
      siteName: BRAND_NAME,
      locale: OG_LOCALE[locale],
      images: ["/og-image.png"],
    },
    alternates: buildAlternates("/experiences", locale),
  };
}

// MEH-2245: /experiences is the experiences TAB of the events hub — the same
// EventsClient as /events, mounted on the other tab. The duplicate client
// this route used to own (own hero, same chips, cross-link back to the hub)
// is gone; this route keeps its own metadata + sitemap entry. Suspense mirrors
// events/page.js (EventsClient reads ?city= / ?category= via useSearchParams).
export default async function ExperiencesPage({ params }) {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "events.list" });
  return (
    // MEH-2754: min-h-screen keeps the footer below the fold while this
    // fallback shows, so swapping in the page shifts nothing in view.
    <Suspense
      fallback={
        <div className="max-w-5xl mx-auto px-4 py-16 text-center text-fg-muted min-h-screen" data-testid="page-suspense-fallback">
          {t("loading_experiences")}
        </div>
      }
    >
      <EventsClient initialTab="experiences" />
    </Suspense>
  );
}
