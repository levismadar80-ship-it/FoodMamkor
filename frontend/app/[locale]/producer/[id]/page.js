import ProducerDetail from "./ProducerDetail";
import { buildProducerMetadata, buildJsonLd, serializeJsonLd } from "@/lib/seo";
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
// format ({name} | brand) applied per-locale. Canonical points to /producer/{id}
// (this route's path); slug-based /{slug} has its own canonical.
export async function generateMetadata(props) {
  const params = await props.params;
  const { id, locale } = params;
  const producer = await getProducer(id);
  const path = `/producer/${id}`;
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
