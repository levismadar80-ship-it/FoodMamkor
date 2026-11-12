"use client";

/**
 * RecipeCard — one recipe on the business page (MEH-591), linking to
 * /[slug]/recipes/[recipe_id].
 *
 * MEH-3006: a compact ROW, the same shape as the product rows above it
 * (ProducerSections products list, MEH-1168 P1): an 80px square thumbnail at
 * the inline-start, title + time/servings beside it, ~96px tall, hairline
 * separated. It replaces the image-first card (aspect-square on phones), which
 * made a single recipe fill a whole phone screen and grew a long 2-column wall
 * as recipes were added. A row is the same size for 1 recipe or 10, and the
 * section heading «המתכונים שלנו» already says what each row is, so the «מתכון»
 * eyebrow is no longer shown.
 *
 * No photo (or a photo that fails to load, MEH-1976): the sand tile with one
 * seed in the recipe's own colour (MEH-2833's no-photo language, scaled to the
 * thumbnail; the name plate is dropped because the title sits right beside it).
 * Times: only a value > 0 is shown. Icons: Phosphor only (ADR-013).
 * RTL-safe: logical utilities only.
 */

import { useState } from "react";
import { Link } from "@/i18n/navigation";
import Image from "next/image";
import { useTranslations } from "next-intl";
import { Clock, Users } from "@phosphor-icons/react";
import { optimizeCloudinary, IMAGE_RATIOS } from "@/lib/cloudinary";
import Seed from "@/components/brand/Seed";
import { seedColorFor } from "@/lib/brand-seeds";

export default function RecipeCard({ slug, recipe }) {
  const t = useTranslations("recipes.card");
  const totalMin =
    (recipe.prep_time_min || 0) + (recipe.cook_time_min || 0) || null;
  // 80px box × DPR 2 = 160, the same request the product rows make.
  const imgSrc = optimizeCloudinary(recipe.image_url, {
    aspectRatio: IMAGE_RATIOS.square,
    width: 160,
  });
  // MEH-1976: a url that resolves but fails to load falls through to the
  // no-photo tile. The state holds the src that failed, so a new `imgSrc`
  // clears it with no effect.
  const [failedSrc, setFailedSrc] = useState(null);
  const imgError = failedSrc !== null && failedSrc === imgSrc;

  return (
    <Link
      href={`/${slug}/recipes/${recipe.id}`}
      data-testid="recipe-row"
      className="group w-full flex items-center gap-3 py-2 min-h-[96px] border-b border-border transition-colors hover:bg-primary/[0.03] focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-accent/40"
    >
      <div className="relative w-20 h-20 flex-shrink-0 rounded-md overflow-hidden bg-background">
        {imgSrc && !imgError ? (
          <Image
            src={imgSrc}
            alt={recipe.title}
            fill
            sizes="80px"
            className="object-cover"
            onError={() => setFailedSrc(imgSrc)}
          />
        ) : (
          <div
            className="absolute inset-0 bg-background-alt"
            data-testid="recipe-image-missing"
            aria-hidden="true"
          >
            <Seed
              color={seedColorFor(recipe.id).fill}
              size={40}
              rotate={-36}
              highlight
              className="absolute -top-[14px] -end-[10px] pointer-events-none ltr:-scale-x-100"
            />
          </div>
        )}
      </div>
      <div className="min-w-0 flex-1 flex flex-col gap-1">
        <h3 className="font-headline-md font-bold text-lg text-text leading-snug line-clamp-2 group-hover:text-primary transition-colors">
          {recipe.title}
        </h3>
        {(totalMin || recipe.servings) && (
          <div className="flex flex-wrap items-center gap-x-3 gap-y-0.5 text-sm text-fg-muted">
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
