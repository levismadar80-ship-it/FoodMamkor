"use client";

import { motion } from "framer-motion";
import { CaretDown, Crosshair } from "@phosphor-icons/react";
import { useTranslations } from "next-intl";
import HeroSearch from "@/components/HeroSearch";
import { optimizeCloudinary } from "@/lib/cloudinary";

// MEH-788: Cloudinary produce photo (4032×3024 original). f_auto,q_auto via the
// helper + w_1920,c_limit (parity with the previous Unsplash w=1920 cap — the
// raw original is ~1.7MB). No baked ar — background-size:cover crops
// responsively per breakpoint, so one asset serves portrait mobile and
// landscape desktop without distortion.
// REUSES: app/[locale]/login/LoginClient.jsx:104 (optimizeCloudinary, no-ar pattern)
const HERO_IMAGE = optimizeCloudinary(
  "https://res.cloudinary.com/dfzpscjks/image/upload/home/hero-produce.jpg",
  { width: 1920 }
);

// MEH-643: ease-quart curve mirrored for Framer (JS) — same as the .ease-quart
// CSS utility (MEH-136, globals.css). Durations mirror .duration-base (.42s) /
// .duration-slow (.64s); CSS-driven hovers below use the .duration-*/.ease-quart classes.
const EASE_QUART = [0.25, 1, 0.5, 1];

/**
 * Hero section — Assembly v2 (MEH-643 chunk 1). Full-bleed Ken Burns produce
 * photo (MEH-788) with
 * a display-font headline, pill search (HeroSearch, MEH-99), a primary CTA
 * (גלו עסקים → scrolls to #producers-grid via onScrollDown), the inline near-me
 * geolocation control (MEH-41 behavior), and a "how it works" anchor link
 * (scrolls to #how-it-works). Consumes MEH-136 tokens (action-primary,
 * surface-card, .focus-ring, .duration-base/.ease-quart); no raw content hex.
 *
 * Does NOT: own search routing (HeroSearch), own the near-me handler
 * (onNearMe from use-home-page), or restyle the navbar (later MEH-643 chunk).
 *
 * Background motion is the kenburns-right layer (globals.css) — same Ken Burns
 * treatment as ParallaxQuote, opposite direction so the hero doesn't drift in
 * lock-step with the kenburns-left dividers below it. Honors
 * prefers-reduced-motion (animation: none → static image). MEH-788 replaced
 * the previous .hero-parallax background-attachment:fixed approach.
 *
 * History: MEH-99 (HeroSearch), MEH-41 (near-me), MEH-643 (Assembly-v2
 * redesign), MEH-788 (Cloudinary produce bg + Ken Burns).
 */
