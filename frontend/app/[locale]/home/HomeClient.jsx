"use client";

import { useState } from "react";
import dynamic from "next/dynamic";
import LocationModal from "@/components/LocationModal";
import LocationBanner from "@/components/LocationBanner";
import HolidayBanner from "@/components/HolidayBanner";
import FridayDeliveryStrip from "@/components/FridayDeliveryStrip";
import BackToTop from "@/components/BackToTop";
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

// MEH-1688: the standalone "newest businesses" section is GONE, and with it
// MEH-809's NEW_SECTION_MIN_PRODUCERS depth gate. MEH-809 hid the section on a
// thin catalog because the "last added" producers were the same businesses
// already in the grid above — a duplicate-content problem the gate could only
// suppress, never solve. Moving the signal onto the card removes the duplicate
// outright: the recency now rides the producer's own card as the "חדש" badge
// (lib/badges.js — days_since_created <= 30), so it is visible wherever that
// business appears and needs no second grid to carry it.
// DO NOT reintroduce a standalone recency section — the card badge is the
// single owner of this signal (MEH-1688).

/**
 * MEH-1832 chunk 1 — the client half of the homepage. This file is a MOVE of the
 * former app/[locale]/page.js: the body is unchanged. Only the signature and the
 * JSON-LD block moved. page.js is now a Server Component that fetches the
 * first-paint feed and renders this with `initialData`.
 */
export default function HomeClient({ initialProducers = null, initialCategories = null }) {
  const t = useTranslations();
  const {
    user,
    producers, regionFallback, categories, filters, chips,
    visibleCount, producersLoading, geoLoading,
    recentlyViewed, showNewUserHint, locationModalOpen, setLocationModalOpen,
    fridayMode, step0Visible, userCity,
    onboardStep, onboardAdvance, onboardDismiss,
    visibleProducers, hasMore, categoryCards,
    statsProducersCount, statsCategoriesCount, statsLoaded, showStatsCounter, showTrustCount,
    featuredProducer, geoActive, cityActive, dayActive, geoEmptyNotice,
    handleNearMe, handleSurprise, handleDeliveryCta, handleDaySelected, handleCitySelected, handleClearLocation,
    // MEH-1684: `scrollToProducers` is no longer destructured here — the hero's
    // filled "גלו בתי עסק" button was its only consumer on this page and the
    // search pill replaced it. The helper itself still lives in use-home-page
    // (it fires after a near-me / city apply); only the prop pass-through went.
    handleWhatsAppClick, navigateToChip,
    handleClearCategory, handleLoadMore, handleAdvanceFromStep0,
  } = useHomePage({ initialProducers, initialCategories });

  // MEH-879: banner single-slot — at most ONE of {FridayStrip, HolidayBanner,
  // LocationBanner} renders. Precedence Friday > Holiday > Location. Each
  // banner keeps its own internal show-condition and reports it up; a lower-
  // precedence banner is `suppressed` (renders null) when a higher one shows.
  const [fridayVisible, setFridayVisible] = useState(false);
  const [holidayVisible, setHolidayVisible] = useState(false);

  return (
    <div>
      <HomeHero
        fridayMode={fridayMode}
        geoLoading={geoLoading}
        onNearMe={handleNearMe}
        onDeliveryCta={handleDeliveryCta}
        userCity={userCity}
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
          - The LEAD reads at ANY catalog depth, not just >= 5.
          - MEH-1692 replaced the leading verification phrase. It was a
            byte-exact substring of home.hero.subtitle, so one sentence
            rendered twice on the same screen; and "בדקנו" over-claimed,
            since verification_doc_type is one of license | exemption |
            cosmetics (schemas.py) and the narrow licensing claim belongs on
            the badge (ADR-022), not on a blanket band. The lead is now a
            structural fact below TRUST_COUNT_THRESHOLD (25) and a count at
            or above it. home.hero.subtitle and nav.trust_strip are UNCHANGED
            — the duplication is closed from this side only.
          - The /stats COUNT line is DEMOTED to a quiet secondary line, shown
            only at >= 5 (showStatsCounter). The MEH-521 "מתחילות עכשיו" <5
            fallback no longer LEADS (low counts = negative social proof).
            MEH-1692: that secondary line drops its own business count once
            the lead carries it, so the number is never stated twice.
          - S4 quiet-strip voice preserved: cream + hairline borders; numerals
            gold italic, LTR-isolated (bidi). Numbers from /stats, never
            hardcoded. Stats logic (use-home-page.js flags) unchanged.
          MEH-1686: py-4 → py-8 on BOTH branches (skeleton + loaded) so the
          strip reads as a deliberate band rather than a squeezed rule. Both,
          not just the loaded one — a py-4 skeleton swapping to a py-8 section
          would shift every block below it the moment /stats resolves.
          The ticket also asked for a top divider; the section has carried one
          since S4 (`border-y border-border`, measured 1px rgb(229,223,211) =
          the border-border token on the live page at 375 + 1440), so there
          was nothing to add and a second rule was NOT introduced.
          ========================= */}
      {!statsLoaded && (
        <section className="bg-background border-y border-border py-8 text-center" aria-busy="true">
          <p className="font-body-md text-base tracking-wide opacity-60">
            <span className="inline-block w-48 h-5 align-middle rounded-lg bg-text/10 animate-pulse" />
          </p>
        </section>
      )}
      {statsLoaded && (
        <section className="bg-background border-y border-border py-8 text-center">
          <p className="font-body-md text-base text-text tracking-wide" data-testid="trust-lead">
            {showTrustCount
              ? t.rich("home.trust.lead_count", {
                  count: statsProducersCount,
                  num: (chunks) => (
                    <span dir="ltr" className="font-english italic font-semibold text-lg text-accent tabular-nums align-middle">
                      {chunks}
                    </span>
                  ),
                })
              : t("home.trust.lead")}
          </p>
          {showStatsCounter && (
            <p className="font-body-sm text-sm text-fg-muted tracking-wide mt-1" data-testid="trust-secondary">
              {/* MEH-1692: the business count is suppressed here once the LEAD
                  above carries it, so the number is stated once in the band and
                  not twice. Below the trust threshold the lead is a sentence and
                  this line remains the only place the count appears. */}
              {!showTrustCount && (
                <>
                  <span dir="ltr" className="font-english italic font-semibold text-lg text-accent tabular-nums align-middle">
                    {statsProducersCount}
                  </span>{" "}
                  {t("home.stats.businesses")}
                  &nbsp;·&nbsp;
                </>
              )}
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
        onChipNavigate={navigateToChip}
        onClearCategory={handleClearCategory}
        onClearLocation={handleClearLocation}
        onLoadMore={handleLoadMore}
        onSurprise={handleSurprise}
        hasProducers={statsProducersCount > 0}
        geoActive={geoActive}
        cityActive={cityActive}
        dayActive={dayActive}
        onSelectDay={handleDaySelected}
        geoEmptyNotice={geoEmptyNotice}
        regionFallback={regionFallback}
      />

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

      {/* MEH-1309: floating back-to-top for the long home scroll. Stacks above
          the chat FAB (bottom-END corner) via the shared cookie-banner clearance. */}
      <BackToTop />
    </div>
  );
}
