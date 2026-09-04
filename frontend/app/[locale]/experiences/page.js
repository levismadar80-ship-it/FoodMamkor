import { Suspense } from "react";
import { getTranslations } from "next-intl/server";
import EventsClient from "../events/EventsClient";
import { BRAND_NAME } from "@/lib/constants";
import { buildAlternates, urlForLocalePath, OG_LOCALE } from "@/lib/i18n-seo";

// MEH-740: static metadata → generateMetadata so og:url can be per-locale self.
// MEH-475 Wave 6: metadata strings → seo.experiences.* (was hardcoded HE) +
// hreflang leftover fixed (canonical-only → buildAlternates). Refs MEH-476.
export async function generateMetadata({ params }) {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "seo.experiences" });
  return {
    // title.absolute — key carries the brand suffix per locale (mirrors
    // seo.about), so the layout `%s | brand` template doesn't double-append.
    title: { absolute: t("title") },
    description: t("description"),
    openGraph: {
      title: t("og_title"),
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
    <Suspense
      fallback={
        <div className="max-w-5xl mx-auto px-4 py-16 text-center text-fg-muted">
          {t("loading_experiences")}
        </div>
      }
    >
      <EventsClient initialTab="experiences" />
    </Suspense>
  );
}
