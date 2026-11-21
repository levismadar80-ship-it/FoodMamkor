// @ts-check
import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";
import EventDetailClient from "./EventDetailClient";
import { EventMetadataSchema } from "@/lib/schemas"; // MEH-1885: minimal metadata contract
import { fetchSsrEntity } from "@/lib/ssr-entity-fetch";
import { buildAlternates, buildEntityTitle, OG_LOCALE } from "@/lib/i18n-seo";
import { buildEventJsonLd, serializeJsonLd } from "@/lib/seo"; // MEH-1062: Event + Breadcrumb JSON-LD
import { BRAND_NAME } from "@/lib/constants";
import { siteOgImageUrl } from "@/lib/og-site-image";

// MEH-476 PR 3b2: server wrapper for the originally-client /events/[id] page.
// Client Components cannot export generateMetadata; the actual UI lives in
// EventDetailClient.jsx. MEH-3199: the server fetch now also feeds the body
// (`initialEvent`), so the first HTML carries the event; the client refetches
// with the viewer's token on top. If the metadata fetch fails or
// returns no event, fall back to seo.event.title_fallback so we still
// emit valid hreflang/canonical.
// MEH-1885: safeParse + Sentry + render the raw payload. Failure behaviour is
// decided in docs/audits/producer-detail-page-validation.md §6 and is not
// re-opened here: never throw, never notFound() (the MEH-1754 class).
// The fetch itself is shared since MEH-3465: lib/ssr-entity-fetch.js.
const ROUTE = "/[locale]/events/[id]";

function getEvent(id) {
  // MEH-3465: the three-way fetch (null = missing, throw = unavailable) and
  // its reporting live in lib/ssr-entity-fetch.js, shared by four pages.
  return fetchSsrEntity({ path: "/events", id, route: ROUTE, noun: "event", schema: EventMetadataSchema });
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
  // MEH-2101: pre-streaming, so this yields a REAL 404 status. A page-level
  // notFound() alone streams 200 + 404 UI, because the shared
  // app/[locale]/loading.js boundary flushes the shell first — bots would
  // keep crawling a soft 404. (MEH-1045 established this on the slug route.)
  if (!event) notFound();
  const entityName = event?.title;

  if (!entityName) {
    // MEH-476 followup: 404 paths should not be indexed even though they
    // still emit valid hreflang (so cross-locale 404s are linked).
    return {
      // MEH-2853: plain title — the layout template `%s | <brand>` adds the brand.
      title: t("title_fallback"),
      description: t("description_fallback"),
      robots: { index: false, follow: false },
      openGraph: {
        type: "article",
        locale: OG_LOCALE[locale],
        images: [siteOgImageUrl(locale)],
      },
      alternates,
    };
  }

  // MEH-3459: the same picture the card and the page cover show — the event's
  // photo, else its owner's first photo (MEH-2546), else the site image.
  const cover = event?.image_url || event?.owner_image_url;
  const shareImage = cover ? [cover] : [siteOgImageUrl(locale)];

  return {
    // MEH-2853: plain title — the layout template `%s | <brand>` adds the brand.
    title: entityName,
    description: event?.description || t("description_fallback"),
    openGraph: {
      type: "article",
      // MEH-1060 (SEO-15): add og:url (self canonical) + siteName, mirroring the
      // producer-page precedent (lib/seo.js buildProducerMetadata).
      url: alternates.canonical,
      siteName: BRAND_NAME,
      locale: OG_LOCALE[locale],
      images: shareImage,
    },
    // MEH-1062 (SEO-05): entity-specific Twitter/X card reusing the event's
    // own image + title instead of the layout's generic site card.
    twitter: {
      card: "summary_large_image",
      title: buildEntityTitle(entityName, locale),
      description: event?.description || t("description_fallback"),
      images: shareImage,
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
  // generateMetadata already 404s this case; belt-and-braces for the body.
  if (!event) notFound();
  return (
    <>
      <EventJsonLd event={event} locale={params.locale} />
      {/* key: a client-side move to another event starts from its own data. */}
      <EventDetailClient key={event.id ?? params.id} initialEvent={event} />
    </>
  );
}
