import { notFound } from "next/navigation";
import ProducerDetail from "@/app/producer/[id]/ProducerDetail";
import { buildProducerMetadata, buildJsonLd } from "@/lib/seo";

const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

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

export async function generateMetadata({ params }) {
  const producer = await getProducerBySlug(params.slug);
  return buildProducerMetadata(producer);
}

function ProducerJsonLd({ producer }) {
  const jsonLd = buildJsonLd(producer);
  if (!jsonLd) return null;
  return (
    <script
      type="application/ld+json"
      // eslint-disable-next-line react/no-danger -- ld+json schema; producer text fields sanitized server-side (MEH-329)
      dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
    />
  );
}

export default async function ProducerSlugPage({ params }) {
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
