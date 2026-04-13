import ProducerDetail from "./ProducerDetail";

const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";
const SITE_URL = "https://mehamakor.online";

// Cloudinary OG image transform: 1200x630 crop, auto quality, < 300KB.
function ogImage(url) {
  if (!url || typeof url !== "string") return null;
  if (!url.includes("res.cloudinary.com")) return url;
  return url.replace("/upload/", "/upload/w_1200,h_630,c_fill,f_auto,q_auto/");
}

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

  const category = producer.categories?.[0]?.name || "";
  const description = producer.description
    ? producer.description.slice(0, 120)
    : `${producer.name} — בית עסק מקומי מ${producer.city}${category ? `. ${category}` : ""}`;

  const slug = producer.slug || `producer/${producer.id}`;
  const pageUrl = `${SITE_URL}/${slug}`;
  const img = ogImage(producer.images?.[0]);

  return {
    title: `${producer.name} | מהמקור`,
    description,
    openGraph: {
      title: producer.name,
      description,
      url: pageUrl,
      images: img
        ? [{ url: img, width: 1200, height: 630 }]
        : [],
      type: "website",
      locale: "he_IL",
      siteName: "מהמקור",
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
