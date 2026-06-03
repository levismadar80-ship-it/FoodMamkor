"use client";

import dynamic from "next/dynamic";
import ProducerCard from "@/components/ProducerCard";
import ParallaxQuote from "@/components/ParallaxQuote";
import AnimatedCounter from "@/components/AnimatedCounter";
import LocationModal from "@/components/LocationModal";
import LocationBanner from "@/components/LocationBanner";
import HolidayBanner from "@/components/HolidayBanner";
import FridayDeliveryStrip from "@/components/FridayDeliveryStrip";
import { UpcomingEventsPreview } from "@/app/[locale]/home/UpcomingEventsPreview";
import {
  HomeMarquee,
  HomeFounderQuote,
  HomeHowItWorks,
  HomeRecentlyViewed,
  HomeCTA,
} from "@/app/[locale]/home/HomeStaticBlocks";
import { HomeHero } from "@/app/[locale]/home/HomeHero";
import { EditorialBreath } from "@/app/[locale]/home/HomeEditorialBreath";
import { HomeCategoryGrid } from "@/app/[locale]/home/HomeCategoryGrid";
import { HomeProducersGrid } from "@/app/[locale]/home/HomeProducersGrid";
import { Sparkle } from "@phosphor-icons/react";
import { useTranslations } from "next-intl";
import { useHomePage } from "@/lib/use-home-page";

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
const PARALLAX_IMAGE_1 = "https://images.unsplash.com/photo-1488459716781-31db52582fe9?w=1600&auto=format&q=80&fm=webp";
const PARALLAX_IMAGE_2 = "https://images.unsplash.com/photo-1464226184884-fa280b87c399?w=1600&auto=format&q=80&fm=webp";

export default function HomePage() {
  const t = useTranslations();
  const {
    user,
    producers, homeProducts, categories, filters, chips,
    visibleCount, producersLoading, geoLoading,
    recentlyViewed, showNewUserHint, locationModalOpen, setLocationModalOpen,
    fridayMode, step0Visible, userCity,
    onboardStep, onboardAdvance, onboardDismiss,
    visibleProducers, hasMore, categoryCards,
    statsProducersCount, statsCategoriesCount, statsLoaded, showStatsCounter, showStatsFallback, newestProducers,
    handleNearMe, handleCitySelected, handleCategoryCardClick,
    handleWhatsAppClick, scrollToProducers, toggleChip,
    handleClearCategory, handleLoadMore, handleAdvanceFromStep0,
  } = useHomePage();

  // MEH-607 F4: editorial-cadence framing — "גליון מאי — N בתי עסק · ...".
  // Dynamic month via Intl (he-IL renders "מאי" for May). Computed once per
  // render; safe to recompute (cheap, no allocations vs useMemo). Homepage
  // is "use client" so no SSR-mismatch risk around midnight UTC.
  const monthName = new Intl.DateTimeFormat("he-IL", { month: "long" }).format(new Date());

  return (
    <div>
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
          SOCIAL PROOF BAR — MEH-521 threshold + MEH-607 (F4 + F10):
          - F10 skeleton renders while /stats hasn't resolved (statsLoaded=false)
            → reserves height so the section can't pop in and cause CLS.
          - F4 copy reframe: "גליון {מאי} — N בתי עסק · M קטגוריות · ישראל".
            Editorial-cadence framing per synthesis §5.2 Option A.
          - "מאומתים" dropped (per-business badge carries verification now).
          ========================= */}
      {!statsLoaded && (
        <section className="bg-primary text-white py-4 text-center" aria-busy="true">
          <p className="font-body-md text-lg tracking-wide opacity-60">
            <span className="inline-block w-48 h-5 align-middle rounded-lg bg-white/20 animate-pulse" />
          </p>
        </section>
      )}
      {showStatsCounter && (
        <section className="bg-primary text-white py-4 text-center">
          <p className="font-body-md text-lg tracking-wide">
            {t("home.stats.issue_prefix", { month: monthName })}{" "}
            <span className="font-semibold tabular-nums">
              <AnimatedCounter target={statsProducersCount} />
            </span>{" "}
            {t("home.stats.businesses")}
            &nbsp;·&nbsp;
            <span className="font-semibold tabular-nums">
              <AnimatedCounter target={statsCategoriesCount} />
            </span>{" "}
            {t("home.stats.categories")}
            &nbsp;·&nbsp;
            {t("home.stats.countrywide")}
          </p>
        </section>
      )}
      {showStatsFallback && (
        <section className="bg-primary text-white py-4 text-center">
          <p className="font-body-md text-lg tracking-wide">{t("home.stats.fallback")}</p>
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

      {/* §06 — MEH-733: editorial "breath" pull-quote between §05 stats and
          §07 category grid. Calm full-width magazine moment. */}
      <EditorialBreath />

      <HomeCategoryGrid
        categoryCards={categoryCards}
        onCardClick={handleCategoryCardClick}
        selectedCategory={filters.category}
      />

      <HomeMarquee />

      <HomeFounderQuote />

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
      {newestProducers.length > 0 && (
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

      <HomeHowItWorks />

      {/* =========================
          PARALLAX DIVIDER 2 (PREMIUM_DESIGN)
          Visual breather before the events block. Quote is intentionally
          shorter than the first divider so the page has rhythm.
          ========================= */}
      <ParallaxQuote
        image={PARALLAX_IMAGE_2}
        quote={t("home.story_block.seasonal_heading")}
        overlayOpacity={0.55}
        height="340px"
      />

      {/* =========================
          UPCOMING EVENTS PREVIEW (Task 6)
          ========================= */}
      <UpcomingEventsPreview />

      <HomeCTA />
    </div>
  );
}
