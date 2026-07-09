import { getTranslations } from "next-intl/server";
import EventDetailClient from "./EventDetailClient";
import { API_URL } from "@/lib/env";
import { serverFetch } from "@/lib/server-fetch"; // MEH-977: timeout + transient-retry
import { buildAlternates, buildEntityTitle, OG_LOCALE } from "@/lib/i18n-seo";
import { buildEventJsonLd, serializeJsonLd } from "@/lib/seo"; // MEH-1062: Event + Breadcrumb JSON-LD

// MEH-476 PR 3b2: server wrapper for the originally-client /events/[id] page.
// Client Components cannot export generateMetadata; the actual UI lives in
// EventDetailClient.jsx and renders unchanged. Server-side fetch is for
// metadata only — the client still fetches independently for interactive
// state (loading skeleton, 404 page). If the metadata fetch fails or
// returns no event, fall back to seo.event.title_fallback so we still
// emit valid hreflang/canonical.
async function getEvent(id) {
  try {
    const res = await serverFetch(`${API_URL}/events/${id}`, {
      next: { revalidate: 60 },
    });
    if (!res.ok) return null;
    return res.json();
  } catch {
    return null;
  }
}

export async function generateMetadata(props) {
  const params = await props.params;
  const { id, locale } = params;
  const [event, t] = await Promise.all([
    getEvent(id),
    getTranslations({ locale, namespace: "seo.event" }),
  ]);
  const path = `/events/${id}`;
  const alternates = buildAlternates(path, locale);
  const entityName = event?.title;

  if (!entityName) {
    // MEH-476 followup: 404 paths should not be indexed even though they
    // still emit valid hreflang (so cross-locale 404s are linked).
    return {
      title: { absolute: t("title_fallback") },
      description: t("description_fallback"),
      robots: { index: false, follow: false },
      openGraph: {
        type: "article",
        locale: OG_LOCALE[locale],
        images: ["/og-image.png"],
      },
      alternates,
    };
  }

  return {
    // title.absolute — buildEntityTitle already includes brand.
    title: { absolute: buildEntityTitle(entityName, locale) },
    description: event?.description || t("description_fallback"),
    openGraph: {
      type: "article",
      locale: OG_LOCALE[locale],
      images: event?.image_url ? [event.image_url] : ["/og-image.png"],
    },
    // MEH-1062 (SEO-05): entity-specific Twitter/X card reusing the event's
    // own image + title instead of the layout's generic site card.
    twitter: {
      card: "summary_large_image",
      title: buildEntityTitle(entityName, locale),
      description: event?.description || t("description_fallback"),
      images: event?.image_url ? [event.image_url] : ["/og-image.png"],
    },
    alternates,
  };
}

// MEH-1062: server-rendered Event + BreadcrumbList JSON-LD. The event is
// fetched here for the schema (the client still fetches independently for its
// interactive state) — same double-fetch pattern as the producer route
// (producer/[id]/page.js:61-70); revalidate:60 caches within the window.
function EventJsonLd({ event, locale }) {
  const jsonLd = buildEventJsonLd(event, locale);
  if (!jsonLd) return null;
  return (
    <script
      type="application/ld+json"
      dangerouslySetInnerHTML={{ __html: serializeJsonLd(jsonLd) }}
    />
  );
}

export default async function EventDetailPage(props) {
  const params = await props.params;
  const event = await getEvent(params.id);
  return (
    <>
      <EventJsonLd event={event} locale={params.locale} />
      <EventDetailClient />
    </>
  );
}
