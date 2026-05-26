"use client";

/**
 * RecipeCard — MEH-591 chunk 4/4 of the producer-recipes epic.
 *
 * Public card surface on the producer page. Image + title + a small
 * prep/cook badge + click-through to /[slug]/recipes/[recipe_id].
 *
 * Image fallback: a neutral placeholder block when image_url is unset.
 * Times: only the labels with a value (>0) appear, so a recipe with
 * only cook_time_min doesn't show an empty "prep:" pair.
 *
 * RTL-safe: logical gap utilities only; no physical positional classes.
 */

import Link from "next/link";
import { useTranslations } from "next-intl";

export default function RecipeCard({ slug, recipe }) {
  const t = useTranslations("recipes.card");
  const totalMin =
    (recipe.prep_time_min || 0) + (recipe.cook_time_min || 0) || null;
  return (
    <Link
      href={`/${slug}/recipes/${recipe.id}`}
      className="block bg-white rounded-[14px] border border-border overflow-hidden hover:border-primary transition focus-visible:ring-2 focus-visible:ring-primary/40"
    >
      <div className="aspect-[4/3] bg-green-50 flex items-center justify-center text-3xl">
        {recipe.image_url ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={recipe.image_url}
            alt={recipe.title}
            className="w-full h-full object-cover"
            loading="lazy"
          />
        ) : (
          <span aria-hidden="true">🍞</span>
        )}
      </div>
      <div className="p-4">
        <h3 className="font-semibold text-site-text line-clamp-2 mb-1">
          {recipe.title}
        </h3>
        {totalMin && (
          <p className="text-xs text-fg-muted">
            {totalMin} {t("minutes_suffix")}
            {recipe.servings ? ` · ${recipe.servings} ${t("servings_suffix")}` : ""}
          </p>
        )}
      </div>
    </Link>
  );
}
