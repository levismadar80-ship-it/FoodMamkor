"use client";

import { useMemo } from "react";
import { motion } from "framer-motion";
import { Crosshair, SealCheck } from "@phosphor-icons/react";
import { useTranslations } from "next-intl";
import HeroSearch from "@/components/HeroSearch";
import { optimizeCloudinary } from "@/lib/cloudinary";

// MEH-788: Cloudinary produce photo (4032×3024 4:3 original). Smart-cropped to
// a wide 16:9 band via g_auto (c_fill,g_auto,ar_16:9 — Cloudinary's saliency
// model) so the produce is framed intentionally, NOT center-sliced: a downward-
// angle 4:3 source under CSS center-cover sliced the crate-tops. CSS cover then
// fills the height-capped band from the g_auto-framed, subject-centered 16:9, so
// the produce survives the final crop on both mobile + desktop. w_1920 downscales
// the 4032 original (never upscales). f_auto,q_auto via the helper.
// REUSES: components/ProducerCard.jsx (optimizeCloudinary aspectRatio + g_auto)
const HERO_MAX_WIDTH = 1920;
const HERO_IMAGE = optimizeCloudinary(
  "https://res.cloudinary.com/dfzpscjks/image/upload/home/hero-produce.jpg",
  { aspectRatio: "16:9", width: HERO_MAX_WIDTH }
);

// MEH-643: ease-quart curve mirrored for Framer (JS) — same as the .ease-quart
// CSS utility (MEH-136, globals.css). Reduced-motion honored globally via
// <MotionConfig reducedMotion="user"> at the layout root (#1053).
const EASE_QUART = [0.25, 1, 0.5, 1];

// MEH-1684: the ONE chip style for the hero row. Ghost by construction — a
// hairline primary border at 35% and primary text, never a fill, so the
// circular search submit keeps MEH-1369's single-filled-primary slot. Shared
// as a constant (not duplicated per button) so a future chip cannot drift into
// a second style, which is the exact failure this ticket is undoing.
const CHIP_CLASS =
  "inline-flex items-center gap-2 rounded-full border border-primary/35 text-primary " +
  "px-4 py-2.5 hover:bg-green-50 transition-colors duration-base ease-quart " +
  "font-medium text-sm disabled:opacity-50 focus-ring";

/**
 * Hero section — S14 "Photography + Texture" composition (MEH-788 Phase 3).
 *
 * Full-bleed Ken Burns produce photo, height-capped (mobile ~44svh ≤360px /
 * desktop ~44svh 380–440px) — NOT 100vh, and short enough that the bottom-
 * overlaid headline + the seam-riding search + CTAs all clear a ~700–800px
 * laptop fold on load (MEH-788: 560px was too tall once search went in-flow).
 * S14 hero discipline: only the FRL-900 headline +
 * subtitle ride the `--scrim-ink` band on the photo; the pill search card then
 * rides the photo seam DOWN onto cream (negative margin overlap), and the chips
 * row (near-me MEH-41 · delivery-to-me MEH-1643) plus the trust line and the
 * "how it works" link land fully on cream — far less overlay surface, AA free.
 *
 * Ken Burns = the kenburns-right layer (globals.css), opposite direction to the
 * kenburns-left dividers below; honors prefers-reduced-motion (animation:none).
 *
 * Does NOT: own search routing (HeroSearch), own the near-me handler
 * (onNearMe from use-home-page), own the delivery-CTA city logic
 * (onDeliveryCta from use-home-page — city apply vs LocationModal open),
 * or restyle the navbar (parallel track).
 *
 * History: MEH-99 (HeroSearch), MEH-41 (near-me), MEH-643 (Assembly-v2),
 * MEH-788 (#1055 Cloudinary+KB · #1063 scrim token · S14 capped-hero + cream
 * search/CTAs), MEH-1288 (surprise-me button beside near-me),
 * MEH-1476 (surprise-me relocated to the producers-grid end),
 * MEH-1643 (delivery-to-me ghost CTA beside near-me — 4-item CTA row:
 * filled primary + near-me ghost + delivery ghost + "how it works" link;
 * label is dynamic: "משלוחים ל{city}" when localStorage user_city is set),
 * MEH-1684 (search-zone redesign — see below).
 *
 * MEH-1684 — the zone speaks ONE affordance language:
 *   · search = a full white pill (rounded-full, one soft shadow) with a
 *     circular filled submit inside it. It is the zone's ONLY primary CTA, so
 *     the solid "גלו בתי עסק" button that used to open the row is GONE (search
 *     is how you discover; `onScrollDown` therefore left this component's API).
 *   · the row below is now CHIPS, not CTAs — one ghost style (rounded-full,
 *     border primary/35, text primary) behind a muted editorial prefix. Both
 *     chips keep their pre-existing wiring untouched: near-me is still MEH-41
 *     geolocation, delivery is still MEH-1643's user_city path. Restyle only.
 *   · a trust line (SealCheck, accent gold) carries the differentiator above
 *     the fold, and "איך זה עובד" moved OUT of the row to sit under it — an
 *     underlined text link inside a chip row was the third affordance language
 *     in one strip, which is what made the row unreadable.
 * MEH-1369's "exactly ONE filled primary" invariant is preserved, now with the
 * circular submit holding that slot instead of a scroll button.
 */
