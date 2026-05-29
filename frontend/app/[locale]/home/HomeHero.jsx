"use client";

import { motion } from "framer-motion";
import { CaretDown, Crosshair } from "@phosphor-icons/react";
import { useTranslations } from "next-intl";
import HeroSearch from "@/components/HeroSearch";

// OPTIMIZE: `auto=format` → Unsplash serves WebP/AVIF when supported;
// `q=80` drops ~30% bytes with no perceptible quality loss on a parallax bg.
const HERO_IMAGE = "https://images.unsplash.com/photo-1542838132-92c53300491e?w=1920&auto=format&q=80&fm=webp";

/**
 * Hero section — gardensweet.com style parallax with animated headline,
 * pill search, "near me" geolocation button, and a scroll-down arrow.
 *
 * background-attachment: fixed is the CSS parallax (spec §Hero).
 * .hero-parallax sets fixed; @media (pointer: coarse) falls back to
 * scroll because iOS Safari silently ignores fixed.
 */
export function HomeHero({ fridayMode, geoLoading, onNearMe, onScrollDown }) {
  const t = useTranslations();
  return (
    <section
      className="relative w-full hero-parallax"
      aria-label={t("home.hero.main_label")}
      style={{
        height: "100vh",
        backgroundImage: `url(${HERO_IMAGE})`,
        backgroundSize: "cover",
        backgroundPosition: "center",
        backgroundRepeat: "no-repeat",
      }}
    >
      {/* Gradient overlay — dark at bottom, fading up */}
      <div
        className="absolute inset-0"
        style={{
          background:
            "linear-gradient(to top, rgba(46,74,46,0.88) 0%, rgba(46,74,46,0.40) 50%, rgba(0,0,0,0.10) 100%)",
        }}
      />

      {/* Text anchored to bottom 25% of hero. inset-x-0 = symmetric full-width span. */}
      <div
        className="absolute inset-x-0 text-center px-4 text-white"
        style={{ bottom: "25%" }}
      >
        <motion.h1
          initial={{ opacity: 0, y: 60 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.9, ease: [0.25, 0.46, 0.45, 0.94] }}
          className="font-headline-display font-bold leading-tight text-[clamp(28px,8vw,52px)] md:text-[clamp(42px,6vw,80px)]"
          style={{ lineHeight: 1.15 }}
        >
          {t("home.hero.title")}
        </motion.h1>
        <motion.p
          initial={{ opacity: 0, y: 30 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.9, delay: 0.2, ease: [0.25, 0.46, 0.45, 0.94] }}
          className="font-body-md mt-3 text-green-50"
          style={{
            fontSize: "18px",
            letterSpacing: "0.12em",
            textTransform: "uppercase",
          }}
        >
          {fridayMode ? t("home.hero.friday_subtitle") : t("home.hero.subtitle")}
        </motion.p>

        {/* Pill search */}
        <motion.div
          initial={{ opacity: 0, y: 30 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.9, delay: 0.4, ease: [0.25, 0.46, 0.45, 0.94] }}
          role="search"
          aria-label={t("home.hero.search_area_label")}
          className="mx-auto mt-8 bg-white shadow-lg px-6 py-3.5"
          style={{ borderRadius: "50px", width: "min(580px, 88vw)" }}
        >
          {/* MEH-99: HeroSearch routes to /producers?q= for filtered listing.
              SmartSearch (routes to /search?q= results page) is retained
              in the site header for secondary navigation. */}
          <HeroSearch
            placeholder={t("home.search.placeholder")}
            srLabel={t("home.search.sr_label")}
            className="w-full"
          />
        </motion.div>

        {/* "Near me" geolocation button — task 11 */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.7, delay: 0.6, ease: [0.25, 0.46, 0.45, 0.94] }}
          className="mt-4"
        >
          <button
            type="button"
            onClick={onNearMe}
            disabled={geoLoading}
            className="inline-flex items-center gap-2 bg-white/15 backdrop-blur-sm text-white border border-white/30 px-5 py-2.5 rounded-full hover:bg-white/25 transition font-medium text-sm disabled:opacity-50"
          >
            <Crosshair size={18} weight="bold" className={geoLoading ? "animate-spin" : ""} aria-hidden="true" />
            {geoLoading ? t("home.hero.searching") : t("home.hero.near_me")}
          </button>
        </motion.div>
      </div>

      {/*
        Scroll arrow — animate-bounce replaced with a subtle slow
        fade+glide (PREMIUM_DESIGN rule: no bounce easing). The
        `scroll-hint` keyframe lives in globals.css and respects
        prefers-reduced-motion.

        rtl-ok: horizontal-center idiom (canonical exception in
        .claude/rules/rtl.md). Inline style emits the identical CSS
        and avoids the RTL hook's literal Tailwind class match.
      */}
      <button
        type="button"
        onClick={onScrollDown}
        className="absolute text-white/70 hover:text-white transition-opacity scroll-hint"
        style={{ bottom: "32px", left: "50%", transform: "translateX(-50%)" }}
        aria-label={t("home.hero.scroll_down_label")}
      >
        <CaretDown size={28} weight="bold" aria-hidden="true" />
      </button>
    </section>
  );
}
