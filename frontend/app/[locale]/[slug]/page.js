import { notFound } from "next/navigation";
import ProducerDetail from "@/app/[locale]/producer/[id]/ProducerDetail";
import { buildProducerMetadata, buildJsonLd } from "@/lib/seo";
import { API_URL } from "@/lib/env";
import { buildAlternates, buildEntityTitle, OG_LOCALE } from "@/lib/i18n-seo";

// Reserved root paths that must NOT be treated as a slug.
// Next.js static routes already win at routing, but this guards
// fetch attempts in case of edge cases / direct calls.
const RESERVED = new Set([
  "about", "admin", "favorites", "login", "map",
  "p", "producer", "rate", "register", "settings", "terms",
  "upgrade", "messages", "discover", "publish",
  "api", "_next", "favicon.ico", "manifest.json",
  "robots.txt", "sitemap.xml", "sw.js",
]);

async function getProducerBySlug(slug) {
  if (!slug || RESERVED.has(slug.toLowerCase())) return null;
  try {
    const res = await fetch(`${API_URL}/producers/by-slug/${encodeURIComponent(slug)}`, {
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
  const producer = await getProducerBySlug(slug);
  const path = `/${slug}`;
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

function ProducerJsonLd({ producer }) {
  const jsonLd = buildJsonLd(producer);
  if (!jsonLd) return null;
  return (
    <script
      type="application/ld+json"
      dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
    />
  );
}

export default async function ProducerSlugPage(props) {
  const params = await props.params;
  const producer = await getProducerBySlug(params.slug);
  if (!producer) notFound();

  return (
    <>
      <ProducerJsonLd producer={producer} />
      <ProducerDetail
        initialProducer={producer}
        fetchPath={`/producers/by-slug/${encodeURIComponent(params.slug)}`}
      />
    </>
  );
}
