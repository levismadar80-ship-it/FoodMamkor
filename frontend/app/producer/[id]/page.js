import ProducerDetail from "./ProducerDetail";

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
  if (!producer) {
    return { title: "בית עסק לא נמצא | מהמקור" };
  }

  const categories = producer.categories?.map((c) => c.name).join(", ") || "";
  const description = producer.description
    ? producer.description.slice(0, 155)
    : `${producer.name} — בית עסק מקומי מ${producer.city}${categories ? `. ${categories}` : ""}`;

  return {
    title: `${producer.name} | מהמקור`,
    description,
    openGraph: {
      title: `${producer.name} | מהמקור`,
      description,
      url: `https://mehamakor.co.il/producer/${producer.id}`,
      images: producer.images?.length > 0 ? [{ url: producer.images[0] }] : [],
      type: "website",
      locale: "he_IL",
    },
  };
}

function ProducerJsonLd({ producer }) {
  if (!producer) return null;

  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "LocalBusiness",
    name: producer.name,
    description: producer.description || "",
    address: {
      "@type": "PostalAddress",
      addressLocality: producer.city || "",
      addressCountry: "IL",
    },
    ...(producer.lat && producer.lng && {
      geo: {
        "@type": "GeoCoordinates",
        latitude: producer.lat,
        longitude: producer.lng,
      },
    }),
    ...(producer.phone && { telephone: producer.phone }),
    ...(producer.website && {
      url: producer.website.startsWith("http") ? producer.website : `https://${producer.website}`,
    }),
    ...(producer.images?.length > 0 && { image: producer.images[0] }),
  };

  return (
    <script
      type="application/ld+json"
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
