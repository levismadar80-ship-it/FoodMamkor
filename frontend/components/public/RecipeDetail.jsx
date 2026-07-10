"use client";

/**
 * RecipeDetail — MEH-591 chunk 4/4 of the producer-recipes epic.
 *
 * Full public recipe view rendered on /[slug]/recipes/[recipe_id].
 * Sections (top → bottom):
 *   1. Breadcrumb (בית עסק > מתכונים > title)
 *   2. Hero image + title + prep/cook/servings strip
 *   3. Description (whitespace-pre-line)
 *   4. Ingredients (split by newline → bullet list)
 *   5. Instructions (split by newline → numbered list)
 *   6. Related products (links to existing product surfaces) — hidden
 *      entirely when no products are linked (silent, per spec).
 *   7. Back link to the producer page
 *
 * Pure render — no fetching. The parent page does both fetches and
 * passes hydrated objects.
 */

import Link from "next/link";
import Image from "next/image";
import { Leaf } from "@phosphor-icons/react";
import { useTranslations } from "next-intl";
import { optimizeCloudinary } from "@/lib/cloudinary";

function splitLines(text) {
  if (!text) return [];
  return text
    .split("\n")
    .map((s) => s.trim())
    .filter(Boolean);
}

export default function RecipeDetail({ recipe, producer, relatedProducts }) {
  const t = useTranslations("recipes.detail");
  const ingredients = splitLines(recipe.ingredients);
  const steps = splitLines(recipe.instructions);
  const totalMin =
    (recipe.prep_time_min || 0) + (recipe.cook_time_min || 0) || null;

  return (
    <article className="max-w-3xl mx-auto px-4 py-8">
      {/* Breadcrumb */}
      <nav
        className="text-sm text-fg-muted mb-6"
        aria-label={t("breadcrumb_aria")}
      >
        <Link href={`/${producer.slug}`} className="hover:underline rounded-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40">
          {producer.name}
        </Link>
        <span className="mx-2" aria-hidden="true">
          {">"}
        </span>
        <Link
          href={`/${producer.slug}#recipes`}
          className="hover:underline rounded-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40"
        >
          {t("breadcrumb_recipes")}
        </Link>
        <span className="mx-2" aria-hidden="true">
          {">"}
        </span>
        <span className="text-text">{recipe.title}</span>
      </nav>

      {/* Hero */}
      {recipe.image_url && (
        <div className="relative aspect-[16/9] bg-green-50 rounded-[16px] overflow-hidden mb-6">
          <Image
            src={optimizeCloudinary(recipe.image_url)}
            alt={recipe.title}
            fill
            sizes="(max-width: 768px) 100vw, 768px"
            className="object-cover"
          />
        </div>
      )}

      <h1 className="font-headline-lg text-3xl font-black text-text mb-3">
        {recipe.title}
      </h1>

      {/* Time strip */}
      {(recipe.prep_time_min ||
        recipe.cook_time_min ||
        recipe.servings ||
        totalMin) && (
        <div className="flex flex-wrap gap-x-6 gap-y-2 text-sm text-fg-muted mb-6 border-y border-border py-3">
          {recipe.prep_time_min ? (
            <span>
              <strong className="text-text">{t("prep_time_label")}</strong>{" "}
              {recipe.prep_time_min} {t("minutes_unit")}
            </span>
          ) : null}
          {recipe.cook_time_min ? (
            <span>
              <strong className="text-text">{t("cook_time_label")}</strong>{" "}
              {recipe.cook_time_min} {t("minutes_unit")}
            </span>
          ) : null}
          {recipe.servings ? (
            <span>
              <strong className="text-text">{t("servings_label")}</strong>{" "}
              {recipe.servings}
            </span>
          ) : null}
        </div>
      )}

      {/* Description */}
      {recipe.description && (
        <p className="text-text/85 leading-relaxed whitespace-pre-line mb-8">
          {recipe.description}
        </p>
      )}

      {/* Ingredients */}
      {ingredients.length > 0 && (
        <section className="mb-8">
          <h2 className="font-headline-md text-2xl font-bold text-text mb-3">
            {t("ingredients_heading")}
          </h2>
          <ul className="list-disc ps-6 space-y-1 text-text/90">
            {ingredients.map((line, i) => (
              <li key={i}>{line}</li>
            ))}
          </ul>
        </section>
      )}

      {/* Instructions */}
      {steps.length > 0 && (
        <section className="mb-8">
          <h2 className="font-headline-md text-2xl font-bold text-text mb-3">
            {t("instructions_heading")}
          </h2>
          <ol className="list-decimal ps-6 space-y-2 text-text/90">
            {steps.map((step, i) => (
              <li key={i} className="whitespace-pre-line">
                {step}
              </li>
            ))}
          </ol>
        </section>
      )}

      {/* Related products — silent when empty per spec. */}
      {relatedProducts && relatedProducts.length > 0 && (
        <section className="mb-8">
          <h2 className="font-headline-md text-2xl font-bold text-text mb-3">
            {t("related_products_heading")}
          </h2>
          <ul className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {relatedProducts.map((p) => (
              <li
                key={p.id}
                className="bg-white rounded-[12px] border border-border p-3 flex items-center gap-3"
              >
                {p.image_url ? (
                  <Image
                    src={p.image_url}
                    alt=""
                    width={56}
                    height={56}
                    className="w-14 h-14 object-cover rounded-[8px]"
                  />
                ) : (
                  <span
                    aria-hidden="true"
                    className="w-14 h-14 rounded-[8px] bg-green-50 flex items-center justify-center"
                  >
                    <Leaf size={24} weight="fill" className="text-primary" />
                  </span>
                )}
                <div className="min-w-0">
                  <p className="font-medium text-text truncate">
                    {p.name}
                  </p>
                  {p.price_range && (
                    <p className="text-xs text-fg-muted">{p.price_range}</p>
                  )}
                </div>
              </li>
            ))}
          </ul>
        </section>
      )}

      {/* Back link */}
      <Link
        href={`/${producer.slug}`}
        className="text-sm text-primary hover:underline rounded-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40"
      >
        {t("back_to_producer")}
      </Link>
    </article>
  );
}
