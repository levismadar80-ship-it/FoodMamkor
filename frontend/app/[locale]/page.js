"use client";

import dynamic from "next/dynamic";
import ProducerCard from "@/components/ProducerCard";
import ParallaxQuote from "@/components/ParallaxQuote";
import LocationModal from "@/components/LocationModal";
import LocationBanner from "@/components/LocationBanner";
import HolidayBanner from "@/components/HolidayBanner";
import FridayDeliveryStrip from "@/components/FridayDeliveryStrip";
import { UpcomingEventsPreview } from "@/app/[locale]/home/UpcomingEventsPreview";
import {
  HomeMarquee,
  HomeFounderQuote,
  HomeHowItWorks,
  HomeComparisonTeaser,
  HomeFeaturedProducer,
  HomeRecentlyViewed,
  HomeCTA,
} from "@/app/[locale]/home/HomeStaticBlocks";
import { HomeHero } from "@/app/[locale]/home/HomeHero";
import { HomeCategoryGrid } from "@/app/[locale]/home/HomeCategoryGrid";
import { HomeProducersGrid } from "@/app/[locale]/home/HomeProducersGrid";
import { Sparkle } from "@phosphor-icons/react";
import { useLocale, useTranslations } from "next-intl";
import { useHomePage } from "@/lib/use-home-page";
import { buildHomeJsonLd } from "@/lib/seo";

// MEH-538 + MEH-604: lazy-load Leaflet + the mini-map preview. SSR-disabled
// because Leaflet touches `window`. MEH-604 added the `loading` skeleton so
// the above-the-fold slot reserves height on first paint (CLS = 0) before JS
// hydrates. The skeleton lives in a SEPARATE file (Leaflet-free) so it can
// be imported synchronously without dragging Leaflet into SSR.
import HomepageMiniMapSkeleton from "@/components/HomepageMiniMapSkeleton";
const HomepageMiniMap = dynamic(() => import("@/components/HomepageMiniMap"), {
  ssr: false,
  loading: () => <HomepageMiniMapSkeleton />,
});

// PREMIUM_DESIGN: parallax divider images between sections.
// MEH-879: content-first reorder dropped the 2nd divider; only IMAGE_1 remains.
const PARALLAX_IMAGE_1 = "https://images.unsplash.com/photo-1488459716781-31db52582fe9?w=1600&auto=format&q=80&fm=webp";

// MEH-809: gate the "עסקים חדשים" section on catalog depth. With a thin catalog
// the "last added" producers ARE the same businesses already shown in the
// recommended grid above, so the section reads as a duplicate. Hide it until
// the total distinct inventory is deep enough (the simpler of the two MEH-809
// thresholds — total count, not a set-difference against the grid). Render
// gate only; no producer API/data change.
const NEW_SECTION_MIN_PRODUCERS = 8;

