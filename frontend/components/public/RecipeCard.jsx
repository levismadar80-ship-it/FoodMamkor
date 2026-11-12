"use client";

/**
 * RecipeCard — one recipe on the business page (MEH-591), linking to
 * /[slug]/recipes/[recipe_id].
 *
 * MEH-3006 (option B, Sapir's pick): a medium card in a sideways-scrolling
 * strip on phones — 4:3 photo, title, time/servings — with the next card
 * peeking past the edge so the strip reads as scrollable. The strip's height
 * is the same for 1 recipe or 10 (the old card was a full-width square that
 * filled a phone screen). From md up the same cards sit in a 3-column grid.
 * Card width/snap classes live on the card; the strip is ProducerSections'.
 *
 * No photo (or a photo that fails to load, MEH-1976): the MEH-2833 name plate
 * — the title in Frank Ruhl 900 on sand + one seed in the recipe's colour.
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
  // Boxes: phone card ≤ 240px; md..lg-1 3-col cell (W - 64)/3, peaking at
  // ~320px at W = 1023; lg+ ~246px at the max-w-6xl cap. 320 × DPR 2 = 640.
  const imgSrc = optimizeCloudinary(recipe.image_url, {
    aspectRatio: IMAGE_RATIOS.card,
    width: 640,
  });
  // MEH-1976: a url that resolves but fails to load falls through to the
  // no-photo tile. The state holds the src that failed, so a new `imgSrc`
  // clears it with no effect.
  const [failedSrc, setFailedSrc] = useState(null);
  const imgError = failedSrc !== null && failedSrc === imgSrc;

  return (
    <Link
      href={`/${slug}/recipes/${recipe.id}`}
      data-testid="recipe-card"
      className="group block shrink-0 w-[62%] max-w-[240px] snap-start md:w-auto md:max-w-none rounded-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-primary/60"
    >
      <div className="relative w-full aspect-[4/3] rounded-md overflow-hidden bg-background">
        {imgSrc && !imgError ? (
          <Image
            src={imgSrc}
            alt={recipe.title}
            fill
            sizes="(max-width: 767px) min(62vw, 240px), (max-width: 1023px) calc(33.33vw - 21.33px), 246px"
            className="object-cover transition-transform duration-300 ease-quart group-hover:scale-[1.02]"
            onError={() => setFailedSrc(imgSrc)}
          />
        ) : (
          // MEH-2833 name plate; it repeats the <h3> below, so aria-hidden.
          <div
            className="absolute inset-0 flex flex-col justify-end bg-background-alt p-3 pt-10"
            data-testid="recipe-image-missing"
            aria-hidden="true"
          >
            <Seed
              color={seedColorFor(recipe.id).fill}
              size={56}
              rotate={-36}
              highlight
              className="absolute -top-[36px] -end-[24px] pointer-events-none ltr:-scale-x-100"
            />
            <span
              className="relative font-headline-lg font-black text-xl leading-[1.05] text-text line-clamp-3 [word-break:keep-all] [overflow-wrap:anywhere]"
              data-testid="recipe-name-plate"
            >
              {recipe.title}
            </span>
          </div>
        )}
      </div>
      <h3 className="mt-2 font-headline-md font-bold text-lg text-text leading-snug line-clamp-2 group-hover:text-primary transition-colors">
        {recipe.title}
      </h3>
      {(totalMin || recipe.servings) && (
        <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-sm text-fg-muted">
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
    </Link>
  );
}
