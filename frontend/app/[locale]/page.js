/**
 * Module:   page (home)
 * Purpose:  Server shell for the homepage — fetches the first-paint producer
 *           feed + categories on the server so the first HTML byte already
 *           carries producer cards, then hands them to HomeClient.
 * Touches:  GET /producers and GET /categories via serverFetch (revalidate 60).
 * Does NOT: own any interactivity — geo, chips, onboarding, friday strip,
 *           recently-viewed and every effect live in home/HomeClient.jsx.
 * Related:  app/[locale]/home/HomeClient.jsx (the moved client body),
 *           lib/use-home-page.js (accepts the initialData below),
 *           app/[locale]/producers/page.jsx:23 (the serverFetch pattern reused).
 * History:  MEH-1832 chunk 1 (creation — split out of the client page).
 */
import HomeClient from "@/app/[locale]/home/HomeClient";
import { serverFetch } from "@/lib/server-fetch";
import { API_URL } from "@/lib/env";
import { buildHomeJsonLd, serializeJsonLd } from "@/lib/seo";

// MEH-1832: the server renders the FIRST VIEWPORT only — PAGE_SIZE rows, the
// same count use-home-page starts at. It deliberately does NOT try to honour a
// restored `home_visible_count`: that value lives in sessionStorage, which the
// server cannot read, so rendering it here would make the server HTML and the
// client's first render disagree. The restore runs in an effect (after
// hydration) and expands the grid then — an ordinary update, not a mismatch.
const FIRST_PAINT_LIMIT = 8;

/**
 * Both fetches fail soft to `null`, which is the signal use-home-page reads as
 * "no server data — fetch it yourself". A backend blip therefore degrades to
 * exactly today's client-fetched behaviour rather than an error page.
 */
async function fetchFirstPaint() {
  const get = async (path) => {
    try {
      const res = await serverFetch(`${API_URL}${path}`, { next: { revalidate: 60 } });
      if (!res.ok) return null;
      const json = await res.json();
      return Array.isArray(json) ? json : null;
    } catch {
      return null;
    }
  };
  const [producers, categories] = await Promise.all([
    get(`/producers?limit=${FIRST_PAINT_LIMIT}`),
    get("/categories"),
  ]);
  return { producers, categories };
}

export default async function HomePage({ params }) {
  const { locale } = await params;
  const { producers, categories } = await fetchFirstPaint();

  return (
    <>
      {/* MEH-804: homepage Organization + WebSite (SearchAction) JSON-LD.
          MEH-1832: moved here from the client body. It was already emitted in
          the server HTML (a "use client" component is still server-rendered on
          first request), so this is a relocation to its proper owner, not a
          new capability — measured before the move: 1 ld+json block present. */}
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: serializeJsonLd(buildHomeJsonLd(locale)) }}
      />
      <HomeClient initialProducers={producers} initialCategories={categories} />
    </>
  );
}
