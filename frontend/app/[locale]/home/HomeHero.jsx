"use client";

import { useMemo } from "react";
import { motion } from "framer-motion";
import { Crosshair } from "@phosphor-icons/react";
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

// MEH-1690: headline scrim reinforcement — REQUIRED by this ticket's own
// restructure, not a style preference.
//
// `.scrim-ink` (globals.css) is a gradient over `inset-0`, so its stops are
// proportional to the BAND HEIGHT. Moving the pill and chips inside the band
// made it taller, which pushed the H1 from ~16% up the band to ~50% — into a
// far thinner part of the same gradient. Measured worst case (scrim composited
// over a blown-white photo highlight, the case globals.css:72 names) via
// e2e/qa-meh1690-contrast.mjs:
//
//   H1 top line, before → 10.37:1 @375 · 8.41:1 @1440
//   H1 top line, after  →  3.36:1 @375 · 3.54:1 @1440   ← under the 4.5:1 floor
//
// 4.5:1 is mandatory here: IS 5568 makes WCAG AA a legal requirement, and this
// repo has the MEH-1771 precedent of dropping an `opacity-60` that measured
// 2.78:1 rather than shipping it. Raising the band's top padding was rejected —
// the arithmetic wants ~+118px on mobile, which re-breaks the ~700–800px laptop
// fold MEH-788 exists to protect.
//
// So the veil restores an absolute darkness floor across the text zone,
// independent of how tall the band grows, and tapers to 0 at the top so the
// produce photo still reads there. Tuned against the probe, not by eye.
// DO NOT edit `.scrim-ink` to fix this — it is shared, and the bottom band it
// draws is still correct; this is additive and local to the hero.
const HEADLINE_SCRIM =
  "linear-gradient(to top, rgb(28 26 23 / 0.40) 0%, rgb(28 26 23 / 0.40) 70%, rgb(28 26 23 / 0) 100%)";

// MEH-1684: the ONE chip style for the hero row. Shared as a constant (not
// duplicated per button) so a future chip cannot drift into a second style,
// which is the exact failure that ticket was undoing.
//
// MEH-1690 changed the SURFACE these sit on, and with it the fill. MEH-1684's
// chips were ghost-on-cream (transparent, hairline primary border); they now
// sit INSIDE the hero photo, on the `.scrim-ink` band whose bottom stop is
// rgb(28 26 23 / 0.88) — primary green on near-black is far under AA, and a
// transparent chip would have been unreadable exactly where the eye lands.
// The fill is `bg-surface` (the same white as the search pill above it), which
// is what makes pill + chips read as ONE unit rather than two strips.
//
// This does NOT spend MEH-1369's single-filled-primary slot: that invariant is
// about the PRIMARY fill, which the circular submit still holds alone. A
// neutral surface fill is not a primary one.
const CHIP_CLASS =
  "inline-flex items-center gap-2 rounded-full bg-surface border border-border text-primary " +
  "px-4 py-2.5 hover:bg-green-50 transition-colors duration-base ease-quart " +
  "font-medium text-sm disabled:opacity-50 focus-ring shadow-sm";

