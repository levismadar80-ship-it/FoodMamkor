/**
 * Public recipe detail page — MEH-591 chunk 4/4 of the producer-recipes epic.
 *
 * URL: /[locale]/[slug]/recipes/[recipe_id]
 * Server component. Fetches BOTH the producer (for breadcrumb + author
 * name + related-product hydration) and the recipe in parallel, then
 * renders <RecipeDetail> + <RecipeJsonLd> for SEO.
 *
 * 404 routes: producer-by-slug fails OR recipe is not published+approved
 * (the backend already filters by `published=true AND
 * moderation_status='approved'` — chunks 1/2 — so a 404 here covers
 * both unknown-slug and not-yet-published recipes without leaking the
 * existence of the latter).
 */

import { notFound } from "next/navigation";
import RecipeDetail from "@/components/public/RecipeDetail";
import RecipeJsonLd from "@/components/public/RecipeJsonLd";
import { API_URL } from "@/lib/env";

async function getJson(path) {
  try {
    const res = await fetch(`${API_URL}${path}`, { next: { revalidate: 60 } });
    if (!res.ok) return null;
    return res.json();
  } catch {
    return null;
  }
}

async function getProducerAndRecipe(slug, recipeId) {
  const [producer, recipe] = await Promise.all([
    getJson(`/producers/by-slug/${encodeURIComponent(slug)}`),
    getJson(
      `/producers/${encodeURIComponent(slug)}/recipes/${encodeURIComponent(
        recipeId
      )}`
    ),
  ]);
  return { producer, recipe };
}

export async function generateMetadata(props) {
  const params = await props.params;
  const { producer, recipe } = await getProducerAndRecipe(
    params.slug,
    params.recipe_id
  );
  if (!producer || !recipe) {
    return { title: "מתכון לא נמצא | מהמקור" };
  }
  const truncate = (s, n) =>
    s && s.length > n ? `${s.slice(0, n - 1)}…` : s || "";
  return {
    title: `${recipe.title} | ${producer.name} | מהמקור`,
    description: truncate(recipe.description, 160),
    openGraph: {
      title: `${recipe.title} | ${producer.name}`,
      description: truncate(recipe.description, 160),
      images: recipe.image_url ? [recipe.image_url] : undefined,
      type: "article",
    },
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

  return (
    <>
      <RecipeJsonLd
        recipe={recipe}
        producerName={producer.name}
        canonicalUrl={canonicalUrl}
      />
      <RecipeDetail
        recipe={recipe}
        producer={producer}
        relatedProducts={relatedProducts}
      />
    </>
  );
}
