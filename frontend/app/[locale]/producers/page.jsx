import { Suspense } from "react";
import { getTranslations } from "next-intl/server";
import ProducersClient from "@/components/ProducersClient";
import { SkeletonProducerGrid } from "@/components/Skeleton";
import { clampPage } from "@/lib/pagination";
import { API_URL, SITE_URL } from "@/lib/env";
import { buildAlternates, buildEntityTitle, OG_LOCALE } from "@/lib/i18n-seo";
import { BRAND_NAME } from "@/lib/constants";
import { RATING_SORT_THRESHOLD, isRatingSortEnabled } from "@/lib/rating-gate";

/**
 * Public paginated index (MEH-23). Server-rendered so crawlers can
 * walk the full catalog via /producers?page=N. Homepage stays curated
 * (hero, categories, recently viewed); this route is a pure list.
 *
 * 24 per page — 4 rows of 6 on desktop at the default grid width.
 * Client-side filter chips live in ProducersClient; they re-fetch
 * against the same /producers API without breaking SSR for crawlers.
 */

const PER_PAGE = 24;

// MEH-1876: the second of two stacked cache layers. This number is NOT
// independent — it composes with the backend's `_PUBLIC_CATALOG_CACHE`
// (backend/app/routers/producers.py:88) as
//     revalidate + s-maxage + stale-while-revalidate = worst-case staleness
// because each refetch may be served a response the edge already held. At
// 30/30/30 that is 90s, the bound MEH-1876 was opened to restore; the old
// 60 + 60 + 300 measured ~6 minutes on staging, during which a removed offer
// stayed publicly visible. Changing either side alone re-opens the gap.
const CATALOG_REVALIDATE_SECONDS = 30;

async function fetchPage(page) {
  const offset = (page - 1) * PER_PAGE;
  try {
    const res = await fetch(
      `${API_URL}/producers?limit=${PER_PAGE}&offset=${offset}`,
      { next: { revalidate: CATALOG_REVALIDATE_SECONDS } },
    );
    if (!res.ok) return { items: [], total: 0 };
    const total = Number(res.headers.get("x-total-count") || 0);
    const items = await res.json();
    return { items: Array.isArray(items) ? items : [], total };
  } catch {
    return { items: [], total: 0 };
  }
}

/**
 * MEH-1864: is a sort-by-rating control worth offering at all?
 *
 * One extra SSR request against the SAME endpoint, cached for
 * CATALOG_REVALIDATE_SECONDS alongside the page fetch (MEH-1876 moved this off
 * a hardcoded 60) — no new backend surface, no client-side cost. `?sort=rating`
 * orders reviewed businesses strictly above unreviewed ones, so counting the
 * reviewed rows inside a RATING_SORT_THRESHOLD-sized window answers
 * "are there >= threshold reviewed businesses?" exactly (see lib/rating-gate.js).
 *
 * Fail-closed: any network/parse error hides the rating sort rather than
 * offering an ordering we could not verify has data behind it.
 */
async function fetchRatingSortEnabled() {
  try {
    const res = await fetch(
      `${API_URL}/producers?sort=rating&limit=${RATING_SORT_THRESHOLD}&offset=0`,
      { next: { revalidate: CATALOG_REVALIDATE_SECONDS } },
    );
    if (!res.ok) return false;
    const items = await res.json();
    return isRatingSortEnabled(items);
  } catch {
    return false;
  }
}

// MEH-476 PR 3b2: per-locale title + per-page hreflang. Canonical uses
// buildAlternates for /producers root; ?page=N variants get their own
// canonical built by hand since query strings aren't part of urlForLocalePath's
// path argument convention.
export async function generateMetadata(props) {
  const params = await props.params;
  const { locale } = params;
  const searchParams = await props.searchParams;
  const page = clampPage(Number(searchParams?.page) || 1, 999);

  const t = await getTranslations({ locale, namespace: "producers" });
  const indexLabel = t("title.all");
  const title =
    page === 1
      ? indexLabel
      : locale === "he"
        ? `${indexLabel} — עמוד ${page}`
        : `${indexLabel} — page ${page}`;

  // Build alternates from /producers, then for paginated variants append
  // ?page=N to BOTH canonical and every languages URL so each EN/HE
  // page-N variant declares the matching EN/HE page-N variant as its
  // cross-locale alternate (instead of pointing to the page-1 root).
  const alternates = buildAlternates("/producers", locale);
  if (page > 1) {
    const suffix = `?page=${page}`;
    alternates.canonical = `${alternates.canonical}${suffix}`;
    alternates.languages = Object.fromEntries(
      Object.entries(alternates.languages).map(([k, v]) => [k, `${v}${suffix}`]),
    );
  }

  // og/twitter get no template from Next.js, so they carry the brand themselves.
  const socialTitle = buildEntityTitle(title, locale);

  const description =
    locale === "he"
      // MEH-2634: "דפדפי" (feminine singular) → "גלו", the plural voice the
      // rest of the site uses. Literal word swap as specified.
      ? "גלו בכל בתי העסק, מגדלים וחוות מקומיות על מהמקור."
      : "Browse all local food businesses, growers, and farms on Mehamakor.";

  return {
    // MEH-2853: plain title — the layout template `%s | <brand>` adds the brand.
    title,
    description,
    // MEH-740: per-page openGraph + self og:url (was inheriting layout root).
    // url reuses alternates.canonical so paginated ?page=N variants stay self.
    openGraph: {
      title: socialTitle,
      description,
      type: "website",
      url: alternates.canonical,
      siteName: BRAND_NAME,
      locale: OG_LOCALE[locale],
      images: ["/og-image.png"],
    },
    // MEH-1060 (SEO-10): explicit Twitter card mirroring og (was inheriting the
    // layout's generic site card).
    twitter: {
      card: "summary_large_image",
      title: socialTitle,
      description,
      images: ["/og-image.png"],
    },
    alternates,
  };
}

export default async function ProducersIndexPage(props) {
  const searchParams = await props.searchParams;
  const requestedPage = Math.max(1, Math.floor(Number(searchParams?.page) || 1));
  const [{ items, total }, ratingSortEnabled] = await Promise.all([
    fetchPage(requestedPage),
    fetchRatingSortEnabled(),
  ]);
  const totalPages = Math.max(1, Math.ceil(total / PER_PAGE));
  const page = clampPage(requestedPage, totalPages);

  return (
    <div className="max-w-7xl mx-auto px-4 py-8">
      <Suspense fallback={<SkeletonProducerGrid count={8} />}>
        <ProducersClient
          initialItems={items}
          initialTotal={total}
          initialPage={page}
          totalPages={totalPages}
          perPage={PER_PAGE}
          ratingSortEnabled={ratingSortEnabled}
        />
      </Suspense>
    </div>
  );
}
