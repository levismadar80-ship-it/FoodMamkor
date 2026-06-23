"use client";

/**
 * RecipeCard — MEH-591 chunk 4/4 of the producer-recipes epic.
 *
 * Public card surface on the producer page. Image + title + a small
 * prep/cook meta strip + click-through to /[slug]/recipes/[recipe_id].
 *
 * MEH-911: aligned to the Assembly v2 design system (mirrors ProducerCard,
 * MEH-643). Flat bg-surface-card, 1px border, rounded-none, hover =
 * border-color shift + image scale 1.02. No-image = cream + Phosphor Leaf
 * + "מהמקור" (replaces the 🍞 emoji, Emoji LOCK MEH-657). "מתכון" eyebrow
 * in gold accent. Frank Ruhl title (font-headline-md). Meta strip uses
 * Phosphor Clock + Users (ADR-013 — Phosphor only, Lucide forbidden).
 *
 * Image fallback: the Leaf + brand placeholder when image_url is unset.
 * Times: only the labels with a value (>0) appear, so a recipe with
 * only cook_time_min doesn't show an empty pair.
 *
 * RTL-safe: logical gap utilities only; no physical positional classes.
 */

import Link from "next/link";
import Image from "next/image";
import { useTranslations } from "next-intl";
import { Clock, Users, Leaf } from "@phosphor-icons/react";
import { optimizeCloudinary } from "@/lib/cloudinary";
import { BRAND_NAME } from "@/lib/constants";

export default function RecipeCard({ slug, recipe }) {
  const t = useTranslations("recipes.card");
  const totalMin =
    (recipe.prep_time_min || 0) + (recipe.cook_time_min || 0) || null;
  // MEH-911: smart-crop through the central helper (mirrors ProducerCard:183).
  const imgSrc = optimizeCloudinary(recipe.image_url, { aspectRatio: "4:3" });

  return (
    <Link
      href={`/${slug}/recipes/${recipe.id}`}
      // MEH-911 (Assembly v2): flat surface-card, 1px border, sharp corners,
      // NO shadow-lift — hover = border color shift only. Mirrors ProducerCard:233.
      className="group block bg-surface-card border border-border rounded-none overflow-hidden transition-colors duration-base ease-quart hover:border-primary focus-visible:ring-2 focus-visible:ring-primary/40"
    >
      <div className="relative w-full aspect-square lg:aspect-[4/3] overflow-hidden bg-background">
        {imgSrc ? (
          <Image
            src={imgSrc}
            alt={recipe.title}
            fill
            sizes="(max-width: 640px) 100vw, 33vw"
            className="object-cover object-center transition-transform duration-300 ease-quart group-hover:scale-[1.02]"
          />
        ) : (
          // MEH-911: canonical no-photo state — cream surface + Leaf glyph +
          // brand name (replaces the 🍞 emoji). Mirrors ProducerCard:250-259.
          <div
            className="absolute inset-0 flex flex-col items-center justify-center bg-background gap-2"
            data-testid="recipe-image-missing"
          >
            <Leaf size={40} weight="light" className="text-primary/70" aria-hidden="true" />
            <span className="font-headline-md text-sm font-bold text-primary/80">
              {BRAND_NAME}
            </span>
          </div>
        )}
      </div>
      <div className="p-4 flex flex-col gap-1">
        {/* Eyebrow — uppercase, tracked, gold accent (Assembly v2). Hebrew
            literal kept hardcoded per MEH-911 constraint (i18n MEH-366 mid-flight). */}
        <p className="text-[11px] font-medium uppercase tracking-[0.15em] text-accent">
          מתכון
        </p>
        <h3 className="font-headline-md font-bold text-[20px] text-text leading-snug line-clamp-2">
          {recipe.title}
        </h3>
        {(totalMin || recipe.servings) && (
          <div className="mt-1 flex items-center gap-3 text-[13px] text-fg-muted">
            {totalMin && (
              <span className="inline-flex items-center gap-1.5">
                <Clock size={16} weight="regular" aria-hidden="true" />
                {totalMin} {t("minutes_suffix")}
              </span>
            )}
            {recipe.servings && (
              <span className="inline-flex items-center gap-1.5">
                <Users size={16} weight="regular" aria-hidden="true" />
                {recipe.servings} {t("servings_suffix")}
              </span>
            )}
          </div>
        )}
      </div>
    </Link>
  );
}
