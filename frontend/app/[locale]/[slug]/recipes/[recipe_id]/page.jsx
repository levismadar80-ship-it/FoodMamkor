/**
 * Public recipe detail page — MEH-591 chunk 4/4 of the producer-recipes epic.
 *
 * URL: /[locale]/[slug]/recipes/[recipe_id]
 * Server component. Fetches BOTH the producer (for breadcrumb + author
 * name + related-product hydration) and the recipe in parallel, then
 * renders <RecipeDetail> + <RecipeJsonLd> for SEO.
 *
 * 404 routes: producer-by-slug 404s OR recipe 404s — the latter covering
 * "not published+approved" too, since the backend already filters by
 * `published=true AND moderation_status='approved'` (chunks 1/2), so a 404
 * here covers both unknown-slug and not-yet-published recipes without
 * leaking the existence of the latter.
 *
 * MEH-1754: a 404 from the backend is the ONLY thing that becomes a 404 here.
 * Any other failure (5xx/429/403, timeout, DNS) throws — see getJson below.
 */

import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";
import RecipeDetail from "@/components/public/RecipeDetail";
import RecipeJsonLd from "@/components/public/RecipeJsonLd";
import { API_URL } from "@/lib/env";
import { serverFetch } from "@/lib/server-fetch"; // MEH-977: timeout + transient-retry
import { buildAlternates, OG_LOCALE } from "@/lib/i18n-seo";
import { buildRecipeBreadcrumbJsonLd, serializeJsonLd } from "@/lib/seo"; // MEH-1062: recipe BreadcrumbList
import { BRAND_NAME } from "@/lib/constants";

// MEH-1754: `null` means ONE thing — this entity does not exist. Every other
// failure throws, so it reaches app/[locale]/error.js (Hebrew copy + retry +
// Sentry) instead of rendering a silent not-found.
//
// MEASURED, and deliberately NOT claimed otherwise: on this route the HTTP
// status stays **200** for both outcomes — `app/[locale]/loading.js` flushes
// the shell before the throw, which is the same streaming mechanic MEH-1045
// documents for notFound(). So what the split buys here is the *page* and the
// *Sentry event*, not the status code: a backend 404 renders "לא מצאנו את הדף
// הזה" and a backend 500 renders "משהו השתבש — נסו שוב" (both verified at
// 375 + 1440 against a stub backend). Do not restate the sibling resolver's
// "the response carries a 5xx" for this route without re-measuring it.
//
// REUSES: frontend/app/[locale]/[slug]/page.js:26-42 (getProducerBySlug,
// MEH-1754/PR #2514) — same split, same reason. This route is the sibling the
// original fix did not cover: its resolver still returned `null` for `!res.ok`
// and swallowed the catch, so a 404, a 500, a 429 and an 8s timeout were
// indistinguishable — all four rendered a silent 404 with no stack, no Sentry
// event and no error status. A 404 tells Google the page is GONE and it starts
// de-indexing, while a 5xx says "try later"; Next then caches the notFound()
// result on top (vercel/next.js#79497).
//
// Do NOT reintroduce a bare `catch` here.
async function getJson(path, slug) {
  const res = await serverFetch(`${API_URL}${path}`, { next: { revalidate: 60 } });
  // The one genuine not-found. Only a 404 may become notFound(). For the
  // recipe leg that covers unpublished/unapproved too — the backend filters
  // them out (chunks 1/2), which is the existence-hiding this page relies on.
  if (res.status === 404) return null;
  if (!res.ok) {
    const err = new Error(
      `recipe page lookup failed: ${res.status} ${res.statusText} (path=${path})`
    );
    // Read by Sentry in app/[locale]/error.js; keeps slug+status on the event.
    err.status = res.status;
    err.slug = slug;
    throw err;
  }
  return res.json();
}

