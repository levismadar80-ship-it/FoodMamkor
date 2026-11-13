"use client";

import { Link } from "@/i18n/navigation";
import Image from "next/image";
import { motion } from "framer-motion";
import { useRevealSkip } from "@/lib/route-memory";
import { useTranslations } from "next-intl";
import FadeInSection from "@/components/FadeInSection";
// MEH-2163: the no-photo glyph AND its fallback both come from the registry's
// total lookup. The local `Leaf` import that used to supply the fallback here
// is gone — same component, one owner.
import { resolveCategoryGlyph } from "@/lib/category-registry";
import SectionHeading from "@/components/ui/SectionHeading";

// MEH-643: ease-quart curve [0.25,1,0.5,1] mirrored for Framer (= .ease-quart, MEH-136).
const EASE_QUART = [0.25, 1, 0.5, 1];

/**
 * Category grid — Assembly v2 (MEH-643 chunk 2), navigation cards since
 * MEH-1080. Ten flat editorial cards in the 2-hero + 8-small asymmetric
 * layout: warm-white surface-card, 1px border, sharp corners, a geometric
 * glyph on a cream panel (MEH-683 unified set, keyed by canonical name;
 * Phosphor Leaf fallback only if a name is unmapped), and the category name
 * (= DB value verbatim). MEH-2441 removed the gold 01–10 numerals (Sapir 27/10:
 * a numbered list of things that aren't a sequence is the template tell).
 *
 * MEH-1080 [T-A] (MEH-1077 DISC-01): each card is a real <Link> to
 * /producers?category=<id> — navigable, crawlable, Back-able. The old
 * in-place homepage filtering (onCardClick → filter + scroll) is gone.
 * A card whose categoryId hasn't resolved yet (categories still loading,
 * or category absent in this environment) renders inert — same visual,
 * no dead link.
 *
 * Layout (MEH-3061): desktop ONE row of ten equal square cards · tablet 5×2 ·
 * phone ONE swipeable row of ten equal square cards, the third peeking as the
 * scroll cue (MEH-2412 — the old 2 full-width heroes + 2×4 stack cost ~1,400px
 * of scroll before the first business; same rail pattern as home-recent-rail).
 * No producer counters (LOCK).
 *
 * Does NOT: own the card set or id resolution (lib/home-categories.js) or
 * the glyph paths (CategoryIcons.jsx).
 *
 * Props:
 *   categoryCards: card[] joined with API category IDs (card.key/name/categoryId).
 *
 * History: PREMIUM_DESIGN (photo cards); MEH-643 (Assembly-v2 flat redesign);
 * MEH-1080 (buttons → links, 1:1 card↔category split); MEH-1183 (bridge
 * photos with a glyph/Leaf fallback — flat, NO scrim; the PREMIUM_DESIGN 65%
 * green overlay that leaked an Act+Acre logo is deliberately NOT
 * reintroduced); caption-strip layout — the photo lives in the top aspect
 * block and the caption (the name) sits on a solid surface-card
 * strip BELOW it (NN/g text-over-images pattern), so category names are never
 * illegible over a busy photo; a subtle motion-safe photo zoom on hover.
 */
