"use client";

/**
 * RecipeDetail — MEH-591 chunk 4/4 of the producer-recipes epic.
 *
 * Full public recipe view rendered on /[slug]/recipes/[recipe_id].
 * Sections (top → bottom):
 *   1. Hero image — edge to edge on a phone, framed on desktop; share +
 *      save circles in its corner, as on the business page (MEH-2558)
 *   2. Breadcrumb (בית עסק > מתכונים)
 *   3. Eyebrow + title + description, then the business as an OwnerRow
 *   4. Prep / cook / servings as icon tiles
 *   5. Ingredients (tap to cross off) beside the steps from lg — the
 *      ingredients card is sticky so it stays in view while cooking
 *   6. Steps with large numerals
 *   7. Related products (hidden entirely when none are linked)
 *   8. Producer contact CTA — PrimaryContactButton + profile link
 *   9. Back link to the producer page
 *
 * Pure render — no fetching. The parent page does both fetches and
 * passes hydrated objects.
 *
 * History: MEH-591 (creation); MEH-1149 (contact CTA — closes the
 * conversion dead-end found in audit MEH-1144 G7); MEH-2543 (NYT Cooking /
 * BBC Good Food layout — byline up top, fact tiles, ingredients beside steps,
 * cross-off ingredients; approved 29/10, proposal QjE2yYUSvDwK7BtYToEvM6);
 * MEH-2558 (share + save on the hero).
 */