async function getProducerAndRecipe(slug, recipeId) {
  const [producer, recipe] = await Promise.all([
    getJson(`/producers/by-slug/${encodeURIComponent(slug)}`, slug),
    getJson(
      `/producers/${encodeURIComponent(slug)}/recipes/${encodeURIComponent(
        recipeId
      )}`,
      slug
    ),
  ]);
  return { producer, recipe };
}

// MEH-475 PR-C4b/chunk-1: first production use of getTranslations +
// generateMetadata. Pattern proof-of-concept for the rest of PR-C4b.
// MEH-476 PR 3b2: per-page hreflang via buildAlternates; og:locale per locale.
export async function generateMetadata(props) {
  const params = await props.params;
  const { locale, slug, recipe_id } = params;
  const [{ producer, recipe }, t] = await Promise.all([
    getProducerAndRecipe(slug, recipe_id),
    getTranslations("recipes.detail"),
  ]);
  const path = `/${slug}/recipes/${recipe_id}`;
  const alternates = buildAlternates(path, locale);
  if (!producer || !recipe) {
    // title.absolute prevents layout's `%s | brand` template double-suffix.
    // MEH-476 followup: 404 paths should not be indexed even though they
    // still emit valid hreflang (so cross-locale 404s are linked).
    return {
      title: { absolute: t("meta_title_not_found") },
      robots: { index: false, follow: false },
      openGraph: { locale: OG_LOCALE[locale] },
      alternates,
    };
  }
  const truncate = (s, n) =>
    s && s.length > n ? `${s.slice(0, n - 1)}…` : s || "";
  return {
    // title.absolute — recipes.detail.meta_title_template already ends "| מהמקור".
    title: {
      absolute: t("meta_title_template", {
        recipeTitle: recipe.title,
        producerName: producer.name,
      }),
    },
    description: truncate(recipe.description, 160),
    openGraph: {
      title: `${recipe.title} | ${producer.name}`,
      description: truncate(recipe.description, 160),
      // MEH-1060 (SEO-15): add og:url (self canonical) + siteName, mirroring the
      // producer-page precedent (lib/seo.js buildProducerMetadata).
      url: alternates.canonical,
      siteName: BRAND_NAME,
      images: recipe.image_url ? [recipe.image_url] : undefined,
      type: "article",
      locale: OG_LOCALE[locale],
    },
    // MEH-1062 (SEO-05): entity-specific Twitter/X card reusing the recipe's
    // own image + title instead of the layout's generic site card.
    twitter: {
      card: "summary_large_image",
      title: `${recipe.title} | ${producer.name}`,
      description: truncate(recipe.description, 160),
      images: recipe.image_url ? [recipe.image_url] : undefined,
    },
    alternates,
  };
}

export default async function PublicRecipePage(props) {
  const params = await props.params;
  const { producer, recipe } = await getProducerAndRecipe(
    params.slug,
    params.recipe_id
  );
  if (!producer || !recipe) notFound();

  // Hydrate related products by filtering producer.products on the
  // recipe's product_ids — same-producer invariant is enforced in
  // chunk 2 (cross-producer 422), so any IDs we don't find are stale.
  const productIds = new Set(recipe.product_ids || []);
  const relatedProducts = (producer.products || []).filter((p) =>
    productIds.has(p.id)
  );

  const canonicalUrl = `/${params.slug}/recipes/${recipe.id}`;

  // MEH-1062 (SEO-02): add the missing BreadcrumbList as a second server-
  // rendered script. RecipeJsonLd.jsx (the Recipe entity) stays untouched.
  const breadcrumbLd = buildRecipeBreadcrumbJsonLd(
    producer,
    recipe,
    canonicalUrl,
    params.locale,
  );

  return (
    <>
      <RecipeJsonLd
        recipe={recipe}
        producerName={producer.name}
        canonicalUrl={canonicalUrl}
      />
      {breadcrumbLd && (
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: serializeJsonLd(breadcrumbLd) }}
        />
      )}
      <RecipeDetail
        recipe={recipe}
        producer={producer}
        relatedProducts={relatedProducts}
      />
    </>
  );
}
