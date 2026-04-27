import ProducerDetail from "./ProducerDetail";
import { buildProducerMetadata, buildJsonLd } from "@/lib/seo";

const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

async function getProducer(id) {
  try {
    const res = await fetch(`${API_URL}/producers/${id}`, { next: { revalidate: 60 } });
    if (!res.ok) return null;
    return res.json();
  } catch {
    return null;
  }
}

export async function generateMetadata({ params }) {
  const producer = await getProducer(params.id);
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

export default async function ProducerPage({ params }) {
  const producer = await getProducer(params.id);

  return (
    <>
      <ProducerJsonLd producer={producer} />
      <ProducerDetail />
    </>
  );
}
