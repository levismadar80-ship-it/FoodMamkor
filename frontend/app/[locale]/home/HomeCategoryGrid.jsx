"use client";

import Link from "next/link";
import { motion } from "framer-motion";
import { useTranslations } from "next-intl";
import { Leaf } from "@phosphor-icons/react";
import FadeInSection from "@/components/FadeInSection";
import { CATEGORY_ICONS } from "@/components/CategoryIcons";

// MEH-643: ease-quart curve [0.25,1,0.5,1] mirrored for Framer (= .ease-quart, MEH-136).
const EASE_QUART = [0.25, 1, 0.5, 1];

/**
 * Category grid — Assembly v2 (MEH-643 chunk 2), navigation cards since
 * MEH-1080. Ten flat editorial cards in the 2-hero + 8-small asymmetric
 * layout: warm-white surface-card, 1px border, sharp corners, a hand-drawn
 * glyph on a cream panel (Phosphor Leaf fallback for the 4 cards awaiting
 * MEH-683 glyphs), a gold Cormorant-italic numeral (01-10, LTR-isolated),
 * and the category name (= DB value verbatim).
 *
 * MEH-1080 [T-A] (MEH-1077 DISC-01): each card is a real <Link> to
 * /producers?category=<id> — navigable, crawlable, Back-able. The old
 * in-place homepage filtering (onCardClick → filter + scroll) is gone.
 * A card whose categoryId hasn't resolved yet (categories still loading,
 * or category absent in this environment) renders inert — same visual,
 * no dead link.
 *
 * Layout: desktop 2+8 (4-col grid, hero span-2) · tablet uniform · mobile
 * 2 full-width heroes + 8 small in 2×4. No producer counters (LOCK).
 *
 * Does NOT: own the card set or id resolution (lib/home-categories.js) or
 * the glyph paths (CategoryIcons.jsx).
 *
 * Props:
 *   categoryCards: card[] joined with API category IDs (card.key/name/categoryId).
 *
 * History: PREMIUM_DESIGN (photo cards); MEH-643 (Assembly-v2 flat redesign);
 * MEH-1080 (buttons → links, 1:1 card↔category split).
 */
export function HomeCategoryGrid({ categoryCards }) {
  const t = useTranslations();
  return (
    <section className="max-w-7xl mx-auto px-4 section-y">
      <FadeInSection className="mb-10">
        {/* MEH-1032 (HOME-17): eyebrow+rule pattern mirrors HomeStaticBlocks §10 — DM-Sans, 32×1px gold rule, start-aligned. */}
        <span className="flex items-center gap-3 font-medium text-[11px] tracking-[0.18em] text-accent mb-1">
          {t("home.categories.eyebrow")}
          <span className="inline-block w-8 h-px bg-accent" aria-hidden="true" />
        </span>
        <h2 className="font-headline-display text-headline-display text-text">
          {t("home.categories.heading")}
        </h2>
      </FadeInSection>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 md:gap-4 lg:gap-6">
        {categoryCards.map((card, idx) => {
          const LineArt = CATEGORY_ICONS[card.key];
          const isHero = idx < 2;
          const numeral = String(idx + 1).padStart(2, "0");
          const cardClassName = [
            "group flex flex-col h-full bg-surface-card border border-border hover:border-primary transition-colors duration-base ease-quart focus-ring",
          ].join(" ");
          const cardBody = (
            <>
              {/* Glyph panel — cream background, hand-drawn line glyph in brand
                  green; Phosphor Leaf stand-in until MEH-683 draws the missing 4. */}
              <div
                className={[
                  "grid place-items-center bg-background text-primary",
                  // MEH-991 (HOME-18): v8 aspect matrix — small 1:1 desktop+mobile / 4:3 tablet; hero mobile 16:7.
                  isHero ? "aspect-[16/7] md:aspect-[4/3] lg:aspect-[16/9]" : "aspect-square md:aspect-[4/3] lg:aspect-square",
                ].join(" ")}
              >
                {LineArt ? (
                  <LineArt
                    className={
                      isHero
                        ? "w-24 h-24 lg:w-[120px] lg:h-[120px]"
                        : "w-16 h-16"
                    }
                  />
                ) : (
                  <Leaf weight="thin" className={isHero ? "w-24 h-24 lg:w-[120px] lg:h-[120px]" : "w-16 h-16"} aria-hidden="true" />
                )}
              </div>

              {/* Body — gold Cormorant numeral (LTR-isolated) + display-font name. */}
              <div className="flex items-baseline gap-3 px-4 pb-4 pt-5 md:px-6 md:pt-6">
                <span dir="ltr" className="font-english italic text-accent leading-none text-[22px] lg:text-[28px]">
                  {numeral}
                </span>
                <h3 className={[
                  // MEH-991 (HOME-15): v8 hover lock — border→green + 1px gold underline; glyph never scales.
                  "font-headline-md font-bold text-text leading-tight group-hover:underline decoration-accent decoration-1 underline-offset-4",
                  isHero ? "text-[20px] lg:text-[22px]" : "text-[15px] md:text-[18px]",
                ].join(" ")}>
                  {card.name}
                </h3>
              </div>
            </>
          );
          return (
            <motion.div
              key={card.key}
              initial={{ opacity: 0, y: 40 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true, amount: 0.2 }}
              transition={{ duration: 0.42, delay: idx * 0.08, ease: EASE_QUART }}
              className={isHero ? "col-span-2 md:col-span-1 lg:col-span-2" : "col-span-1"}
            >
              {card.categoryId != null ? (
                <Link
                  href={`/producers?category=${card.categoryId}`}
                  aria-label={t("home.categories.aria", { name: card.name })}
                  className={cardClassName}
                >
                  {cardBody}
                </Link>
              ) : (
                // id not resolved (categories loading / absent in this env) —
                // same visual, no dead link (MEH-1080).
                <div className={cardClassName}>{cardBody}</div>
              )}
            </motion.div>
          );
        })}
      </div>
    </section>
  );
}