export function HomeHero({ fridayMode, geoLoading, onNearMe, onScrollDown }) {
  const t = useTranslations();
  // Mirrors the use-home-page.js scrollToProducers pattern (getElementById +
  // smooth scroll); target id added on HomeHowItWorks (HomeStaticBlocks.jsx).
  const scrollToHowItWorks = () =>
    document.getElementById("how-it-works")?.scrollIntoView({ behavior: "smooth" });

  return (
    <section
      className="relative w-full"
      aria-label={t("home.hero.main_label")}
      style={{ height: "100vh" }}
    >
      {/* Clip wrapper — confines the oversized Ken Burns layer WITHOUT putting
          overflow-hidden on the section itself: HeroSearch's dropdown
          (absolute top-full, max-h-[70vh]) must stay free to overflow past the
          hero's bottom edge, as it did before MEH-788. */}
      <div className="absolute inset-0 overflow-hidden" aria-hidden="true">
        {/* Ken Burns background layer — decorative produce photo. inset -5%
            gives the 1.08 zoom drift room without exposing edges.
            REUSES: components/ParallaxQuote.jsx:36 (kenburns layer + inset -5%) */}
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

      {/* Scrim — same forest green as ParallaxQuote's overlay (46,74,46),
          kept as a bottom-weighted gradient: ≥0.65 alpha across the whole
          text/CTA zone (bottom half) for AA legibility over the busy produce
          photo, fading up so the image reads at the top. Alpha gradient —
          not tokenizable with the hex-only token set. */}
      <div
        className="absolute inset-0"
        style={{
          background:
            "linear-gradient(to top, rgba(46,74,46,0.88) 0%, rgba(46,74,46,0.65) 50%, rgba(0,0,0,0.10) 100%)",
        }}
        aria-hidden="true"
      />

      {/* Text anchored to bottom 25% of hero. inset-x-0 = symmetric full-width span. */}
      <div
        className="absolute inset-x-0 text-center px-4 text-white"
        style={{ bottom: "25%" }}
      >
        <motion.h1
          initial={{ opacity: 0, y: 60 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.64, ease: EASE_QUART }}
          className="font-headline-display font-bold leading-tight text-[clamp(28px,8vw,52px)] md:text-[clamp(42px,6vw,80px)]"
          style={{ lineHeight: 1.15 }}
        >
          {t("home.hero.title")}
        </motion.h1>

        <motion.p
          initial={{ opacity: 0, y: 30 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.64, delay: 0.1, ease: EASE_QUART }}
          className="font-body-lg text-body-lg mt-3 text-green-50"
        >
          {fridayMode ? t("home.hero.friday_subtitle") : t("home.hero.subtitle")}
        </motion.p>

        {/* Pill search — MEH-99 HeroSearch routes to /producers?q=. surface-card
            (MEH-136) is the warm-white pill surface. */}
        <motion.div
          initial={{ opacity: 0, y: 30 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.42, delay: 0.2, ease: EASE_QUART }}
          role="search"
          aria-label={t("home.hero.search_area_label")}
          className="mx-auto mt-8 bg-surface-card shadow-lg px-6 py-3.5"
          style={{ borderRadius: "50px", width: "min(580px, 88vw)" }}
        >
          <HeroSearch
            placeholder={t("home.search.placeholder")}
            srLabel={t("home.search.sr_label")}
            className="w-full"
          />
        </motion.div>

        {/* Actions row — primary CTA (גלו עסקים) + near-me (MEH-41). gap/flex are
            direction-neutral (RTL-safe). */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.42, delay: 0.4, ease: EASE_QUART }}
          className="mt-6 flex flex-wrap items-center justify-center gap-3"
        >
          {/* CTA reuses onScrollDown (= scrollToProducers); overlap with the
              scroll caret is an accepted minor UX overlap for this chunk. */}
          <button
            type="button"
            onClick={onScrollDown}
            className="bg-action-primary hover:bg-action-primary-hover text-white font-medium text-sm px-6 py-2.5 rounded-full transition-colors duration-base ease-quart focus-ring"
          >
            {/* TODO i18n EN (extends MEH-472): real translation for new hero keys
                (cta_primary, how_it_works) — currently HE-mirrored in en.json. */}
            {t("home.hero.cta_primary")}
          </button>

          <button
            type="button"
            onClick={onNearMe}
            disabled={geoLoading}
            className="inline-flex items-center gap-2 bg-white/15 backdrop-blur-sm text-white border border-white/30 px-5 py-2.5 rounded-full hover:bg-white/25 transition-colors duration-base ease-quart font-medium text-sm disabled:opacity-50 focus-ring"
          >
            <Crosshair size={18} weight="bold" className={geoLoading ? "animate-spin" : ""} aria-hidden="true" />
            {geoLoading ? t("home.hero.searching") : t("home.hero.near_me")}
          </button>
        </motion.div>

        {/* "How it works" anchor link → #how-it-works (HomeHowItWorks). */}
        <motion.div
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.42, delay: 0.55, ease: EASE_QUART }}
          className="mt-4"
        >
          <button
            type="button"
            onClick={scrollToHowItWorks}
            className="text-green-50 hover:text-white underline underline-offset-4 text-sm transition-colors duration-base ease-quart focus-ring rounded"
          >
            {t("home.hero.how_it_works")}
          </button>
        </motion.div>
      </div>

      {/*
        Scroll arrow — subtle slow fade+glide (PREMIUM_DESIGN: no bounce easing).
        `scroll-hint` keyframe lives in globals.css and respects
        prefers-reduced-motion.

        rtl-ok: horizontal-center idiom (canonical exception in
        .claude/rules/rtl.md). Inline style emits identical CSS and avoids the
        RTL hook's literal Tailwind class match.
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