/**
 * Hero section — S14 "Photography + Texture" composition (MEH-788 Phase 3).
 *
 * Full-bleed Ken Burns produce photo, height-capped (mobile ~44svh ≤360px /
 * desktop ~44svh 380–440px) — NOT 100vh, and short enough that the headline +
 * search + chips all clear a ~700–800px laptop fold on load (MEH-788: 560px
 * was too tall once search went in-flow).
 *
 * MEH-1690 — the photo is a LAYER, not a box the content has to fit after.
 * The band used to be a fixed-height `overflow-hidden` <section> with the
 * search pill as a SIBLING pulled back up over the seam by a negative margin
 * (`-mt-8`). That arithmetic is what put the pill across the photo's bottom
 * edge: measured pre-fix, the pill overhung the image by 26px at 375 and 18px
 * at 1440, and the chips row by 88px / 80px — half the search zone on the
 * photo, half on cream, so neither surface held it (Baymard: a search field's
 * prominence is set by its surroundings; one split across two has neither's).
 *
 * Now the photo + scrim are an absolutely-positioned layer pinned to
 * `inset-0`, and the headline, the pill and the chips are ordinary flow
 * children that DEFINE the band's height. "The pill sits inside the image" is
 * therefore true by construction rather than by a tuned magic number — it
 * survives a copy change, a font swap, or a chip wrapping to a second line,
 * none of which the old negative margin could absorb.
 *
 * Two things that look incidental and are not:
 *   · the section is `relative` with NO `z-index` and NO `isolate`, so it does
 *     not open a stacking context. HeroSearch's dropdown (`z-[1000]`, scoped
 *     inside the pill's own `z-10`) therefore resolves exactly as it did when
 *     the pill was a sibling — this restructure is deliberately z-neutral.
 *   · only the INNER image layer carries `overflow-hidden` (it clips the ≤1.06
 *     Ken Burns drift). The section itself must not, or the dropdown would be
 *     clipped by the very band it now sits inside.
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
 * MEH-1684 (search-zone redesign), MEH-1690 (composition — see below).
 *
 * MEH-1684 — the zone speaks ONE affordance language:
 *   · search = a full white pill (rounded-full, one soft shadow) with a
 *     circular filled submit inside it. It is the zone's ONLY primary CTA, so
 *     the solid "גלו בתי עסק" button that used to open the row is GONE (search
 *     is how you discover; `onScrollDown` therefore left this component's API).
 *   · the row below is now CHIPS, not CTAs — one style behind a muted editorial
 *     prefix. Both chips keep their pre-existing wiring untouched: near-me is
 *     still MEH-41 geolocation, delivery is still MEH-1643's user_city path.
 * MEH-1369's "exactly ONE filled primary" invariant is preserved, now with the
 * circular submit holding that slot instead of a scroll button.
 *
 * MEH-1690 — MEH-1684 got the COMPONENTS right and the COMPOSITION wrong: it
 * replaced one overloaded row with a column of three short centred rows
 * stranded on empty cream. Three things left the hero zone entirely, and the
 * removals are the point of the ticket, not a side effect:
 *   · the trust line — an accent-gold seal glyph plus the hand-checked claim.
 *     It duplicated the claim the social-proof bar makes immediately below
 *     (`home.trust.lead`, strengthened in MEH-1686), and under a search field
 *     the eye is looking for a hint about SEARCH, not a claim about the
 *     directory. Its gold seal was also the only accent-coloured mark above the
 *     fold, pulling the eye to the least important point in the zone.
 *   · the how-it-works text link, which now lives only in the block it pointed
 *     at (HomeStaticBlocks.jsx `#how-it-works`).
 * Neither the removed copy nor its message keys are quoted anywhere in this
 * file ON PURPOSE: the ticket's absence assertions are greps, and a comment
 * naming the string would answer 1 forever and hide a real regression.
 * The second gold seal above the fold — the Header's desktop trust strip
 * (`Header.jsx:225`) — is deliberately NOT touched here: that is MEH-1692, at a
 * different risk tier.
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
  return (
    /* 01 · HERO — full-bleed IMG-02 + --scrim-ink, with the search zone INSIDE
       the band. `relative` and deliberately WITHOUT z-index/isolate — see the
       component docblock: opening a stacking context here would re-scope
       HeroSearch's dropdown. */
    <section
      className="relative w-full"
      aria-label={t("home.hero.main_label")}
    >
      {/* Photo + scrim LAYER — pinned behind the flow content, and the only
          thing that clips (the ≤1.06 Ken Burns drift needs inset -5% room).
          (The ParallaxQuote.jsx REUSES anchor that was here died with that
          component — MEH-1567.) */}
      <div className="absolute inset-0 z-0 overflow-hidden" aria-hidden="true">
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
        {/* --scrim-ink (globals.css) — warm-ink bottom band. It carried H1 +
            subtitle alone before MEH-1690; it now also underlies the pill and
            the chips, which is what lets a white pill and white chips hold
            contrast over any crop of the produce photo. */}
        <div className="scrim-ink absolute inset-0" />
        {/* Additive darkness floor for the headline — see HEADLINE_SCRIM above.
            Sits over `.scrim-ink` so the bottom band keeps its own weight. */}
        <div className="absolute inset-0" style={{ backgroundImage: HEADLINE_SCRIM }} />
      </div>

      {/* Flow content — this is what DEFINES the band height now. `justify-end`
          keeps the old bottom-anchored composition; min-h preserves MEH-788's
          capped band as a FLOOR, so a short viewport still gets the full photo
          while a wrapped chip row can grow it instead of spilling out. */}
      <div className="relative flex flex-col justify-end min-h-[clamp(300px,44svh,360px)] md:min-h-[clamp(380px,44svh,440px)] pt-20 pb-6 md:pb-8">
        {/* Text — centered mobile, start (RTL right) desktop. */}
        <div className="px-4 md:px-12 text-white">
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

        {/* Search pill — MEH-99 HeroSearch routes to /producers?q=. No longer
            rides a seam: it is an in-flow child of the band, so it cannot cross
            the photo's bottom edge. `z-10` is retained verbatim from the
            pre-MEH-1690 sibling so the dropdown's stacking is unchanged. */}
        <motion.div
          initial={{ y: 16 }}
          animate={{ y: 0 }}
          transition={{ duration: 0.42, delay: 0.2, ease: EASE_QUART }}
          role="search"
          aria-label={t("home.hero.search_area_label")}
          // MEH-991 (HOME-05) put a cream card (radius 16) around a white inner
          // field here. MEH-1684 collapses the two back into ONE white pill:
          // rounded-full, one soft shadow, a hairline border — the circular
          // submit is the only thing inside it that carries fill.
          // Padding is SYMMETRIC (px-1.5) on purpose: HeroSearch's dropdown is
          // `inset-x-0` against its own container, so any asymmetry here lands
          // directly in the dropdown's alignment under the pill. The text's inset
          // from the pill edge comes from the input's own `ps-3.5` instead.
          // (Measured before this was symmetric: 7px vs 21px — visibly off-centre.)
          className="relative z-10 mx-auto mt-6 bg-surface border border-border shadow-lg rounded-full px-1.5 py-1.5"
          style={{ width: "min(580px, calc(100% - 2rem))" }}
        >
          <HeroSearch
            placeholder={t("home.search.placeholder")}
            placeholders={searchPlaceholders}
            srLabel={t("home.search.sr_label")}
            className="w-full"
          />
        </motion.div>

        {/* Chips row — MEH-1070: centered at every breakpoint, superseding
            HOME-06 alignment per Sapir 09/07. MEH-1476: surprise-me left the
            hero (it lives at the producers-grid end beside "load more").
            MEH-1690: it sits INSIDE the photo directly under the pill, so the
            two read as one unit; `mt-3` (was mt-5) is the tightened coupling.
            Wiring is untouched: same handlers, same testids. */}
        <motion.div
          initial={{ y: 12 }}
          animate={{ y: 0 }}
          transition={{ duration: 0.42, delay: 0.34, ease: EASE_QUART }}
          data-testid="hero-chips-row"
          className="mt-3 px-4 flex flex-wrap items-center justify-center gap-2.5"
        >
          {/* On the scrim now, not cream — `text-fg-muted` would fail AA here. */}
          <span className="text-sm text-green-50">{t("home.hero.chips_prefix")}</span>

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
              MEH-1690 Phase 0 confirmed this is already city-NEUTRAL by default:
              nothing here is hardcoded, the city only appears when `userCity` is
              truthy. Handler, testid and both label states untouched. */}
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
      </div>
    </section>
  );
}
