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
  HomeFeaturedProducer,
  HomeRecentlyViewed,
  HomeFavoritesStrip,
  HomeCTA,
} from "@/app/[locale]/home/HomeStaticBlocks";
import { HomeHero } from "@/app/[locale]/home/HomeHero";
import { HomeCategoryGrid } from "@/app/[locale]/home/HomeCategoryGrid";
import { HomeProducersGrid } from "@/app/[locale]/home/HomeProducersGrid";
import HomeSeasonalNow from "@/app/[locale]/home/HomeSeasonalNow";
import { useTranslations } from "next-intl";
import { useHomePage } from "@/lib/use-home-page";
import { useFavoriteProducers } from "@/lib/use-favorite-producers";

// MEH-538 + MEH-604: lazy-load Leaflet + the mini-map preview. SSR-disabled
// because Leaflet touches `window`. MEH-604 added the `loading` skeleton so
// the above-the-fold slot reserves height on first paint (CLS = 0) before JS
// hydrates. The skeleton lives in a SEPARATE file (Leaflet-free) so it can
// be imported synchronously without dragging Leaflet into SSR.
import RescueHomeModule from "@/components/rescue/RescueHomeModule";
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
// MEH-2804: the trust band's row + column classes, shared by the loaded row
// and its skeleton so the two cannot drift apart in box structure.
const TRUST_ROW = "mx-auto grid max-w-3xl px-4";
const trustColClass = (i) =>
  `flex flex-col items-center gap-2 px-2${i > 0 ? " border-s border-border" : ""}`;
// The label box's reserved height, on the skeleton AND the loaded label. A
// column is ~98px wide at 375, and "businesses, each chosen personally" needs
// three lines there (Hebrew needs three at 320) — measured. So phones reserve
// three lines (3 × text-sm's 20px = 3.75rem), sm+ two. A MIN height, never a
// clamp: a longer label grows the band rather than being cut off.
export const TRUST_LABEL_BOX = "min-h-[3.75rem] sm:min-h-10";

