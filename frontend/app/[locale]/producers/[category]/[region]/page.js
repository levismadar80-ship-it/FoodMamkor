/**
 * Module:   producers-category-region-landing
 * Purpose:  /producers/[category]/[region] — a landing page per category x
 *           region cell (MEH-2790, child B of MEH-1204). Breadcrumb → H1 →
 *           count line → SSR'd grid → sibling chips → back link.
 * Touches:  nothing — read-only against GET /producers and GET /categories.
 * Does NOT: own the threshold or the path shape (lib/region-pages.js), the
 *           region → cities mapping (data/regions.js), or the category slugs
 *           (the backend mints those). No ItemList JSON-LD (child D) and no
 *           editorial intro (child C) — deliberately out of scope here.
 * Related:  app/[locale]/producers/diet/[dietSlug]/page.js — the template this
 *           mirrors, including its failure semantics; MEH-1754 + MEH-1045 (a
 *           404 must mean "genuinely absent", and must be pre-streaming).
 * History:  MEH-2790 (creation, 2026-11-07).
 */
import { notFound } from "next/navigation";
import { getTranslations, setRequestLocale } from "next-intl/server";

import { Link } from "@/i18n/navigation";
import ProducerCard from "@/components/ProducerCard";
import Breadcrumb from "@/components/Breadcrumb";
import { API_URL } from "@/lib/env";
import { serverFetch } from "@/lib/server-fetch"; // MEH-977: timeout + transient-retry
import { buildAlternates, buildEntityTitle, urlForLocalePath, OG_LOCALE } from "@/lib/i18n-seo";
import { BRAND_NAME } from "@/lib/constants";
import {
  REGION_KEYS,
  REGION_PAGE_MIN,
  getRegion,
  regionCities,
  regionPagePath,
} from "@/lib/region-pages";

const PER_PAGE = 24;

function citiesQuery(regionKey) {
  return regionCities(regionKey)
    .map((city) => `cities=${encodeURIComponent(city)}`)
    .join("&");
}

/**
 * MEH-1754 — the failure semantics are the whole point of this function, so
 * read before changing it. Copied deliberately from the diet page rather than
 * shared: the two pages must be able to diverge without one silently changing
 * the other's de-indexing behaviour.
 *
 * A 404 tells Google the page is GONE and de-indexing starts; a 5xx says "try
 * later". The ONLY thing that may become notFound() is a genuine "fewer than
 * REGION_PAGE_MIN businesses match" — a real, answered fact. Every transport
 * failure THROWS instead. Never add a bare `catch` returning an empty list:
 * that would 404 every cell during any backend wobble.
 */
async function fetchCell(categoryId, regionKey, limit) {
  const url = `${API_URL}/producers?category=${encodeURIComponent(categoryId)}&${citiesQuery(regionKey)}&limit=${limit}&offset=0`;
  const res = await serverFetch(url, { next: { revalidate: 60 } });
  if (!res.ok) {
    const err = new Error(
      `region listing failed: ${res.status} ${res.statusText} (category=${categoryId}, region=${regionKey})`,
    );
    err.status = res.status;
    throw err;
  }
  // An ABSENT X-Total-Count means "unknown", not "zero", and the difference is
  // a de-indexing event. `Number(null || 0)` would quietly resolve to 0, drop
  // under the threshold and 404 every cell the moment the backend stopped
  // sending the header — believing a negative the query never established.
  const rawTotal = res.headers.get("x-total-count");
  const total = Number(rawTotal);
  if (rawTotal === null || !Number.isFinite(total)) {
    const err = new Error(
      `region listing missing X-Total-Count (category=${categoryId}, region=${regionKey}) — refusing to infer an empty result`,
    );
    err.status = 502;
    throw err;
  }
  const items = await res.json();
  return { items: Array.isArray(items) ? items : [], total };
}

