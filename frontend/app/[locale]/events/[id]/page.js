import { notFound } from "next/navigation";
import * as Sentry from "@sentry/nextjs";
import { getTranslations } from "next-intl/server";
import EventDetailClient from "./EventDetailClient";
import { EventMetadataSchema } from "@/lib/schemas"; // MEH-1885: minimal metadata contract
import { API_URL } from "@/lib/env";
import { serverFetch } from "@/lib/server-fetch"; // MEH-977: timeout + transient-retry
import { buildAlternates, buildEntityTitle, OG_LOCALE } from "@/lib/i18n-seo";
import { buildEventJsonLd, serializeJsonLd } from "@/lib/seo"; // MEH-1062: Event + Breadcrumb JSON-LD
import { BRAND_NAME } from "@/lib/constants";

// MEH-476 PR 3b2: server wrapper for the originally-client /events/[id] page.
// Client Components cannot export generateMetadata; the actual UI lives in
// EventDetailClient.jsx and renders unchanged. Server-side fetch is for
// metadata only — the client still fetches independently for interactive
// state (loading skeleton, 404 page). If the metadata fetch fails or
// returns no event, fall back to seo.event.title_fallback so we still
// emit valid hreflang/canonical.
// MEH-1885: safeParse + Sentry + render the raw payload. Failure behaviour is
// decided in docs/audits/producer-detail-page-validation.md §6 and is not
// re-opened here: never throw, never notFound() (the MEH-1754 class).
// Inline rather than behind a helper, per the ticket's over-engineering guard.
const ROUTE = "/[locale]/events/[id]";

async function getEvent(id) {
  // MEH-2101: `null` means ONE thing — this event does not exist, and only a
  // 404 may become notFound(). Every other failure THROWS, so it reaches
  // app/[locale]/error.js and the response carries a 5xx.
  //
  // The old shape returned `null` for every `!res.ok` and swallowed the catch,
  // so a 404, a 500, a 429 and a timeout were indistinguishable — all four
  // rendered a soft 404 with no error status. That is not only a debugging
  // problem: a 404 tells Google the page is GONE and de-indexing starts, while
  // a 5xx says "try later". §6 of
  // docs/audits/producer-detail-page-validation.md used to forbid throwing
  // here; this ticket replaced that ruling with the three-way table.
  let res;
  try {
    res = await serverFetch(`${API_URL}/events/${id}`, {
      next: { revalidate: 60 },
    });
  } catch (err) {
    // Network failure or timeout — not a missing event. Report, then rethrow.
    Sentry.captureException(err, { extra: { route: ROUTE, id } });
    throw err;
  }

  if (res.status === 404) return null;

  if (!res.ok) {
    Sentry.captureMessage("SSR fetch failed", {
      level: "error",
      extra: { route: ROUTE, id, status: res.status },
    });
    const err = new Error(
      `event lookup failed: ${res.status} ${res.statusText} (id=${id})`
    );
    // Read by Sentry in app/[locale]/error.js; keeps id+status on the event.
    err.status = res.status;
    err.entityId = id;
    throw err;
  }

  const data = await res.json();
  const parsed = EventMetadataSchema.safeParse(data);
  if (!parsed.success) {
    Sentry.captureMessage("SSR payload failed schema validation", {
      level: "warning",
      extra: { route: ROUTE, id, issues: parsed.error.issues },
    });
  }
  // Raw, never `parsed.data` — EventMetadataSchema is minimal by design, so
  // the parsed object would drop every field it does not declare and
  // buildEventJsonLd would silently lose them (MEH-901 class). The parse is
  // a probe, not a transform.
  return data;
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
      // MEH-1060 (SEO-15): add og:url (self canonical) + siteName, mirroring the
      // producer-page precedent (lib/seo.js buildProducerMetadata).
      url: alternates.canonical,
      siteName: BRAND_NAME,
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
  // generateMetadata already 404s this case; belt-and-braces for the body.
  if (!event) notFound();
  return (
    <>
      <EventJsonLd event={event} locale={params.locale} />
      <EventDetailClient />
    </>
  );
}
