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

async function getProducerBySlug(slug) {
  if (!isSlugShaped(slug)) return null;
  try {
    const res = await serverFetch(`${API_URL}/producers/by-slug/${encodeURIComponent(slug)}`, {
      next: { revalidate: 60 },
    });
    if (!res.ok) return null;
    return res.json();
  } catch {
    return null;
  }
}

// MEH-476 PR 3b2: per-page hreflang for producer alias route. D1 title
// format ({name} | brand) applied per-locale; canonical + languages from
// buildAlternates. MEH-1398: a missing producer hard-404s via notFound()
// (real HTTP 404, no metadata) instead of returning noindex+hreflang.
export async function generateMetadata(props) {
  const params = await props.params;
  const { slug, locale } = params;
  // MEH-1045: notFound() here (pre-streaming) returns a REAL 404 status.
  // A page-level notFound() alone streams a 200 + 404 UI because the
  // [locale] loading.js boundary flushes the shell first — bots would keep
  // crawling a soft-404. This scanner-shape guard fast-404s before any fetch.
  if (!isSlugShaped(slug)) notFound();
  const producer = await getProducerBySlug(slug);
  const path = `/${slug}`;
  const alternates = buildAlternates(path, locale);

  // MEH-1398: hard-404 for matched-route misses. A slug-shaped-but-missing
  // producer now throws notFound() from generateMetadata (pre-streaming, same
  // mechanism as the scanner guard above) → a REAL HTTP 404, closing the
  // soft-404 (200) measured in the MEH-918 spike (PR #1995). This intentionally
  // drops the former MEH-476 hreflang-on-404 metadata for the miss — the
  // approved trade-off (Sapir, 21/07): hreflang belongs on indexed content
  // pages, not on 404s, and these misses already carried robots:noindex so were
  // never indexed. hreflang on VALID pages (below) is unchanged.
  if (!producer) notFound();

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
