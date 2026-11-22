// @ts-check
import { notFound } from "next/navigation";
import ProducerDetail from "./ProducerDetail";
import { buildProducerMetadata, buildJsonLd, serializeJsonLd, buildPageUrl, SITE_URL } from "@/lib/seo";
import { buildAlternates, buildEntityTitle, OG_LOCALE } from "@/lib/i18n-seo";
import { ProducerDetailSchema } from "@/lib/schemas"; // MEH-1752: the detail contract
import { fetchSsrEntity } from "@/lib/ssr-entity-fetch";

const ROUTE = "/[locale]/producer/[id]";

// MEH-1885: validate the payload, report the mismatch, render anyway.
// Decision locked in docs/audits/producer-detail-page-validation.md §6 —
// `.parse()` would turn a silent SEO defect into an availability incident, and
// `notFound()` is forbidden here (the MEH-1754 indexing-risk class). Neither is
// re-litigated; this is the third row of that table.
//
// Reporting was inline at all four SSR sites (MEH-1885's "four call sites,
// one pattern, inline"); the four identical copies became
// lib/ssr-entity-fetch.js in MEH-3465. Call shape from lib/api.js:141.
// 404 / 422 are ordinary outcomes (deleted producer, crawler on a stale URL)
// and return null without a report; every other non-ok reports and throws
// (MEH-2101's three-way table, which replaced §6's "never throw").
function getProducer(id) {
  // MEH-3465: the three-way fetch (null = missing, throw = unavailable) and
  // its reporting live in lib/ssr-entity-fetch.js, shared by four pages.
  return fetchSsrEntity({ path: "/producers", id, route: ROUTE, noun: "producer", schema: ProducerDetailSchema });
}

// MEH-476 PR 3b2: per-page hreflang for producer-by-id route. D1 title
// format ({name} | brand) applied per-locale.
// MEH-1060 (SEO-01): when the producer has a slug, canonical + hreflang must
// point to the slug URL — matching the JSON-LD @id/url (buildPageUrl) and the
// sitemap entry, so the three SEO signals agree instead of self-canonicaling
// to /producer/{id}. buildPageUrl is the single owner of the slug-vs-id
// preference; strip SITE_URL to get the relative path buildAlternates expects.
// 404 (no producer) keeps the /producer/{id} path.
export async function generateMetadata(props) {
  const params = await props.params;
  const { id, locale } = params;
  const producer = await getProducer(id);
  // MEH-2101 / MEH-3024: this renders the not-found UI, but it does NOT set
  // the status — in Next 16 generateMetadata streams too, so it measured 200
  // on production (13/11). The real 404 is minted by middleware.js (the
  // /producer/<id> existence check, MEH-3024) before the page runs.
  if (!producer) notFound();

  const path = producer ? buildPageUrl(producer).replace(SITE_URL, "") : `/producer/${id}`;
  const alternates = buildAlternates(path, locale);

  if (!producer) {
    return {
      // title.absolute prevents layout's `%s | brand` template double-suffix.
      title: { absolute: buildEntityTitle(null, locale) },
      // MEH-476 followup: 404 paths should not be indexed even though
      // they still emit valid hreflang (so cross-locale 404s are linked).
      robots: { index: false, follow: false },
      alternates,
    };
  }

  const base = buildProducerMetadata(producer, locale);
  return {
    ...base,
    // MEH-2853: plain title — the layout template `%s | <brand>` adds the brand.
    title: producer.name,
    openGraph: {
      ...base.openGraph,
      locale: OG_LOCALE[locale],
    },
    alternates,
  };
}

function ProducerJsonLd({ producer, locale }) {
  const jsonLd = buildJsonLd(producer, locale);
  if (!jsonLd) return null;
  return (
    <script
      type="application/ld+json"
      dangerouslySetInnerHTML={{ __html: serializeJsonLd(jsonLd) }}
    />
  );
}

export default async function ProducerPage(props) {
  const params = await props.params;
  const producer = await getProducer(params.id);
  // generateMetadata already 404s this case; belt-and-braces for the body.
  if (!producer) notFound();

  return (
    <>
      <ProducerJsonLd producer={producer} locale={params.locale} />
      <ProducerDetail />
    </>
  );
}
