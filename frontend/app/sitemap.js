const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";
const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL || "https://mehamakor.online";

export default async function sitemap() {
  const staticPages = [
    { url: `${SITE_URL}`, lastModified: new Date(), priority: 1.0 },
    { url: `${SITE_URL}/map`, lastModified: new Date(), priority: 0.8 },
    { url: `${SITE_URL}/register/producer`, lastModified: new Date(), priority: 0.7 },
    { url: `${SITE_URL}/terms`, lastModified: new Date(), priority: 0.3 },
  ];

  let producerPages = [];
  try {
    const res = await fetch(`${API_URL}/producers`);
    if (res.ok) {
      const producers = await res.json();
      producerPages = producers.map((p) => ({
        url: `${SITE_URL}/producer/${p.id}`,
        lastModified: new Date(),
        priority: 0.9,
      }));
    }
  } catch {
    // API not available during build — skip dynamic pages
  }

  return [...staticPages, ...producerPages];
}