/** The category list, by slug. Throws on failure — the page cannot resolve without it. */
async function fetchCategories() {
  const res = await serverFetch(`${API_URL}/categories`, { next: { revalidate: 300 } });
  if (!res.ok) {
    const err = new Error(`categories lookup failed: ${res.status} ${res.statusText}`);
    err.status = res.status;
    throw err;
  }
  const rows = await res.json();
  return Array.isArray(rows) ? rows : [];
}

/**
 * Resolve a (categorySlug, regionKey) pair to a servable page, or null.
 *
 * `null` is reserved for answered absences: an unknown region key, an unknown
 * category slug, or a cell under the threshold. Anything unanswered throws.
 */
async function resolveCell(categorySlug, regionKey) {
  if (!getRegion(regionKey)) return null;
  const categories = await fetchCategories();
  const category = categories.find((c) => c.slug === categorySlug);
  if (!category) return null;
  const { items, total } = await fetchCell(category.id, regionKey, PER_PAGE);
  if (total < REGION_PAGE_MIN) return null;
  return { category, regionKey, items, total };
}

/**
 * Sibling chips = MEH-1204 §B internal linking: the same category in other
 * regions, and the same region in other categories. A chip may only point at
 * a cell that itself passes the gate — a chip to a sub-threshold page is a
 * link to a 404, which §B calls out explicitly.
 *
 * Fails OPEN (chip omitted) when a sibling's count cannot be read, with a
 * line naming which one: losing an internal link is cosmetic, whereas
 * throwing would 500 this page over an unrelated sibling's wobble. Distinct
 * from the page's own fetch, which must throw — there the answer IS the page.
 *
 * COST: at most (regions − 1) + (categories − 1) counts, each `limit=1`, all
 * concurrent, behind `revalidate: 60`. With 7 regions and 18 categories that
 * is 23 reads against a 120/minute endpoint. The sitemap, which would
 * otherwise walk all 126 cells, prunes first — see sitemap.js.
 */
async function fetchServableSiblings(category, regionKey, categories) {
  const countOf = (cat, region) =>
    fetchCell(cat.id, region, 1)
      .then((r) => r.total)
      .catch((err) => {
        console.warn(
          `[region-page] sibling count failed for category=${cat.slug} region=${region} — chip omitted (fail-open):`,
          err,
        );
        return 0;
      });

  const otherRegions = REGION_KEYS.filter((key) => key !== regionKey);
  const otherCategories = categories.filter((c) => c.id !== category.id);

  const [regionTotals, categoryTotals] = await Promise.all([
    Promise.all(otherRegions.map((key) => countOf(category, key))),
    Promise.all(otherCategories.map((cat) => countOf(cat, regionKey))),
  ]);

  return {
    sameCategory: otherRegions.filter((_key, i) => regionTotals[i] >= REGION_PAGE_MIN),
    sameRegion: otherCategories.filter((_cat, i) => categoryTotals[i] >= REGION_PAGE_MIN),
  };
}

export async function generateMetadata({ params }) {
  const { category: categorySlug, region: regionKey, locale } = await params;
  // MEH-1045: notFound() HERE (pre-streaming, before the [locale] loading.js
  // boundary flushes the shell) is what makes the response a REAL 404. A
  // page-level notFound() alone streams 200 + 404 UI, and bots keep crawling
  // the soft-404.
  const resolved = await resolveCell(categorySlug, regionKey);
  if (!resolved) notFound();

  const { category, total } = resolved;
  const t = await getTranslations({ locale, namespace: "region_pages" });
  const regionIn = t(`regions.${regionKey}`);
  const path = regionPagePath(categorySlug, regionKey);
  const title = t("meta_title", { category: category.name, region_in: regionIn });
  // og/twitter get no template from Next.js, so they carry the brand themselves.
  const socialTitle = buildEntityTitle(title, locale);
  const description = t("meta_description", {
    count: total,
    category: category.name,
    region_in: regionIn,
  });

  return {
    // MEH-2853: plain title — the layout template `%s | <brand>` adds the brand.
    title,
    description,
    openGraph: {
      title: socialTitle,
      description,
      type: "website",
      url: urlForLocalePath(path, locale),
      siteName: BRAND_NAME,
      locale: OG_LOCALE[locale],
      images: ["/og-image.png"],
    },
    twitter: { card: "summary_large_image", title: socialTitle, description, images: ["/og-image.png"] },
    alternates: buildAlternates(path, locale),
  };
}

