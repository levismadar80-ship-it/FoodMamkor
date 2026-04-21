import Link from "next/link";
import MapClient from "./MapClient";

export const metadata = {
  title: "מפת בתי עסק",
  description:
    "מצאי בתי עסק מקומיים לאוכל בריא על המפה. סינון לפי עיר וקטגוריה, לחיצה על כרטיסייה מציגה את המיקום.",
  openGraph: {
    title: "מפת בתי עסק | מהמקור",
    description: "מצאי בתי עסק מקומיים לאוכל בריא על המפה.",
    type: "website",
    siteName: "מהמקור",
    locale: "he_IL",
    // Include the shared OG image — Next.js REPLACES (not merges) the
    // openGraph object when overridden, so we have to re-declare the
    // image here or social previews will have no image.
    images: ["/og-image.jpg"],
  },
  alternates: { canonical: "/map" },
};

const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

/**
 * MEH-151: Fetch a representative batch of producers server-side.
 * Result is cached for 1 hour — the full interactive map still fetches
 * live data on the client. This is SSR-only for Googlebot visibility.
 */
async function fetchProducersForSSR() {
  try {
    const res = await fetch(`${API_URL}/producers?limit=100&offset=0`, {
      next: { revalidate: 3600 },
    });
    if (!res.ok) return [];
    const data = await res.json();
    return Array.isArray(data) ? data : [];
  } catch {
    return [];
  }
}

export default async function MapPage() {
  const producers = await fetchProducersForSSR();

  return (
    <>
      <MapClient />

      {/*
        MEH-151 — SSR producer index for Googlebot.
        sr-only: position:absolute 1×1px, zero layout impact → no CLS.
        Googlebot indexes sr-only content that carries real semantic value
        (producer names + cities are legitimate navigation content).
        The interactive map already covers the viewport for JS users.
      */}
      <nav className="sr-only" aria-label="רשימת בתי עסק על המפה">
        <h2>בתי עסק על המפה</h2>
        <ul>
          {producers.map((p) => (
            <li key={p.id}>
              <Link href={`/producers/${p.slug}`}>
                {p.name}{p.city ? ` — ${p.city}` : ""}
              </Link>
            </li>
          ))}
        </ul>
      </nav>
    </>
  );
}
