"use client";

import { motion } from "framer-motion";
import FadeInSection from "@/components/FadeInSection";
import { CATEGORY_ICONS } from "@/components/CategoryIcons";

/**
 * Category grid — six cards with parallax background images and
 * hand-drawn SVG line-art icons. Clicking a card sets the category
 * filter on the homepage and scrolls to the producers grid.
 *
 * Props:
 *   categoryCards: ReturnType<typeof matchCategoryId> — cards already
 *     joined with API category IDs.
 *   onCardClick: (card) => void — invoked on card press.
 */
export function HomeCategoryGrid({ categoryCards, onCardClick }) {
  return (
    <section className="max-w-7xl mx-auto px-4 section-y">
      <FadeInSection className="text-center mb-10">
        <h2 className="font-headline font-bold text-site-text mb-2" style={{ fontSize: "clamp(32px, 4vw, 48px)" }}>
          גלי לפי קטגוריה
        </h2>
        <p className="text-site-muted text-base">ישר מבית העסק — בלי מתווכים</p>
      </FadeInSection>
      <div
        className="grid grid-cols-2 md:grid-cols-2 lg:grid-cols-3"
        style={{ gap: "20px" }}
      >
        {categoryCards.map((card, idx) => {
          // PREMIUM_DESIGN: hand-drawn line-art icon per category.
          const LineArt = CATEGORY_ICONS[card.key];
          return (
            <motion.button
              key={card.key}
              initial={{ opacity: 0, y: 40 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true, amount: 0.2 }}
              transition={{ duration: 0.6, delay: idx * 0.08, ease: [0.25, 0.46, 0.45, 0.94] }}
              onClick={() => onCardClick(card)}
              className="group relative overflow-hidden cursor-pointer text-right h-[140px] md:h-[280px]"
              style={{
                borderRadius: "16px",
                backgroundImage: `url(${card.image})`,
                backgroundSize: "cover",
                backgroundPosition: "center",
              }}
              aria-label={`הצג קטגוריה: ${card.name}`}
            >
              {/* Zooming bg layer — use transform on a pseudo-ish wrapper by scaling the button via group-hover */}
              <div
                className="absolute inset-0 transition-all duration-500 ease-out"
                style={{ backgroundColor: "rgba(46,104,83,0.65)" }}
              />
              <div className="absolute inset-0 opacity-0 group-hover:opacity-100 transition-all duration-500 ease-out"
                style={{ backgroundColor: "rgba(46,104,83,0.45)" }}
              />
              <div className="relative z-10 h-full w-full flex flex-col items-center justify-center text-white transition-transform duration-500 ease-out group-hover:scale-[1.06]">
                {LineArt && <LineArt size={64} className="w-8 h-8 md:w-16 md:h-16" stroke="white" strokeWidth={1.75} />}
                <h3 className="font-headline font-bold mt-2 md:mt-3 text-[22px]">
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
