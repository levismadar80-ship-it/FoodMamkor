"use client";

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
  HomeKitchenPreview,
  HomeCTA,
} from "@/app/[locale]/home/HomeStaticBlocks";
import { HomeHero } from "@/app/[locale]/home/HomeHero";
import { HomeCategoryGrid } from "@/app/[locale]/home/HomeCategoryGrid";
import { HomeProducersGrid } from "@/app/[locale]/home/HomeProducersGrid";
import { useTranslations } from "next-intl";
import { useHomePage } from "@/lib/use-home-page";

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
    statsProducersCount, statsCategoriesCount, showStatsCounter, showStatsFallback, newestProducers,
    handleNearMe, handleCitySelected, handleCategoryCardClick,
    handleWhatsAppClick, scrollToProducers, toggleChip,
    handleClearCategory, handleLoadMore, handleAdvanceFromStep0,
  } = useHomePage();

  return (
    <div>
      <HomeHero
        fridayMode={fridayMode}
        geoLoading={geoLoading}
        onNearMe={handleNearMe}
        onScrollDown={scrollToProducers}
      />

      {/* MEH-50: שוק שישי strip — shown Thu 18:00 → Fri 14:00 only */}
      {fridayMode && <FridayDeliveryStrip city={userCity} />}

      {/* =========================
          SOCIAL PROOF BAR — MEH-521: never show "0"; threshold in use-home-page.
          ========================= */}
      {showStatsCounter && (
        <section className="bg-primary text-white py-4 text-center">
          <p className="font-body text-lg tracking-wide">
            <span className="font-semibold tabular-nums">
              <AnimatedCounter target={statsProducersCount} />
            </span>{" "}
            {t("home.stats.verified_businesses")}
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
          <p className="font-body text-lg tracking-wide">{t("home.stats.fallback")}</p>
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
          <h2 className="font-headline font-bold text-site-text mb-8" style={{ fontSize: "clamp(26px, 3vw, 36px)" }}>
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
        quote="אחרי שיודעים מאיפה לקנות — אי אפשר לחזור לאחור."
        attribution="— ספיר, מייסדת מהמקור"
        overlayOpacity={0.6}
        height="400px"
      />

      <HomeHowItWorks />

      <HomeKitchenPreview products={homeProducts} onWhatsAppClick={handleWhatsAppClick} />

      {/* =========================
          PARALLAX DIVIDER 2 (PREMIUM_DESIGN)
          Visual breather before the events block. Quote is intentionally
          shorter than the first divider so the page has rhythm.
          ========================= */}
      <ParallaxQuote
        image={PARALLAX_IMAGE_2}
        quote="כל עונה — טעם אחר"
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
