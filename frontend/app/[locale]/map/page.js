import Link from "next/link";
import { getTranslations } from "next-intl/server";

import MapClient from "./MapClient";
import { API_URL } from "@/lib/env";
import { BRAND_NAME } from "@/lib/constants";
import { buildAlternates, OG_LOCALE } from "@/lib/i18n-seo";

// MEH-476 PR 3b2: was static metadata const with hardcoded HE. Now per-locale
// via seo.map.* keys + buildAlternates for hreflang/canonical.
export async function generateMetadata({ params }) {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "seo.map" });
  return {
    // title.absolute prevents layout's `%s | ${BRAND_NAME}` template appending
    // (seo.map.title already includes the brand suffix).
    title: { absolute: t("title") },
    description: t("description"),
    openGraph: {
      title: t("og_title"),
      description: t("og_description"),
      type: "website",
      siteName: BRAND_NAME,
      locale: OG_LOCALE[locale],
      // Include the shared OG image — Next.js REPLACES (not merges) the
      // openGraph object when overridden, so we have to re-declare the
      // image here or social previews will have no image.
      images: ["/og-image.png"],
    },
    alternates: buildAlternates("/map", locale),
  };
}

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
  // MEH-473: page-level metadata translation deferred to Wave 6 (SEO).
  // sr-only nav strings are functional UI, translated here.
  const t = await getTranslations();
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
      <nav className="sr-only" aria-label={t("map.page.aria.business_list")}>
        <h2>{t("map.page.heading_ssr")}</h2>
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
