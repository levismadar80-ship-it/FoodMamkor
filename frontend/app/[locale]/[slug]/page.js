import { notFound } from "next/navigation";
import ProducerDetail from "@/app/[locale]/producer/[id]/ProducerDetail";
import { buildProducerMetadata, buildJsonLd, serializeJsonLd } from "@/lib/seo";
import { API_URL } from "@/lib/env";
import { serverFetch } from "@/lib/server-fetch"; // MEH-977: timeout + transient-retry
import { buildAlternates, buildEntityTitle, OG_LOCALE } from "@/lib/i18n-seo";
// MEH-1119: isSlugShaped (+ its RESERVED / SLUG_SHAPE / SCANNER_PREFIXES) moved
// to lib/slug.js — a non-Page `export` in a page.js file breaks the Next Page
// type contract under `next build --webpack`. The test imports it from there.
import { isSlugShaped } from "@/lib/slug";

// MEH-1754: `null` means ONE thing — this business does not exist. Every other
// failure throws, so it reaches app/[locale]/error.js (Hebrew copy + retry +
// Sentry) and the response carries a 5xx.
//
// The old shape returned `null` for `!res.ok` and swallowed the catch, so a 404,
// a 500, a 429 and an 8s timeout were indistinguishable — all four rendered a
// silent 404 with no stack, no Sentry event and no error status. That is not
// only a debugging problem: a 404 tells Google the page is GONE and it starts
// de-indexing, while a 5xx says "try later". A two-hour backend wobble could
// therefore cost business pages their search presence for weeks, and Next
// caches the notFound() result on top (vercel/next.js#79497).
//
// Do NOT reintroduce a bare `catch` here. Swallowing is what made the 28/07
// incident invisible for four hours.
async function getProducerBySlug(slug) {
  if (!isSlugShaped(slug)) return null;
  const url = `${API_URL}/producers/by-slug/${encodeURIComponent(slug)}`;
  const res = await serverFetch(url, { next: { revalidate: 60 } });
  // The one genuine not-found. Only a 404 may become notFound().
  if (res.status === 404) return null;
  if (!res.ok) {
    const err = new Error(
      `producer by-slug lookup failed: ${res.status} ${res.statusText} (slug=${slug})`
    );
    // Read by Sentry in app/[locale]/error.js; keeps slug+status on the event.
    err.status = res.status;
    err.slug = slug;
    throw err;
  }
  return res.json();
}

// MEH-476 PR 3b2: per-page hreflang for producer alias route. D1 title
// format ({name} | brand) applied per-locale; canonical + languages from
// buildAlternates. 404 returns notFound metadata with self-canonical so
// crawlers don't ingest a partial signal.
export async function generateMetadata(props) {
  const params = await props.params;
  const { slug, locale } = params;
  // MEH-1045: notFound() here (pre-streaming) returns a REAL 404 status.
  // A page-level notFound() alone streams a 200 + 404 UI because the
  // [locale] loading.js boundary flushes the shell first — bots would keep
  // crawling a soft-404. Only scanner-shaped paths get the hard 404;
  // slug-shaped misses keep the MEH-476 hreflang-carrying 404 metadata.
  if (!isSlugShaped(slug)) notFound();
  const producer = await getProducerBySlug(slug);
  const path = `/${slug}`;
  const alternates = buildAlternates(path, locale);

  if (!producer) {
    // MEH-641: titleless entity treated as 404; SEO-worthless by design — see ticket for rationale.
    return {
      // title.absolute prevents layout's `%s | brand` template double-suffix.
      title: { absolute: buildEntityTitle(null, locale) },
      // MEH-476 followup: 404 paths should not be indexed even though
      // they still emit valid hreflang (so cross-locale 404s are linked).
      robots: { index: false, follow: false },
      alternates,
    };
  }

  const base = buildProducerMetadata(producer);
  return {
    ...base,
    title: { absolute: buildEntityTitle(producer.name, locale) },
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

export default async function ProducerSlugPage(props) {
  const params = await props.params;
  const producer = await getProducerBySlug(params.slug);
  if (!producer) notFound();

  return (
    <>
      <ProducerJsonLd producer={producer} locale={params.locale} />
      {/*
        MEH-1151: `key={params.slug}` forces a full remount on slug→slug
        navigation within this same [slug] route segment. Without it, React
        reuses the ProducerDetail instance, so useProducerData's
        `useState(initialProducer)` (seed-once) keeps the previous producer
        and its fetch effect short-circuits on `if (initialProducer) return`
        — the page stays stuck on business A while the URL is already B
        (e.g. via a "similar producers" card). Remount re-seeds state fresh.
      */}
      <ProducerDetail
        key={params.slug}
        initialProducer={producer}
        fetchPath={`/producers/by-slug/${encodeURIComponent(params.slug)}`}
      />
    </>
  );
}