export default function HomePage() {
  const t = useTranslations();
  const locale = useLocale();
  const {
    user,
    producers, categories, filters, chips,
    visibleCount, producersLoading, geoLoading,
    recentlyViewed, showNewUserHint, locationModalOpen, setLocationModalOpen,
    fridayMode, step0Visible, userCity,
    onboardStep, onboardAdvance, onboardDismiss,
    visibleProducers, hasMore, categoryCards,
    statsProducersCount, statsCategoriesCount, statsLoaded, showStatsCounter, showStatsFallback, newestProducers,
    featuredProducer,
    handleNearMe, handleCitySelected, handleCategoryCardClick,
    handleWhatsAppClick, scrollToProducers, toggleChip,
    handleClearCategory, handleLoadMore, handleAdvanceFromStep0,
  } = useHomePage();

  return (
    <div>
      {/* MEH-804: homepage Organization + WebSite (SearchAction) JSON-LD. */}
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(buildHomeJsonLd(locale)) }}
      />
      <HomeHero
        fridayMode={fridayMode}
        geoLoading={geoLoading}
        onNearMe={handleNearMe}
        onScrollDown={scrollToProducers}
      />

      {/* MEH-538 + MEH-604: mini-map preview sits IMMEDIATELY after the hero
          (section #2) so the country-shape of producer distribution is
          visible within ~2s of FCP. Skeleton above (dynamic({ loading }))
          reserves height on first paint; Leaflet bundle eval is deferred
          200ms post-FCP via setTimeout + rIC inside the component. */}
      <HomepageMiniMap />

      {/* MEH-50: שוק שישי strip — shown Thu 18:00 → Fri 14:00 only */}
      {fridayMode && <FridayDeliveryStrip city={userCity} />}

      {/* =========================
          TRUST STRIP — MEH-524 (copy LOCK 2026-06-13, F4 Option B) over the
          MEH-521 threshold + MEH-607 F10 skeleton:
          - Renders ONLY when businesses >= 5 (STATS_DISPLAY_THRESHOLD in
            use-home-page.js); below it the MEH-521 fallback stays.
          - S4 quiet-strip voice: cream + hairline borders (the old bg-primary
            bar was the F4 mockup's "Wolt-style marketplace-tier" anti-pattern);
            numerals = gold italic per S4, LTR-isolated (bidi).
          - Numbers are STATIC (the count-up component was dropped here): its
            animation starts at zero, and the lock forbids rendering a zero
            count in any state.
          - No verified-claim wording — over-claim guard (MEH-579). Numbers
            from /stats, never hardcoded.
          ========================= */}
      {!statsLoaded && (
        <section className="bg-background border-y border-border py-4 text-center" aria-busy="true">
          <p className="font-body-md text-base tracking-wide opacity-60">
            <span className="inline-block w-48 h-5 align-middle rounded-lg bg-text/10 animate-pulse" />
          </p>
        </section>
      )}
      {showStatsCounter && (
        <section className="bg-background border-y border-border py-4 text-center">
          <p className="font-body-md text-base text-text tracking-wide">
            <span dir="ltr" className="font-english italic font-semibold text-2xl text-accent tabular-nums align-middle">
              {statsProducersCount}
            </span>{" "}
            {t("home.stats.businesses")}
            &nbsp;·&nbsp;
            <span dir="ltr" className="font-english italic font-semibold text-2xl text-accent tabular-nums align-middle">
              {statsCategoriesCount}
            </span>{" "}
            {t("home.stats.categories")}
            &nbsp;·&nbsp;
            {t("home.stats.countrywide")}
          </p>
        </section>
      )}
      {showStatsFallback && (
        <section className="bg-background border-y border-border py-4 text-center">
          <p className="font-body-md text-base text-text tracking-wide">{t("home.stats.fallback")}</p>
        </section>
      )}

      {/* MEH-41: location banner — appears after 3s if no city saved */}
      <div className="mt-6">
        <LocationBanner hasCity={!!userCity} onOpenModal={() => setLocationModalOpen(true)} />
      </div>

      {/* MEH-41: location modal — shared between hero button + banner */}
      <LocationModal
        open={locationModalOpen}
        onClose={() => setLocationModalOpen(false)}
        onSelectCity={handleCitySelected}
      />

      {/* MEH-55: holiday banner — visible 7 days before and during a holiday */}
      <div className="mt-4">
        <HolidayBanner />
      </div>

      <HomeCategoryGrid
        categoryCards={categoryCards}
        onCardClick={handleCategoryCardClick}
        selectedCategory={filters.category}
      />

      <HomeMarquee />

      <HomeRecentlyViewed items={recentlyViewed} />

      <HomeProducersGrid
        producers={producers}
        producersLoading={producersLoading}
        visibleProducers={visibleProducers}
        hasMore={hasMore}
        visibleCount={visibleCount}
        filters={filters}
        chips={chips}
        categories={categories}
        showNewUserHint={showNewUserHint}
        fridayMode={fridayMode}
        step0Visible={step0Visible}
        onboardStep={onboardStep}
        onboardAdvance={onboardAdvance}
        onboardDismiss={onboardDismiss}
        onAdvanceFromStep0={handleAdvanceFromStep0}
        onToggleChip={toggleChip}
        onClearCategory={handleClearCategory}
        onLoadMore={handleLoadMore}
      />

      {/* =========================
          NEW PRODUCERS (last 4 added)
          ========================= */}
      {producers.length >= NEW_SECTION_MIN_PRODUCERS && newestProducers.length > 0 && (
        <section className="max-w-7xl mx-auto px-4 pb-20">
          <h2 className="font-headline-lg font-bold text-text mb-8 flex items-center gap-2" style={{ fontSize: "clamp(26px, 3vw, 36px)" }}>
            <Sparkle size={16} className="text-current" />
            {t("home.new_businesses.heading")}
          </h2>
          <div className="grid grid-cols-2 gap-3 md:gap-6 lg:grid-cols-4">
            {newestProducers.map((p) => (
              <ProducerCard key={`new-${p.id}`} producer={p} referrer="home" fridayMode={fridayMode} />
            ))}
          </div>
        </section>
      )}

      {/* =========================
          MEET A PRODUCER (P5 §10 · MEH-542) — fed by the first is_recommended
          ("מומלץ") producer that carries a usable short_description, mapped to
          the editorial shape in useHomePage. No recommended producer ⇒ null ⇒
          the section self-hides (HomeStaticBlocks.jsx:199). No fictional
          content ever ships.
          ========================= */}
      <HomeFeaturedProducer featured={featuredProducer} />

      {/* MEH-879: content-first IA — HowItWorks + FounderQuote relocated below
          the producer content (was between Marquee and ProducersGrid). */}
      <HomeHowItWorks />

      <HomeFounderQuote />

      {/* =========================
          PARALLAX DIVIDER 1 (PREMIUM_DESIGN)
          First full-bleed divider. Ken Burns lives inside ParallaxQuote.
          Uses the farm-field Unsplash asset from docs/archive/PREMIUM_DESIGN.md.
          ========================= */}
      <ParallaxQuote
        image={PARALLAX_IMAGE_1}
        quote={t("home.story_block.founder_quote")}
        attribution={t("home.story_block.founder_attribution")}
        overlayOpacity={0.6}
        height="400px"
      />

      {/* MEH-841 (supersedes MEH-525): the full comparison moved to /about;
          a one-line teaser here links to it, keeping the home slot calm. */}
      <HomeComparisonTeaser />

      {/* =========================
          UPCOMING EVENTS PREVIEW (Task 6)
          ========================= */}
      <UpcomingEventsPreview />

      <HomeCTA />
    </div>
  );
}
