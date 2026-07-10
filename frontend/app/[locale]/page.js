"use client";

import { useState } from "react";
import dynamic from "next/dynamic";
import ProducerCard from "@/components/ProducerCard";
import LocationModal from "@/components/LocationModal";
import LocationBanner from "@/components/LocationBanner";
import HolidayBanner from "@/components/HolidayBanner";
import FridayDeliveryStrip from "@/components/FridayDeliveryStrip";
import { UpcomingEventsPreview } from "@/app/[locale]/home/UpcomingEventsPreview";
import {
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
import { buildHomeJsonLd, serializeJsonLd } from "@/lib/seo";

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
    statsProducersCount, statsCategoriesCount, statsLoaded, showStatsCounter, newestProducers,
    featuredProducer,
    handleNearMe, handleCitySelected,
    handleWhatsAppClick, scrollToProducers, toggleChip,
    handleClearCategory, handleLoadMore, handleAdvanceFromStep0,
  } = useHomePage();

  // MEH-879: banner single-slot — at most ONE of {FridayStrip, HolidayBanner,
  // LocationBanner} renders. Precedence Friday > Holiday > Location. Each
  // banner keeps its own internal show-condition and reports it up; a lower-
  // precedence banner is `suppressed` (renders null) when a higher one shows.
  const [fridayVisible, setFridayVisible] = useState(false);
  const [holidayVisible, setHolidayVisible] = useState(false);

  return (
    <div>
      {/* MEH-804: homepage Organization + WebSite (SearchAction) JSON-LD. */}
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: serializeJsonLd(buildHomeJsonLd(locale)) }}
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

      {/* MEH-50: שוק שישי strip — shown Thu 18:00 → Fri 14:00 only.
          MEH-879: highest banner precedence — reports visibility so Holiday +
          Location yield to it. */}
      {fridayMode && (
        <FridayDeliveryStrip city={userCity} onVisibilityChange={setFridayVisible} />
      )}

      {/* =========================
          TRUST STRIP — MEH-879 re-anchor (over MEH-524 lock / MEH-521
          threshold / MEH-607 F10 skeleton):
          - LEADS with the already-live, approved verification phrase
            "עסקים שכבר בדקנו בשבילך" (reused from home.hero.subtitle) — the
            trust now reads at ANY catalog depth, not just >= 5.
          - The /stats COUNT line is DEMOTED to a quiet secondary line, shown
            only at >= 5 (showStatsCounter). The MEH-521 "מתחילות עכשיו" <5
            fallback no longer LEADS (low counts = negative social proof).
          - S4 quiet-strip voice preserved: cream + hairline borders; numerals
            gold italic, LTR-isolated (bidi). Numbers from /stats, never
            hardcoded. Stats logic (use-home-page.js flags) unchanged.
          ========================= */}
      {!statsLoaded && (
        <section className="bg-background border-y border-border py-4 text-center" aria-busy="true">
          <p className="font-body-md text-base tracking-wide opacity-60">
            <span className="inline-block w-48 h-5 align-middle rounded-lg bg-text/10 animate-pulse" />
          </p>
        </section>
      )}
      {statsLoaded && (
        <section className="bg-background border-y border-border py-4 text-center">
          <p className="font-body-md text-base text-text tracking-wide">
            {t("home.trust.lead")}
          </p>
          {showStatsCounter && (
            <p className="font-body-sm text-sm text-fg-muted tracking-wide mt-1">
              <span dir="ltr" className="font-english italic font-semibold text-lg text-accent tabular-nums align-middle">
                {statsProducersCount}
              </span>{" "}
              {t("home.stats.businesses")}
              &nbsp;·&nbsp;
              <span dir="ltr" className="font-english italic font-semibold text-lg text-accent tabular-nums align-middle">
                {statsCategoriesCount}
              </span>{" "}
              {t("home.stats.categories")}
              &nbsp;·&nbsp;
              {t("home.stats.countrywide")}
            </p>
          )}
        </section>
      )}

      {/* MEH-41: location banner — appears after 3s if no city saved.
          MEH-879: lowest banner precedence — suppressed when Friday or Holiday
          is showing. */}
      <div className="mt-6">
        <LocationBanner
          hasCity={!!userCity}
          onOpenModal={() => setLocationModalOpen(true)}
          suppressed={(fridayMode && fridayVisible) || holidayVisible}
        />
      </div>

      {/* MEH-41: location modal — shared between hero button + banner */}
      <LocationModal
        open={locationModalOpen}
        onClose={() => setLocationModalOpen(false)}
        onSelectCity={handleCitySelected}
      />

      {/* MEH-55: holiday banner — visible 7 days before and during a holiday.
          MEH-879: 2nd banner precedence — reports visibility (so Location
          yields) and is suppressed when the Friday strip is showing. */}
      <div className="mt-4">
        <HolidayBanner
          suppressed={fridayMode && fridayVisible}
          onVisibilityChange={setHolidayVisible}
        />
      </div>

      {/* MEH-1080: cards are real links to /producers?category=<id> —
          no click handler, no selection state on the homepage anymore. */}
      <HomeCategoryGrid categoryCards={categoryCards} />

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

      {/* MEH-879/883: content-first IA — HowItWorks sits below the producer
          content; the marquee + both founder quotes were removed (MEH-883). */}
      <HomeHowItWorks />

      {/* MEH-841 (supersedes MEH-525): the full comparison moved to /about;
          a one-line teaser here links to it, keeping the home slot calm. */}
      <HomeComparisonTeaser />

      {/* =========================
          UPCOMING EVENTS PREVIEW (Task 6)
          ========================= */}
      <UpcomingEventsPreview />

      {/* MEH-912: recently-viewed demoted from between the category grid and the
          producer grid to a "resume browsing" band just above the closing CTA,
          so a re-engagement module no longer interrupts the categories→producers
          browse path. Self-hides when empty (condition unchanged). */}
      <HomeRecentlyViewed items={recentlyViewed} />

      <HomeCTA />
    </div>
  );
}
