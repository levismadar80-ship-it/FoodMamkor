const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

export default async function sitemap() {
  const staticPages = [
    { url: "https://mehamakor.co.il", lastModified: new Date(), priority: 1.0 },
    { url: "https://mehamakor.co.il/map", lastModified: new Date(), priority: 0.8 },
    { url: "https://mehamakor.co.il/register/producer", lastModified: new Date(), priority: 0.7 },
    { url: "https://mehamakor.co.il/terms", lastModified: new Date(), priority: 0.3 },
  ];

  let producerPages = [];
  try {
    const res = await fetch(`${API_URL}/producers`);
    if (res.ok) {
      const producers = await res.json();
      producerPages = producers.map((p) => ({
        url: `https://mehamakor.co.il/producer/${p.id}`,
        lastModified: new Date(),
        priority: 0.9,
      }));
    }
  } catch {
    // API not available during build — skip dynamic pages
  }

  return [...staticPages, ...producerPages];
}
