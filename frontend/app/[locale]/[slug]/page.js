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
      <ProducerDetail
        initialProducer={producer}
        fetchPath={`/producers/by-slug/${encodeURIComponent(params.slug)}`}
      />
    </>
  );
}
