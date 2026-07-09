"use client";

import { motion } from "framer-motion";
import { useTranslations } from "next-intl";
import FadeInSection from "@/components/FadeInSection";
import { CATEGORY_ICONS } from "@/components/CategoryIcons";

// MEH-643: ease-quart curve [0.25,1,0.5,1] mirrored for Framer (= .ease-quart, MEH-136).
const EASE_QUART = [0.25, 1, 0.5, 1];

/**
 * Category grid — Assembly v2 (MEH-643 chunk 2). Six flat editorial cards in a
 * 2+4 asymmetric layout: 2 hero cards (cat 01-02) + 4 small (03-06). Each card
 * = warm-white surface-card with a 1px border, sharp corners (no radius, no
 * shadow), a hand-drawn glyph on a cream panel, a gold Cormorant-italic numeral
 * (01-06, LTR-isolated), and the category name.
 *
 * Layout: desktop 2+4 (4-col grid, hero span-2) · tablet 2×3 uniform · mobile
 * 2+4 (hero full-width, 4 small in 2×2). No producer counters (LOCK).
 *
 * Does NOT: own routing (onCardClick → use-home-page sets the filter + scrolls
 * to #producers-grid) or own the glyph paths (CategoryIcons.jsx).
 *
 * Props:
 *   categoryCards: card[] joined with API category IDs (card.key/name/categoryId).
 *   onCardClick: (card) => void.
 *   selectedCategory: string — the active filters.category; a card is "selected"
 *     when String(card.categoryId) === selectedCategory.
 *
 * History: PREMIUM_DESIGN (photo cards); MEH-643 (Assembly-v2 flat 2+4 redesign).
 */
export function HomeCategoryGrid({ categoryCards, onCardClick, selectedCategory }) {
  const t = useTranslations();
  return (
    <section className="max-w-7xl mx-auto px-4 section-y">
      <FadeInSection className="mb-10">
        {/* MEH-1032 (HOME-17): eyebrow+rule pattern mirrors HomeStaticBlocks §10 — DM-Sans, 32×1px gold rule, start-aligned. */}
        <span className="flex items-center gap-3 font-medium text-[11px] tracking-[0.18em] text-accent mb-1">
          {t("home.categories.eyebrow")}
          <span className="inline-block w-8 h-px bg-accent" aria-hidden="true" />
        </span>
        <h2 className="font-headline-display font-bold text-text" style={{ fontSize: "clamp(32px, 4vw, 48px)" }}>
          {t("home.categories.heading")}
        </h2>
      </FadeInSection>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 md:gap-4 lg:gap-6">
        {categoryCards.map((card, idx) => {
          const LineArt = CATEGORY_ICONS[card.key];
          const isHero = idx < 2;
          const selected = card.categoryId != null && String(card.categoryId) === selectedCategory;
          const numeral = String(idx + 1).padStart(2, "0");
          return (
            <motion.button
              key={card.key}
              initial={{ opacity: 0, y: 40 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true, amount: 0.2 }}
              transition={{ duration: 0.42, delay: idx * 0.08, ease: EASE_QUART }}
              onClick={() => onCardClick(card)}
              aria-pressed={selected}
              aria-label={t("home.categories.aria", { name: card.name })}
              className={[
                "group flex flex-col bg-surface-card border transition-colors duration-base ease-quart focus-ring",
                selected ? "border-primary" : "border-border hover:border-primary",
                isHero ? "col-span-2 md:col-span-1 lg:col-span-2" : "col-span-1",
              ].join(" ")}
            >
              {/* Glyph panel — cream background, hand-drawn line glyph in brand green. */}
              <div
                className={[
                  "grid place-items-center bg-background text-primary",
                  // MEH-991 (HOME-18): v8 aspect matrix — small 1:1 desktop+mobile / 4:3 tablet; hero mobile 16:7.
                  isHero ? "aspect-[16/7] md:aspect-[4/3] lg:aspect-[16/9]" : "aspect-square md:aspect-[4/3] lg:aspect-square",
                ].join(" ")}
              >
                {LineArt && (
                  <LineArt
                    className={
                      isHero
                        ? "w-24 h-24 lg:w-[120px] lg:h-[120px]"
                        : "w-16 h-16"
                    }
                  />
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
            </motion.button>
          );
        })}
      </div>
    </section>
  );
}
