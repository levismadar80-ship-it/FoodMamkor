import { notFound } from "next/navigation";
import ProducerDetail from "./ProducerDetail";
import { buildProducerMetadata, buildJsonLd, serializeJsonLd, buildPageUrl, SITE_URL } from "@/lib/seo";
import { API_URL } from "@/lib/env";
import { serverFetch } from "@/lib/server-fetch"; // MEH-977: timeout + transient-retry
import { buildAlternates, buildEntityTitle, OG_LOCALE } from "@/lib/i18n-seo";

async function getProducer(id) {
  try {
    const res = await serverFetch(`${API_URL}/producers/${id}`, { next: { revalidate: 60 } });
    if (!res.ok) return null;
    return res.json();
  } catch {
    return null;
  }
}

// MEH-476 PR 3b2: per-page hreflang for producer-by-id route. D1 title
// format ({name} | brand) applied per-locale.
// MEH-1060 (SEO-01): when the producer has a slug, canonical + hreflang must
// point to the slug URL — matching the JSON-LD @id/url (buildPageUrl) and the
// sitemap entry, so the three SEO signals agree instead of self-canonicaling
// to /producer/{id}. buildPageUrl is the single owner of the slug-vs-id
// preference; strip SITE_URL to get the relative path buildAlternates expects.
// MEH-1398: a missing producer hard-404s via notFound() (real HTTP 404, no
// metadata) instead of returning noindex+hreflang for the /producer/{id} path.
export async function generateMetadata(props) {
  const params = await props.params;
  const { id, locale } = params;
  const producer = await getProducer(id);

  // MEH-1398: hard-404 for matched-route misses. A missing producer now throws
  // notFound() from generateMetadata (pre-streaming) → a REAL HTTP 404, closing
  // the soft-404 (200) measured in the MEH-918 spike (PR #1995). Drops the
  // former MEH-476 hreflang-on-404 metadata — the approved trade-off (Sapir,
  // 21/07): hreflang belongs on indexed pages, not 404s; these misses already
  // carried robots:noindex. hreflang on VALID pages (below) is unchanged.
  if (!producer) notFound();

  const path = buildPageUrl(producer).replace(SITE_URL, "");
  const alternates = buildAlternates(path, locale);

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

export default async function ProducerPage(props) {
  const params = await props.params;
  const producer = await getProducer(params.id);

  return (
    <>
      <ProducerJsonLd producer={producer} locale={params.locale} />
      <ProducerDetail />
    </>
  );
}