import { useState } from "react";
import Image from "next/image";
import { Leaf, Clock, CookingPot, Users, Check, CaretLeft } from "@phosphor-icons/react";
import { useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation"; // MEH-2543: next/link dropped the /en prefix
import { optimizeCloudinary, IMAGE_RATIOS } from "@/lib/cloudinary";
import ImageWithFallback from "@/components/ImageWithFallback";
import OwnerRow from "@/components/OwnerRow";
import PrimaryContactButton from "@/components/PrimaryContactButton";
import SaveButton from "@/components/SaveButton"; // MEH-2558
import ShareButton from "@/components/ShareButton";
import Seed from "@/components/brand/Seed"; // MEH-2844
import HistoryBackLink from "@/components/HistoryBackLink"; // MEH-2857
import { seedColorFor } from "@/lib/brand-seeds";
import { splitRecipeLines } from "@/lib/recipe-lines"; // MEH-2540
import { formatPriceRange } from "@/lib/utils";
import SectionHeading from "@/components/ui/SectionHeading";

const LINK_FOCUS =
  "rounded-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary";

// Tailwind needs the literal class names — never build `grid-cols-${n}`.
const FACT_COLS = { 1: "grid-cols-1", 2: "grid-cols-2", 3: "grid-cols-3" };

// The detail labels end in a colon for the old inline strip («זמן הכנה:»);
// a tile puts the label on its own line, where the colon reads as noise.
const tileLabel = (label) => label.replace(/:\s*$/, "");

function FactTile({ icon: Icon, label, value }) {
  return (
    <div className="flex flex-col items-center gap-1 px-2 py-3 text-center">
      <Icon size={22} className="text-primary" aria-hidden="true" />
      <span className="text-sm text-fg-muted">{label}</span>
      <span className="text-base font-bold text-text">{value}</span>
    </div>
  );
}

export default function RecipeDetail({ recipe, producer, relatedProducts }) {
  const t = useTranslations("recipes.detail");
  const ingredients = splitRecipeLines(recipe.ingredients);
  const steps = splitRecipeLines(recipe.instructions);

  // A url that resolves but fails to load (the MEH-1925 Cloudinary 401) falls
  // through to the no-photo strip — same derived-state pattern as RecipeCard.
  const heroSrc = recipe.image_url ? optimizeCloudinary(recipe.image_url) : null;
  const [failedSrc, setFailedSrc] = useState(null);
  const showPhoto = heroSrc && failedSrc !== heroSrc;

  // Empty on the server. ShareButton only reads it inside its click handler
  // and never renders it, so the two values cannot cause a hydration mismatch.
  const pageUrl =
    typeof window === "undefined"
      ? ""
      : `${window.location.origin}${window.location.pathname}`;

  const [checked, setChecked] = useState(() => new Set());
  const toggleIngredient = (i) =>
    setChecked((prev) => {
      const next = new Set(prev);
      if (next.has(i)) next.delete(i);
      else next.add(i);
      return next;
    });

  const facts = [
    recipe.prep_time_min && {
      icon: Clock,
      label: tileLabel(t("prep_time_label")),
      value: `${recipe.prep_time_min} ${t("minutes_unit")}`,
    },
    recipe.cook_time_min && {
      icon: CookingPot,
      label: tileLabel(t("cook_time_label")),
      value: `${recipe.cook_time_min} ${t("minutes_unit")}`,
    },
    recipe.servings && {
      icon: Users,
      label: tileLabel(t("servings_label")),
      value: recipe.servings,
    },
  ].filter(Boolean);

  return (
    <article className="max-w-6xl mx-auto pb-10">
      {/* Hero. No photo → a low strip, never a tall empty box. MEH-2844:
          the strip carries the recipe card's seed (MEH-2833 board 8 —
          RecipeCard.jsx: same Seed, same props, the recipe's own colour)
          instead of the old Leaf, on the same sand (background-alt) as the
          card plate. It is cropped in the START-top corner, opposite the
          share/save pair (top-3 end-3), so it never sits under a control. */}
      <div className="relative md:px-4 md:pt-6">
        {/* MEH-2558: share + save, the business page's hero pair
            (ImageGallery) — same corner, same circles. MEH-2671: that corner
            is inline-END (top-left in RTL) and the heart leads, per the
            Apple/Material bidi rule (actions trail). Sits on the no-photo
            strip too, so the actions never depend on the photo. */}
        <div
          className="absolute top-3 end-3 md:top-9 md:end-7 z-10 flex items-center gap-2"
          data-testid="recipe-hero-actions"
        >
          <SaveButton itemType="recipe" itemId={recipe.id} />
          <ShareButton
            variant="overlay"
            subject="recipe"
            url={pageUrl}
            title={recipe.title}
            description={recipe.description}
          />
        </div>
        {showPhoto ? (
          <div className="relative aspect-[4/3] md:aspect-[21/9] bg-green-50 md:rounded-lg overflow-hidden">
            <Image
              src={heroSrc}
              alt={recipe.title}
              fill
              priority
              sizes="(max-width: 767px) 100vw, 1120px"
              className="object-cover"
              onError={() => setFailedSrc(heroSrc)}
            />
          </div>
        ) : (
          <div
            className="relative h-24 md:h-28 bg-background-alt md:rounded-lg overflow-hidden"
            data-testid="recipe-hero-missing"
          >
            <Seed
              color={seedColorFor(recipe.id).fill}
              size={70}
              rotate={-36}
              highlight
              className="absolute -top-[46px] -start-[30px] pointer-events-none rtl:-scale-x-100"
            />
          </div>
        )}
      </div>

      <div className="px-4">
        {/* MEH-2857: «→ חזרה» to the page the visitor came from, when there is
            one inside the site; the business › recipes trail stays as is. */}
        <HistoryBackLink className="mt-2" />
        <nav className="text-sm text-fg-muted mt-4" aria-label={t("breadcrumb_aria")}>
          <Link href={`/${producer.slug}`} className={`hover:underline ${LINK_FOCUS}`}>
            {producer.name}
          </Link>
          <span className="mx-2" aria-hidden="true">
            {">"}
          </span>
          <Link href={`/${producer.slug}#recipes`} className={`hover:underline ${LINK_FOCUS}`}>
            {t("breadcrumb_recipes")}
          </Link>
        </nav>

        <header className="max-w-3xl">
          <p className="mt-4 text-sm font-medium text-accent">{t("eyebrow")}</p>
          <h1 className="font-headline-lg text-3xl md:text-5xl md:leading-tight font-black text-text mt-1">
            {recipe.title}
          </h1>
          {recipe.description && (
            <p className="mt-3 text-lg text-text/85 leading-relaxed whitespace-pre-line">
              {recipe.description}
            </p>
          )}
          <div className="mt-5 max-w-md">
            <OwnerRow href={`/${producer.slug}`} name={producer.name} testId="recipe-owner-row">
              <span className="block text-sm text-fg-muted">{t("by_label")}</span>
              <span className="block font-medium">{producer.name}</span>
            </OwnerRow>
          </div>
          {facts.length > 0 && (
            <div
              className={`mt-5 grid ${FACT_COLS[facts.length]} border-y border-border [&>*+*]:border-s [&>*+*]:border-border`}
              data-testid="recipe-facts"
            >
              {facts.map((f) => (
                <FactTile key={f.label} {...f} />
              ))}
            </div>
          )}
        </header>

        <div className="mt-8 grid gap-10 lg:grid-cols-[340px_1fr] lg:items-start">
          {ingredients.length > 0 && (
            <section className="lg:sticky lg:top-24 bg-surface-card border border-border rounded-lg p-5">
              <SectionHeading size="content" className="mb-3">
                {t("ingredients_heading")}
              </SectionHeading>
              <ul className="divide-y divide-border">
                {ingredients.map((line, i) => {
                  const on = checked.has(i);
                  return (
                    <li key={i}>
                      <button
                        type="button"
                        aria-pressed={on}
                        onClick={() => toggleIngredient(i)}
                        className="w-full min-h-touch flex items-center gap-3 py-2 text-start focus-ring rounded-sm"
                      >
                        <span
                          aria-hidden="true"
                          className={`shrink-0 w-5 h-5 rounded border grid place-items-center transition-colors ${
                            on ? "bg-primary border-primary" : "border-fg-muted/50"
                          }`}
                        >
                          {on && <Check size={14} weight="bold" className="text-white" />}
                        </span>
                        <span className={on ? "text-fg-muted line-through" : "text-text"}>
                          {line}
                        </span>
                      </button>
                    </li>
                  );
                })}
              </ul>
            </section>
          )}

          <div className="min-w-0">
            {steps.length > 0 && (
              <section>
                <SectionHeading size="content" className="mb-4">
                  {t("instructions_heading")}
                </SectionHeading>
                <ol className="space-y-6">
                  {steps.map((step, i) => (
                    <li key={i} className="flex gap-4">
                      <span
                        aria-hidden="true"
                        className="shrink-0 w-8 text-center font-headline-lg text-3xl font-black text-primary leading-none"
                      >
                        {i + 1}
                      </span>
                      <p className="text-lg leading-relaxed text-text/90 whitespace-pre-line pt-0.5">
                        {step}
                      </p>
                    </li>
                  ))}
                </ol>
              </section>
            )}

            {/* Related products — silent when empty per spec. */}
            {relatedProducts && relatedProducts.length > 0 && (
              <section className="mt-10">
                <SectionHeading size="content" className="mb-3">
                  {t("related_products_heading")}
                </SectionHeading>
                <ul className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  {/* PR #3972 (Sapir 31/10: «קישור לרכישת המוצרים»): each row
                      opens that product's sheet on the business page, where the
                      price, photos and the per-product contact button live.
                      Before, the row was a dead <li> and the price read only the
                      legacy price_range, so any product priced via price_min
                      showed no price at all. */}
                  {relatedProducts.map((p) => {
                    const numericPrice =
                      p.price_min != null ? formatPriceRange(p.price_min, p.price_max) : null;
                    return (
                    <li key={p.id}>
                    <Link
                      href={`/${producer.slug}?product=${encodeURIComponent(p.id)}`}
                      data-testid="recipe-product-link"
                      className={`bg-surface rounded-md border border-border p-3 flex items-center gap-3 min-h-11 hover:border-primary transition-colors ${LINK_FOCUS}`}
                    >
                      {p.image_url ? (
                        // MEH-1229: helper-routed square crop + graceful fallback.
                        <ImageWithFallback
                          src={p.image_url}
                          alt=""
                          aspectRatio={IMAGE_RATIOS.square}
                          optimizeWidth={112}
                          width={56}
                          height={56}
                          className="w-14 h-14 object-cover rounded-sm"
                        />
                      ) : (
                        <span
                          aria-hidden="true"
                          className="w-14 h-14 rounded-sm bg-green-50 flex items-center justify-center"
                        >
                          <Leaf size={24} weight="fill" className="text-primary" />
                        </span>
                      )}
                      <div className="min-w-0">
                        <p className="font-medium text-text truncate">{p.name}</p>
                        {numericPrice ? (
                          <p className="text-sm text-accent font-medium"><span dir="ltr">{numericPrice}</span></p>
                        ) : p.price_range ? (
                          <p className="text-xs text-fg-muted">{p.price_range}</p>
                        ) : null}
                      </div>
                      <CaretLeft size={14} className="ms-auto shrink-0 text-fg-muted" aria-hidden="true" />
                    </Link>
                    </li>
                    );
                  })}
                </ul>
              </section>
            )}

            {/* Producer contact CTA (MEH-1149; audit MEH-1144 G7).
                PrimaryContactButton self-collapses to null for a contactless
                producer, so the profile link renders alone. */}
            <section className="mt-10 rounded-lg bg-green-50 p-5 md:p-6">
              <SectionHeading size="content" className="mb-4">
                {t("producer_cta_heading", { name: producer.name })}
              </SectionHeading>
              <div className="flex flex-col items-start gap-2 w-full sm:max-w-xs">
                <div className="w-full">
                  <PrimaryContactButton producer={producer} />
                </div>
                <Link
                  href={`/${producer.slug}`}
                  className={`text-sm text-primary underline decoration-[1.5px] underline-offset-[5px] decoration-primary/35 hover:decoration-current ${LINK_FOCUS}`}
                >
                  {t("producer_cta_link", { name: producer.name })}
                </Link>
              </div>
            </section>

            <Link
              href={`/${producer.slug}`}
              className={`mt-8 inline-block text-sm text-primary hover:underline ${LINK_FOCUS}`}
            >
              {t("back_to_producer")}
            </Link>
          </div>
        </div>
      </div>
    </article>
  );
}