export function HomeHero({
  fridayMode,
  geoLoading,
  onNearMe,
  onDeliveryCta,
  userCity,
}) {
  const t = useTranslations();
  // MEH-1684: rotating placeholder pool. Memoised so HeroSearch's rotation
  // effect isn't torn down and re-armed on every parent render.
  const searchPlaceholders = useMemo(
    () => [
      t("home.search.placeholders.q1"),
      t("home.search.placeholders.q2"),
      t("home.search.placeholders.q3"),
      t("home.search.placeholders.q4"),
    ],
    [t]
  );
  // Mirrors the use-home-page.js scrollToProducers pattern (getElementById +
  // smooth scroll); target id added on HomeHowItWorks (HomeStaticBlocks.jsx).
  const scrollToHowItWorks = () =>
    document.getElementById("how-it-works")?.scrollIntoView({ behavior: "smooth" });

  return (
    <>
      {/* 01 · HERO — capped full-bleed IMG-02 + --scrim-ink. H1 + subtitle only. */}
      <section
        className="relative isolate w-full overflow-hidden h-[clamp(300px,44svh,360px)] md:h-[clamp(380px,44svh,440px)]"
        aria-label={t("home.hero.main_label")}
      >
        {/* Ken Burns layer — decorative produce photo. inset -5% gives the
            ≤1.06 zoom drift room. (The ParallaxQuote.jsx REUSES anchor that
            was here died with that component — MEH-1567.) */}
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
        <div className="absolute inset-x-0 bottom-0 px-4 md:px-12 pb-12 md:pb-16 text-white">
          <div className="max-w-2xl mx-auto md:mx-0 text-center md:text-start">
            {/* MEH-788: above-the-fold hero content must NOT gate visibility on
                a JS opacity reveal — SSR renders it visible; the y-slide is a
                pure enhancement (if the enter anim never runs, text still shows).
                Desktop H1 capped at 60px inline (the token pipeline is generated
                from docs/DESIGN.md and can't carry a clamp()). */}
            <motion.h1
              initial={{ y: 40 }}
              animate={{ y: 0 }}
              transition={{ duration: 0.64, ease: EASE_QUART }}
              className="font-headline-display font-black leading-tight text-[clamp(28px,8vw,52px)] md:text-[clamp(40px,4.5vw,60px)] max-w-[18ch] mx-auto md:mx-0"
              style={{ lineHeight: 1.12 }}
            >
              {t("home.hero.title")}
            </motion.h1>
            <motion.p
              initial={{ y: 24 }}
              animate={{ y: 0 }}
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
        initial={{ y: 16 }}
        animate={{ y: 0 }}
        transition={{ duration: 0.42, delay: 0.2, ease: EASE_QUART }}
        role="search"
        aria-label={t("home.hero.search_area_label")}
        // MEH-991 (HOME-05) put a cream card (radius 16) around a white inner
        // field here. MEH-1684 collapses the two back into ONE white pill:
        // rounded-full, one soft shadow, a hairline border for the cream
        // background — the circular submit is the only thing inside it that
        // carries fill.
        // Padding is SYMMETRIC (px-1.5) on purpose: HeroSearch's dropdown is
        // `inset-x-0` against its own container, so any asymmetry here lands
        // directly in the dropdown's alignment under the pill. The text's inset
        // from the pill edge comes from the input's own `ps-3.5` instead.
        // (Measured before this was symmetric: 7px vs 21px — visibly off-centre.)
        className="relative z-10 mx-auto -mt-8 md:-mt-10 bg-surface border border-border shadow-lg rounded-full px-1.5 py-1.5"
        style={{ width: "min(580px, calc(100% - 2rem))" }}
      >
        <HeroSearch
          placeholder={t("home.search.placeholder")}
          placeholders={searchPlaceholders}
          srLabel={t("home.search.sr_label")}
          className="w-full"
        />
      </motion.div>

      {/* Chips row — on cream. MEH-1070: centered at every breakpoint,
          superseding HOME-06 alignment per Sapir 09/07. MEH-1476: surprise-me
          left the hero (it lives at the producers-grid end beside "load more").
          MEH-1684: this is a CHIPS row now, not a CTA row — the filled
          "גלו בתי עסק" button and the underlined "how it works" link both left
          it, so every remaining item shares ONE ghost-chip style behind a muted
          editorial prefix. Wiring is untouched: same handlers, same testids. */}
      <motion.div
        initial={{ y: 12 }}
        animate={{ y: 0 }}
        transition={{ duration: 0.42, delay: 0.34, ease: EASE_QUART }}
        data-testid="hero-chips-row"
        className="mt-5 px-4 flex flex-wrap items-center justify-center gap-2.5"
      >
        <span className="text-sm text-fg-muted">{t("home.hero.chips_prefix")}</span>

        {/* MEH-41 geolocation — behaviour unchanged, chip styling only. */}
        <button
          type="button"
          onClick={onNearMe}
          disabled={geoLoading}
          className={CHIP_CLASS}
        >
          <Crosshair size={18} weight="bold" className={geoLoading ? "animate-spin" : ""} aria-hidden="true" />
          {geoLoading ? t("home.hero.searching") : t("home.hero.near_me")}
        </button>

        {/* MEH-1643: delivery-to-me. Two label states — with a saved user_city
            the label names the city; without one the generic label opens the
            LocationModal (routing lives in use-home-page handleDeliveryCta).
            MEH-1684 restyled it from .action-ghost to the shared chip; the
            handler, the testid and both label states are untouched. */}
        <button
          type="button"
          onClick={onDeliveryCta}
          data-testid="hero-delivery-cta"
          className={CHIP_CLASS}
        >
          {userCity
            ? t("home.hero.delivery_cta_city", { city: userCity })
            : t("home.hero.delivery_cta")}
        </button>
      </motion.div>

      {/* MEH-1684: trust line — the differentiator (hand-checked admission)
          stated above the fold, where the old zone carried no trust signal at
          all. SealCheck in accent gold (#896714 ≡ the `accent` token); the row
          is text, not a control, so it adds no affordance to the chips above. */}
      <div
        data-testid="hero-trust-line"
        className="mt-3 px-4 flex items-center justify-center gap-2 text-sm text-fg-muted"
      >
        <SealCheck size={18} weight="fill" className="text-accent shrink-0" aria-hidden="true" />
        {t("home.hero.trust_line")}
      </div>

      {/* MEH-1476 made "how it works" the sole secondary text link; MEH-1684
          moves it OUT of the chips row to sit under the trust line, so the row
          holds one affordance language and this stays a quiet link. Unchanged
          handler. */}
      <div className="mt-2 px-4 pb-6 md:pb-8 flex justify-center">
        <button
          type="button"
          onClick={scrollToHowItWorks}
          className="text-primary hover:text-primary-dark underline underline-offset-4 text-sm transition-colors duration-base ease-quart focus-ring rounded"
        >
          {t("home.hero.how_it_works")}
        </button>
      </div>
    </>
  );
}