export default async function RegionLandingPage({ params }) {
  const { category: categorySlug, region: regionKey, locale } = await params;
  setRequestLocale(locale);

  const resolved = await resolveCell(categorySlug, regionKey);
  if (!resolved) notFound();
  const { category, items, total } = resolved;

  const t = await getTranslations({ locale, namespace: "region_pages" });
  const regionIn = t(`regions.${regionKey}`);
  const heading = t("h1", { category: category.name, region_in: regionIn });

  const categories = await fetchCategories();
  const siblings = await fetchServableSiblings(category, regionKey, categories);

  return (
    <main className="mx-auto w-full max-w-6xl px-4 py-8 md:py-12">
      <Breadcrumb
        className="mb-4"
        items={[{ href: "/producers", label: t("breadcrumb_producers") }, { label: heading }]}
      />

      <h1 className="text-2xl font-bold text-fg md:text-3xl">{heading}</h1>
      <p className="mt-3 text-base text-fg-muted" data-testid="region-count-line">
        {t("count_line", { count: total })}
      </p>

      <div className="mt-8 grid grid-cols-2 gap-3 md:gap-6 lg:grid-cols-3 xl:grid-cols-4">
        {items.map((producer) => (
          <ProducerCard key={producer.id} producer={producer} referrer="region-landing" />
        ))}
      </div>

      {siblings.sameCategory.length > 0 && (
        <nav
          aria-label={t("chips_same_category", { category: category.name })}
          className="mt-10"
          data-testid="region-chips-same-category"
        >
          <h2 className="text-sm font-semibold text-fg-muted">
            {t("chips_same_category", { category: category.name })}
          </h2>
          <ul className="mt-3 flex flex-wrap gap-2">
            {siblings.sameCategory.map((key) => (
              <li key={key}>
                <Link
                  href={regionPagePath(categorySlug, key)}
                  className="inline-flex items-center rounded-full border border-border bg-surface px-4 py-2 text-sm text-fg transition-colors hover:border-primary hover:text-primary"
                >
                  {/* Anchor text is the TARGET's full H1 (MEH-1204 §B): a chip
                      reading only «בשרון» tells a crawler nothing about what it
                      links to. */}
                  {t("h1", { category: category.name, region_in: t(`regions.${key}`) })}
                </Link>
              </li>
            ))}
          </ul>
        </nav>
      )}

      {siblings.sameRegion.length > 0 && (
        <nav
          aria-label={t("chips_same_region", { region_in: regionIn })}
          className="mt-8"
          data-testid="region-chips-same-region"
        >
          <h2 className="text-sm font-semibold text-fg-muted">
            {t("chips_same_region", { region_in: regionIn })}
          </h2>
          <ul className="mt-3 flex flex-wrap gap-2">
            {siblings.sameRegion.map((cat) => (
              <li key={cat.id}>
                <Link
                  href={regionPagePath(cat.slug, regionKey)}
                  className="inline-flex items-center rounded-full border border-border bg-surface px-4 py-2 text-sm text-fg transition-colors hover:border-primary hover:text-primary"
                >
                  {t("h1", { category: cat.name, region_in: regionIn })}
                </Link>
              </li>
            ))}
          </ul>
        </nav>
      )}

      <p className="mt-10">
        <Link href="/producers" className="text-primary underline">
          {t("back_to_hub")}
        </Link>
      </p>
    </main>
  );
}
