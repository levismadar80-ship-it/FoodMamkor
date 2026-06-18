import { Suspense } from "react";
import { getTranslations } from "next-intl/server";
import EventsClient from "./EventsClient";
import { BRAND_NAME } from "@/lib/constants";
import { buildAlternates, urlForLocalePath, OG_LOCALE } from "@/lib/i18n-seo";

// MEH-739: per-locale hreflang + self canonical via buildAlternates (was a
// hand-built single-canonical entry with no hreflang languages map).
// MEH-475 Wave 6: metadata strings → seo.events.* (was hardcoded HE). Refs MEH-476.
export async function generateMetadata({ params }) {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "seo.events" });
  return {
    // title.absolute — key carries the brand suffix per locale (mirrors
    // seo.about / seo.map), so the layout `%s | brand` template doesn't
    // append a second (Hebrew) brand on /en.
    title: { absolute: t("title") },
    description: t("description"),
    openGraph: {
      title: t("og_title"),
      description: t("og_description"),
      type: "website",
      // MEH-740: per-page og:url = self (mirrors #916 terms/privacy).
      url: urlForLocalePath("/events", locale),
      siteName: BRAND_NAME,
      locale: OG_LOCALE[locale],
      // Next.js replaces openGraph object on override — re-declare image.
      images: ["/og-image.png"],
    },
    alternates: buildAlternates("/events", locale),
  };
}

// EventsClient uses useSearchParams() to keep the ?tab=experiences
// deep-link in the URL. Next.js 14 requires a Suspense boundary
// around any component that reads search params in the App Router.
export default async function EventsPage({ params }) {
  // MEH-858 F2: Suspense fallback was a hardcoded HE string (leaked Hebrew on
  // /en). Wire the existing events.list.loading_events key — same rendered
  // string in HE, proper EN parity. Server component → getTranslations.
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "events.list" });
  return (
    <Suspense
      fallback={
        <div className="max-w-5xl mx-auto px-4 py-16 text-center text-fg-muted">
          {t("loading_events")}
        </div>
      }
    >
      <EventsClient />
    </Suspense>
  );
}