export default function HomeClient({
  initialProducers = null,
  initialCategories = null,
  // MEH-1287 chunk B: the seasonal rows, fetched by the server shell. Not part
  // of useHomePage's state — nothing on this page mutates the set, and the
  // module below hides itself when there are fewer than three of them.
  initialInSeason = null,
}) {
  const t = useTranslations();
  const {
    user,
    producers, regionFallback, categories, filters, chips,
    visibleCount, producersLoading, geoLoading,
    recentlyViewed, showNewUserHint, locationModalOpen, setLocationModalOpen,
    fridayMode, userCity,
    visibleProducers, hasMore, categoryCards,
    statsProducersCount, statsCategoriesCount, statsLoaded, showStatsCounter, showTrustCount,
    featuredProducer, geoActive, cityActive, daysActive, geoEmptyNotice,
    handleNearMe, handleSurprise, handleDeliveryCta, handleDaySelected, handleClearDays, handleCitySelected, handleClearLocation,
    // MEH-1684: `scrollToProducers` is no longer destructured here — the hero's
    // filled "גלו בתי עסק" button was its only consumer on this page and the
    // search pill replaced it. The helper itself still lives in use-home-page
    // (it fires after a near-me / city apply); only the prop pass-through went.
    // MEH-2173: `navigateToChip` is no longer destructured here — the home
    // attribute row filters in place now, so the MEH-1774 deep-link hop has no
    // consumer on this page. The handler itself is kept in use-home-page (see
    // the note beside its export there); only the prop pass-through went, the
    // same way MEH-1684 dropped `scrollToProducers` from this list.
    handleRemoveChip, handleToggleChip, handleClearChips,
    filterSheetOpen, closeFilterSheet, toggleFilterSheet,
    handleClearCategory, handleLoadMore,
  } = useHomePage({ initialProducers, initialCategories });
  // MEH-2724: signed-in user's favorites → «המועדפים שלך» strip under the hero.
  const favoriteProducers = useFavoriteProducers();

  // MEH-879: banner single-slot — at most ONE of {FridayStrip, HolidayBanner,
  // LocationBanner} renders. Precedence Friday > Holiday > Location. Each
  // banner keeps its own internal show-condition and reports it up; a lower-
  // precedence banner is `suppressed` (renders null) when a higher one shows.
  const [fridayVisible, setFridayVisible] = useState(false);
  const [holidayVisible, setHolidayVisible] = useState(false);

  // MEH-2804: the trust band's fact row. The business count is a column only
  // at/above TRUST_COUNT_THRESHOLD (showTrustCount); below it the count is
  // withheld (MEH-521) and stated nowhere in the band (MEH-1692). «0₪» is
  // count-independent on purpose — no commission is a LOCK, not a number that
  // can look small.
  const trustFacts = [
    ...(showTrustCount
      ? [{ key: "businesses", value: statsProducersCount, label: t("home.trust.col_businesses") }]
      : []),
    { key: "categories", value: statsCategoriesCount, label: t("home.trust.col_categories") },
    { key: "fees", value: t("home.trust.col_fees_value"), label: t("home.trust.col_fees") },
  ];

  return (
    <div>
      <HomeHero
        fridayMode={fridayMode}
        geoLoading={geoLoading}
        onNearMe={handleNearMe}
        onDeliveryCta={handleDeliveryCta}
        userCity={userCity}
      />

      {/* MEH-2724 (Sapir 6/11, option ב׳ of the Wolt-style research): the
          signed-in user's saved businesses, first thing after the hero. A
          separate row — the businesses grid below keeps one order for
          everyone. Self-hides when signed out or with 0 favorites. Outside
          the mobile-reorder wrapper, so it stays at the top on phones too. */}
      <HomeFavoritesStrip items={favoriteProducers.items} reserve={favoriteProducers.reserve} />

      {/* MEH-50: שוק שישי strip — shown Thu 18:00 → Fri 14:00 only.
          MEH-879: highest banner precedence — reports visibility so Holiday +
          Location yield to it. */}
      {fridayMode && (
        <FridayDeliveryStrip city={userCity} onVisibilityChange={setFridayVisible} />
      )}

      {/* =========================
          TRUST STRIP — HISTORY. The current band is the MEH-2804 / ADR-039
          fact row in the next comment; the bullets below record the design
          it replaced and why. Still in force: the MEH-1692 rule (the count
          is never stated twice), the MEH-521 threshold, and MEH-1686 (last
          paragraph). MEH-879 re-anchor (over MEH-524 lock / MEH-521
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
      {/* MEH-2804 / ADR-039: the band is a FACT ROW from 5 businesses — a
          display numeral (Frank Ruhl black, primary, upright) over a short
          label per column, hairline dividers between. 5–24: categories · 0₪;
          25+: count · categories · 0₪; below 5: the locked sentence, no
          numerals. The skeleton reserves the 3-column box by construction:
          the numeral is leading-none (h-9 / md:h-12 = text-4xl / text-5xl)
          and every label box reserves the same lines (TRUST_LABEL_BOX), so
          loaded and busy differ in content, not in height (MEH-1686). Two
          known exceptions, both by design: a label longer than the reserve
          (English at 320) grows the band, and the 5–24 row has 2 columns where
          the skeleton has 3 (same height, wider columns) — the count is not
          known until /stats answers. */}
      {!statsLoaded && (
        <section className="bg-background border-y border-border py-8" aria-busy="true" data-testid="home-trust-band">
          <div className={`${TRUST_ROW} grid-cols-3`}>
            {[0, 1, 2].map((i) => (
              <div key={i} className={trustColClass(i)} data-testid="trust-fact-skeleton">
                <span className="block h-9 w-14 rounded-lg bg-text/10 animate-pulse md:h-12" />
                <span
                  className={`block ${TRUST_LABEL_BOX} w-20 rounded-lg bg-text/10 animate-pulse`}
                  data-testid="trust-fact-skeleton-label"
                />
              </div>
            ))}
          </div>
        </section>
      )}
      {statsLoaded && (
        <section className="bg-background border-y border-border py-8 text-center" data-testid="home-trust-band">
          {showStatsCounter ? (
            <div
              className={`${TRUST_ROW} ${trustFacts.length === 3 ? "grid-cols-3" : "grid-cols-2"}`}
              data-testid="trust-facts"
            >
              {trustFacts.map((fact, i) => (
                <div key={fact.key} className={trustColClass(i)} data-testid="trust-fact">
                  <span
                    dir="ltr"
                    className="font-headline-display font-black text-primary text-4xl md:text-5xl leading-none"
                    data-testid="trust-fact-value"
                  >
                    {fact.value}
                  </span>
                  <span className={`${TRUST_LABEL_BOX} text-sm text-text`} data-testid="trust-fact-label">
                    {fact.label}
                  </span>
                </div>
              ))}
            </div>
          ) : (
            <p className="px-4 font-headline-md text-lg text-text" data-testid="trust-lead">
              {t("home.trust.lead")}
            </p>
          )}
        </section>
      )}

      {/* MEH-41: location banner — appears after 3s if no city saved.
          MEH-879: lowest banner precedence — suppressed when Friday or Holiday
          is showing. */}
      {/* MEH-2635: `empty:hidden`. In block flow an empty wrapper's margin
          collapsed away; inside the mobile flex column above it paints as a
          real 24px gap even when the banner renders null (measured: this slot
          plus the holiday one below added 40px of blank page at 375px).
          Same idiom as ProducersClient.jsx's day-panel host, scoped to
          `max-md` so desktop keeps its exact pre-ticket spacing. MEH-2747
          removed that flex column; the class stays so phone spacing does not
          move in the same PR (block flow, measured in qa-artifacts/MEH-2747). */}
      <div className="mt-6 max-md:empty:hidden">
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
      {/* MEH-2635: `empty:hidden` — see the location banner slot above. */}
      <div className="mt-4 max-md:empty:hidden">
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
        onRemoveChip={handleRemoveChip}
        onToggleChip={handleToggleChip}
        onClearChips={handleClearChips}
        filterSheetOpen={filterSheetOpen}
        onToggleFilterSheet={toggleFilterSheet}
        onCloseFilterSheet={closeFilterSheet}
        onClearCategory={handleClearCategory}
        onClearLocation={handleClearLocation}
        onLoadMore={handleLoadMore}
        onSurprise={handleSurprise}
        hasProducers={statsProducersCount > 0}
        geoActive={geoActive}
        cityActive={cityActive}
        daysActive={daysActive}
        onSelectDay={handleDaySelected}
        onClearDays={handleClearDays}
        geoEmptyNotice={geoEmptyNotice}
        regionFallback={regionFallback}
      />

      {/* MEH-2648: rescue-bags module, AFTER the businesses grid (Sapir 5/11:
          «אחרי בתי העסק» — the directory leads, a one-town pilot does not
          take the slot under the hero). Renders null while the pilot is off,
          with no town, or when the town has no bags today. Before the
          mini-map on every viewport (MEH-2747). */}
      <RescueHomeModule city={userCity} />

      {/* MEH-2747 (Sapir 6/11: one order on phone and desktop): the mini-map
          comes AFTER the businesses grid on every viewport, by DOM position.
          MEH-2635 got the same picture on phones with a flex wrapper +
          `order-last`, which moved the map only visually — VoiceOver and the
          keyboard still reached it before the businesses (WCAG 1.3.2 / 2.4.3),
          and desktop kept a different order. Never reorder sections with CSS:
          __tests__/VisualOrderGuard.test.js fails on a new `order-*` /
          `*-reverse` outside its reasoned allowlist. The MEH-538/604 "map right
          under the hero" placement is retired by this ticket on both viewports.
          The skeleton (dynamic({ loading })) still reserves height on first
          paint; Leaflet bundle eval is still deferred post-FCP. */}
      <HomepageMiniMap />

      {/* =========================
          MEET A PRODUCER (P5 §10 · MEH-542) — fed by the first is_recommended
          ("מומלץ") producer that carries a usable short_description, mapped to
          the editorial shape in useHomePage. No recommended producer ⇒ null ⇒
          the section self-hides (`if (!featured) return null`). No fictional
          content ever ships. MEH-2441: a full-bleed green band, right after
          the businesses grid (Sapir 27/10: under the businesses, not after
          the map).
          ========================= */}
      <HomeFeaturedProducer featured={featuredProducer} />

      {/* MEH-1287 chunk B: the editorial seasonal strip sits with the other
          editorial content — after the single "meet a producer" pick and before
          the explanatory blocks — rather than above the producer grid, which is
          the browse path. Self-hides below 3 businesses (ADDENDUM-4). */}
      <HomeSeasonalNow producers={initialInSeason} />

      {/* MEH-2441 (Sapir 27/10): "איך זה עובד" and the comparison teaser left
          home. /about carries the full comparison (MEH-841) and
          /about/process the real four steps, so both lived twice. */}

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
