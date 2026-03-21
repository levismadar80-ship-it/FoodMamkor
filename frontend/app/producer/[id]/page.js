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
    return { title: "יצרן לא נמצא | מהמקור" };
  }

  const categories = producer.categories?.map((c) => c.name).join(", ") || "";
  const description = producer.description
    ? producer.description.slice(0, 155)
    : `${producer.name} — יצרן אוכל מקומי מ${producer.city}${categories ? `. ${categories}` : ""}`;

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

export default function ProducerPage() {
  return <ProducerDetail />;
}