export function HomeCategoryGrid({ categoryCards }) {
  const t = useTranslations();
  const skipReveal = useRevealSkip();
  return (
    <section className="max-w-7xl mx-auto px-4 section-y" data-testid="home-category-grid">
      <FadeInSection className="mb-10">
        {/* MEH-1032 (HOME-17): eyebrow+rule pattern mirrors HomeStaticBlocks §10 — DM-Sans, 32×1px gold rule, start-aligned. */}
        <span className="flex items-center gap-3 font-medium text-2xs text-accent mb-1">
          {t("home.categories.eyebrow")}
          <span className="inline-block w-8 h-px bg-accent" aria-hidden="true" />
        </span>
        <SectionHeading>
          {t("home.categories.heading")}
        </SectionHeading>
      </FadeInSection>

      {/* MEH-2412: phone = flex row that bleeds to the screen edges and
          snaps per card; from md it is the MEH-991 grid again. */}
      {/* MEH-2418: the entrance is driven ONCE by the rail entering the
          viewport vertically, and the cards stagger from that single trigger
          (variants). Per-card whileInView fired again for each card as it was
          SWIPED in sideways on a phone, so cards slid up late mid-swipe. */}
      <motion.div
        className="flex gap-3 overflow-x-auto pb-2 scrollbar-hide snap-x snap-proximity -mx-4 px-4 scroll-px-4 md:mx-0 md:px-0 md:pb-0 md:overflow-visible md:grid md:grid-cols-5 lg:grid-cols-10 md:gap-4"
        data-testid="home-category-rail"
        // MEH-2714: no replay on a back-navigation — `false` also reaches the
        // staggered children, which inherit `initial` through the variants.
        initial={skipReveal ? false : "hidden"}
        whileInView="show"
        viewport={{ once: true, amount: 0.1 }}
      >
        {categoryCards.map((card, idx) => {
          // MEH-683: the glyph map is keyed by canonical DB name. Cards carry
          // photos (MEH-1183) so this glyph is the no-photo fallback only.
          // MEH-2163: total lookup — `LineArt` is never undefined; `isFallback`
          // says whether it is the registry fallback (rendered lighter, below).
          const { glyph: LineArt, isFallback: glyphIsFallback } =
            resolveCategoryGlyph(card);
          const cardClassName = [
            // MEH-3061 (Sapir 13/11): no card frame — a photo with its name under
            // it reads as navigation, not as one more business card (the business
            // cards right below are framed). The photo carries the radius.
            "group relative flex flex-col h-full rounded-md focus-ring",
          ].join(" ");
          // MEH-3061: every card is the phone's 1:1 tile at every width — the
          // desktop 2-hero + 8 grid (MEH-991 aspect matrix) is gone; it put the
          // first business ~2,100px down at 1440.
          const aspectClassName = "aspect-square rounded-md overflow-hidden";
          // Display-font name. Shared by the photo and glyph paths so the
          // tokens/position stay identical.
          const caption = (
            <>
              <h3 className={[
                // MEH-991 (HOME-15) hover: 1px gold underline + photo zooms scale-1.05
                // (photo path only, motion-safe); glyph never scales. MEH-3061: no border.
                "font-headline-md font-bold text-text leading-tight group-hover:underline decoration-accent decoration-1 underline-offset-4",
                "text-base lg:text-sm [overflow-wrap:anywhere]",
              ].join(" ")}>
                {card.name}
              </h3>
            </>
          );
          const cardBody = card.image ? (
            <>
              {/* MEH-1183: bridge photo in the top block — flat, NO
                  overlay/scrim/gradient/tint (the deleted PREMIUM_DESIGN version
                  put a 65% green scrim here; forbidden now — legibility comes from
                  moving the caption OFF the photo, never a tint). The relative +
                  overflow-hidden aspect wrapper both locks the frame proportion
                  (zero CLS) and clips the motion-safe hover zoom. alt = Hebrew
                  category name. */}
              <div className={["relative overflow-hidden", aspectClassName].join(" ")} data-testid="home-category-image-frame">
                <Image
                  data-testid="home-category-image"
                  src={card.image}
                  alt={card.name}
                  fill
                  sizes="(min-width: 1024px) 112px, (min-width: 768px) 20vw, 144px"
                  className="object-cover transition-transform duration-base ease-quart motion-safe:group-hover:scale-105"
                  priority={idx < 2}
                />
              </div>
              {/* Caption strip — solid surface-card (from the card bg), sits BELOW
                  the photo so the name is never over a busy image.
                  Same tokens/position as the glyph path. */}
              <div className="flex items-baseline gap-3 pt-2" data-testid="home-category-caption">
                {caption}
              </div>
            </>
          ) : (
            <>
              {/* Glyph panel — cream background, geometric line glyph in brand
                  green (MEH-683 unified set); Phosphor Leaf if name is unmapped. */}
              <div className={["grid place-items-center bg-background text-primary", aspectClassName].join(" ")} data-testid="home-category-image-frame">
                {glyphIsFallback ? (
                  <LineArt weight="thin" className="w-16 h-16 lg:w-12 lg:h-12 max-w-[50%] max-h-[50%]" aria-hidden="true" />
                ) : (
                  <LineArt className="w-16 h-16 lg:w-12 lg:h-12 max-w-[50%] max-h-[50%]" />
                )}
              </div>

              {/* Body — display-font name. */}
              <div className="flex items-baseline gap-3 pt-2" data-testid="home-category-caption">
                {caption}
              </div>
            </>
          );
          return (
            <motion.div
              key={card.key}
              variants={{
                hidden: { opacity: 0, y: 40 },
                show: { opacity: 1, y: 0, transition: { duration: 0.42, delay: idx * 0.08, ease: EASE_QUART } },
              }}
              // MEH-2412: fixed-width snap tile on a phone; an equal grid cell
              // from md (MEH-3061: 5×2 tablet, one row of ten from lg).
              className="shrink-0 w-36 snap-start md:w-auto"
            >
              {card.categoryId != null ? (
                <Link
                  href={`/producers?category=${card.categoryId}`}
                  aria-label={t("home.categories.aria", { name: card.name })}
                  className={cardClassName}
                  data-testid="home-category-card"
                >
                  {cardBody}
                </Link>
              ) : (
                // id not resolved (categories loading / absent in this env) —
                // same visual, no dead link (MEH-1080).
                <div className={cardClassName} data-testid="home-category-card">{cardBody}</div>
              )}
            </motion.div>
          );
        })}
      </motion.div>
    </section>
  );
}
