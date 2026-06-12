"use client";

import { motion } from "framer-motion";
import { Crosshair } from "@phosphor-icons/react";
import { useTranslations } from "next-intl";
import HeroSearch from "@/components/HeroSearch";
import { optimizeCloudinary } from "@/lib/cloudinary";

// MEH-788: Cloudinary produce photo (4032×3024 original). f_auto,q_auto via the
// helper + w_1920,c_limit. No baked ar — background-size:cover crops responsively
// per breakpoint (4:5 mobile box → 16:9 desktop box) without distortion.
// REUSES: app/[locale]/login/LoginClient.jsx:104 (optimizeCloudinary, no-ar pattern)
const HERO_MAX_WIDTH = 1920;
const HERO_IMAGE = optimizeCloudinary(
  "https://res.cloudinary.com/dfzpscjks/image/upload/home/hero-produce.jpg",
  { width: HERO_MAX_WIDTH }
);

// MEH-643: ease-quart curve mirrored for Framer (JS) — same as the .ease-quart
// CSS utility (MEH-136, globals.css). Reduced-motion honored globally via
// <MotionConfig reducedMotion="user"> at the layout root (#1053).
const EASE_QUART = [0.25, 1, 0.5, 1];

/**
 * Hero section — S14 "Photography + Texture" composition (MEH-788 Phase 3).
 *
 * Full-bleed Ken Burns produce photo, height-capped (4:5 mobile → 16:9 desktop,
 * cap 560px) — NOT 100vh. S14 hero discipline: only the FRL-900 headline +
 * subtitle ride the `--scrim-ink` band on the photo; the pill search card then
 * rides the photo seam DOWN onto cream (negative margin overlap), and the CTAs
 * (גלו עסקים → #producers-grid · near-me MEH-41 · "how it works") land fully on
 * cream — far less overlay surface, AA for free.
 *
 * Ken Burns = the kenburns-right layer (globals.css), opposite direction to the
 * kenburns-left dividers below; honors prefers-reduced-motion (animation:none).
 *
 * Does NOT: own search routing (HeroSearch), own the near-me handler
 * (onNearMe from use-home-page), or restyle the navbar (parallel track).
 *
 * History: MEH-99 (HeroSearch), MEH-41 (near-me), MEH-643 (Assembly-v2),
 * MEH-788 (#1055 Cloudinary+KB · #1063 scrim token · S14 capped-hero + cream
 * search/CTAs).
 */
export function HomeHero({ fridayMode, geoLoading, onNearMe, onScrollDown }) {
  const t = useTranslations();
  // Mirrors the use-home-page.js scrollToProducers pattern (getElementById +
  // smooth scroll); target id added on HomeHowItWorks (HomeStaticBlocks.jsx).
  const scrollToHowItWorks = () =>
    document.getElementById("how-it-works")?.scrollIntoView({ behavior: "smooth" });

  return (
    <>
      {/* 01 · HERO — capped full-bleed IMG-02 + --scrim-ink. H1 + subtitle only. */}
      <section
        className="relative isolate w-full overflow-hidden aspect-[4/5] md:aspect-auto md:h-[560px]"
        aria-label={t("home.hero.main_label")}
      >
        {/* Ken Burns layer — decorative produce photo. inset -5% gives the
            ≤1.08 zoom drift room. REUSES: components/ParallaxQuote.jsx:36 */}
        <div className="absolute inset-0 overflow-hidden" aria-hidden="true">
          <div
            className="kenburns-right absolute"
            style={{
              inset: "-5%",
              backgroundImage: `url(${HERO_IMAGE})`,
              backgroundSize: "cover",
              backgroundPosition: "center",
              backgroundRepeat: "no-repeat",
            }}
          />
        </div>

        {/* --scrim-ink (globals.css) — warm-ink bottom band; H1 + subtitle stay
            ≥ AA over any crop. */}
        <div className="scrim-ink absolute inset-0" aria-hidden="true" />

        {/* Text — bottom-anchored on the scrim; centered mobile, start (RTL
            right) desktop. pb leaves room for the search card's seam overlap. */}
        <div className="absolute inset-x-0 bottom-0 px-4 md:px-12 pb-16 md:pb-20 text-white">
          <div className="max-w-2xl mx-auto md:mx-0 text-center md:text-start">
            <motion.h1
              initial={{ opacity: 0, y: 40 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.64, ease: EASE_QUART }}
              className="font-headline-display font-bold leading-tight text-[clamp(28px,8vw,52px)] md:text-hero-display max-w-[18ch] mx-auto md:mx-0"
              style={{ lineHeight: 1.12 }}
            >
              {t("home.hero.title")}
            </motion.h1>
            <motion.p
              initial={{ opacity: 0, y: 24 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.64, delay: 0.1, ease: EASE_QUART }}
              className="font-body-lg text-body-lg mt-3 text-green-50"
            >
              {fridayMode ? t("home.hero.friday_subtitle") : t("home.hero.subtitle")}
            </motion.p>
          </div>
        </div>
      </section>

      {/* Search card — rides the photo seam DOWN onto cream (negative overlap).
          MEH-99 HeroSearch routes to /producers?q=. Lives OUTSIDE the
          overflow-hidden photo section so its dropdown can overflow freely. */}
      <motion.div
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.42, delay: 0.2, ease: EASE_QUART }}
        role="search"
        aria-label={t("home.hero.search_area_label")}
        className="relative z-10 mx-auto -mt-8 md:-mt-10 bg-surface-card shadow-lg px-6 py-3.5"
        style={{ borderRadius: "50px", width: "min(580px, calc(100% - 2rem))" }}
      >
        <HeroSearch
          placeholder={t("home.search.placeholder")}
          srLabel={t("home.search.sr_label")}
          className="w-full"
        />
      </motion.div>

      {/* Actions — on cream (re-coloured from the on-photo treatment): primary
          CTA (גלו עסקים) + near-me (MEH-41) + "how it works". */}
      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.42, delay: 0.34, ease: EASE_QUART }}
        className="mt-5 px-4 flex flex-wrap items-center justify-center gap-3"
      >
        <button
          type="button"
          onClick={onScrollDown}
          className="bg-action-primary hover:bg-action-primary-hover text-white font-medium text-sm px-6 py-2.5 rounded-full transition-colors duration-base ease-quart focus-ring"
        >
          {t("home.hero.cta_primary")}
        </button>

        <button
          type="button"
          onClick={onNearMe}
          disabled={geoLoading}
          className="inline-flex items-center gap-2 bg-surface-card text-primary-dark border border-border px-5 py-2.5 rounded-full hover:bg-green-50 transition-colors duration-base ease-quart font-medium text-sm disabled:opacity-50 focus-ring"
        >
          <Crosshair size={18} weight="bold" className={geoLoading ? "animate-spin" : ""} aria-hidden="true" />
          {geoLoading ? t("home.hero.searching") : t("home.hero.near_me")}
        </button>

        <button
          type="button"
          onClick={scrollToHowItWorks}
          className="text-primary hover:text-primary-dark underline underline-offset-4 text-sm transition-colors duration-base ease-quart focus-ring rounded"
        >
          {t("home.hero.how_it_works")}
        </button>
      </motion.div>
    </>
  );
}
