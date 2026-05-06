import ProducerDetail from "./ProducerDetail";
import { buildProducerMetadata, buildJsonLd } from "@/lib/seo";
import { API_URL } from "@/lib/env";

async function getProducer(id) {
  try {
    const res = await fetch(`${API_URL}/producers/${id}`, { next: { revalidate: 60 } });
    if (!res.ok) return null;
    return res.json();
  } catch {
    return null;
  }
}

export async function generateMetadata(props) {
  const params = await props.params;
  const producer = await getProducer(params.id);
  return buildProducerMetadata(producer);
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

export default async function ProducerPage(props) {
  const params = await props.params;
  const producer = await getProducer(params.id);

  return (
    <>
      <ProducerJsonLd producer={producer} />
      <ProducerDetail />
    </>
  );
}
