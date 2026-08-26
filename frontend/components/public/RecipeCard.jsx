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

import { useState } from "react";
import Link from "next/link";
import Image from "next/image";
import { useTranslations } from "next-intl";
import { Clock, Users, Leaf } from "@phosphor-icons/react";
import { optimizeCloudinary, IMAGE_RATIOS } from "@/lib/cloudinary";
import { BRAND_NAME } from "@/lib/constants";

export default function RecipeCard({ slug, recipe }) {
  const t = useTranslations("recipes.card");
  const totalMin =
    (recipe.prep_time_min || 0) + (recipe.cook_time_min || 0) || null;
  // MEH-911: smart-crop through the central helper (mirrors ProducerCard:183).
  // MEH-2010: explicit width for the same reason as ProducerCard — c_fill is
  // uncapped by design, so the cap has to come from the call site.
  // Derived from the only place this card renders (ProducerSections.jsx:487,
  // `grid grid-cols-2 md:grid-cols-3 gap-4` inside `max-w-6xl px-4`): the
  // content column caps at 1120 CSS px, so the widest cell is
  // (1120 - 32)/3 = 363 CSS px at md+, and (767 - 32 - 16)/2 = 360 below it.
  // 363 x DPR 2 = 726, rounded up to 750 — a Next `deviceSizes` entry.
  //
  // NOTE, and it is deliberately not fixed here: `sizes` below claims
  // `(max-width: 640px) 100vw`, which is wrong — the grid is 2-column at every
  // width, never 1. The attribute over-claims by ~2x on mobile. Correcting it
  // is a `sizes` change on a VRT-covered surface and belongs to its own
  // ticket; this width is derived from the real box, not from that claim.
  const imgSrc = optimizeCloudinary(recipe.image_url, {
    aspectRatio: IMAGE_RATIOS.card,
    width: 750,
  });
  // MEH-1976: `imgSrc ?` below only covers a MISSING url. A url that resolves
  // but fails to load (the MEH-1925 Cloudinary 401) rendered a broken glyph
  // instead of the no-photo cell two branches down. Failure now falls through
  // to that same cell, so this surface's locked design owns both states.
  // Derived during render: the state holds the src that failed, so a new
  // `imgSrc` clears it with no effect and no reset.
  const [failedSrc, setFailedSrc] = useState(null);
  const imgError = failedSrc !== null && failedSrc === imgSrc;

  return (
    <Link
      href={`/${slug}/recipes/${recipe.id}`}
      // MEH-911 (Assembly v2): flat surface-card, 1px border, sharp corners,
      // NO shadow-lift — hover = border color shift only. Mirrors ProducerCard:233.
      className="group block bg-surface-card border border-border rounded-none overflow-hidden transition-colors duration-base ease-quart hover:border-primary focus-visible:ring-2 focus-visible:ring-primary/40"
    >
      <div className="relative w-full aspect-square lg:aspect-[4/3] overflow-hidden bg-background">
        {imgSrc && !imgError ? (
          <Image
            src={imgSrc}
            alt={recipe.title}
            fill
            sizes="(max-width: 640px) 100vw, 33vw"
            className="object-cover object-center transition-transform duration-300 ease-quart group-hover:scale-[1.02]"
            onError={() => setFailedSrc(imgSrc)}
          />
        ) : (
          // MEH-911: canonical no-photo state — green-50 tile + Leaf glyph +
          // brand name (replaces the 🍞 emoji). Mirrors ProducerCard.
          // MEH-1400: bg-background → bg-green-50 (green-50 = #EAF3DE, MEH-1243 tile).
          <div
            className="absolute inset-0 flex flex-col items-center justify-center bg-green-50 gap-2"
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
        {/* Eyebrow — gold accent (Assembly v2; tracking dropped per MEH-867). Hebrew
            literal kept hardcoded per MEH-911 constraint (i18n MEH-366 mid-flight). */}
        <p className="text-[11px] font-medium text-accent">
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
