"use client";

import { useState } from "react";
import LocationModal from "@/components/LocationModal";
import LocationBanner from "@/components/LocationBanner";
import HolidayBanner from "@/components/HolidayBanner";
import FridayDeliveryStrip from "@/components/FridayDeliveryStrip";
import BackToTop from "@/components/BackToTop";
import HomeWhatsOn from "@/components/HomeWhatsOn";
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

import RescueHomeModule from "@/components/rescue/RescueHomeModule";
// MEH-538 + MEH-604 + MEH-2850 C: the mini-map's SSR-disabled dynamic import
// and its Leaflet-free skeleton live in HomepageMiniMapLazy, which starts the
// import only when the visitor scrolls near the map.
import HomepageMiniMapLazy from "@/components/HomepageMiniMapLazy";
import { SkeletonBlock } from "@/components/Skeleton";

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
// MEH-2804 follow-up: the count line and its loading placeholder share one
// class string, min-height included, so the two cannot drift apart (MEH-1686).
export const TRUST_COUNT_LINE = "mt-1 min-h-7 px-4 font-body-sm text-sm text-fg-muted";

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
    statsProducersCount, statsLoaded, showTrustCount,
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
          TRUST STRIP — HISTORY. The current band is described in the next
          comment; the bullets below record the designs it replaced and why.
          Still in force: the MEH-1692 rule (the count
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
      {/* MEH-2804 follow-up (07/11, Sapir): the band is the SENTENCE, always —
          «בלי מתווך באמצע · איסוף עצמי או משלוח…» answers "who am I buying from
          and how does it reach me", which holds at any catalog depth. The #4143
          fact row (31 · 18 · 0₪) was rejected on the phone and is recorded in
          ADR-039 as a considered alternative.
          - The sentence needs no /stats, so it renders from the first paint.
          - From TRUST_COUNT_THRESHOLD (25, showTrustCount) a quiet second line
            adds the business count. Below it there is no number at all
            (MEH-521: a small count is negative social proof), and the count is
            stated once (MEH-1692).
          - MEH-1686: while /stats is in flight the second line's slot is held by
            a placeholder of the SAME min-height, so the common (25+) case loads
            without a shift. Below 25 the slot collapses once — the known cost.
          - The numeral is set in the line's own face, semibold, brand green,
            LTR-isolated (Sapir 07/11): Cormorant's old-style italic figures read
            as «ɜı» next to Hebrew, which has no lowercase for them to match.
          - `text-balance` on the sentence: at 375 it wrapped with «העסק» alone
            on the last line (VRT, 07/11) — same rule DESIGN.md sets for h1–h3. */}
      <section
        className="bg-background border-y border-border py-8 text-center"
        aria-busy={statsLoaded ? undefined : "true"}
        data-testid="home-trust-band"
      >
        <p className="px-4 font-body-md text-base text-text text-balance" data-testid="trust-lead">
          {t("home.trust.lead")}
        </p>
        {!statsLoaded && (
          <p className={TRUST_COUNT_LINE} data-testid="trust-count-skeleton">
            <SkeletonBlock  className="inline-block w-40 h-5 align-middle rounded-lg" />
          </p>
        )}
        {statsLoaded && showTrustCount && (
          <p className={TRUST_COUNT_LINE} data-testid="trust-count">
            {t.rich("home.trust.count_line", {
              count: statsProducersCount,
              num: (chunks) => (
                <span
                  dir="ltr"
                  className="font-semibold text-primary"
                  data-testid="trust-count-value"
                >
                  {chunks}
                </span>
              ),
            })}
          </p>
        )}
      </section>

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
          The skeleton still reserves height on first paint; since MEH-2850 C
          Leaflet + tiles load only when the visitor scrolls near the map. */}
      <HomepageMiniMapLazy />

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
          WHAT'S ON AT THE BUSINESSES (MEH-2859) — one strip over all four
          date-bound types (events, experiences, group buys, surprise baskets),
          in the slot the events-only preview held. Self-hides when none of the
          four has anything, and asks nothing of any of them until the strip
          nears the viewport.
          ========================= */}
      <HomeWhatsOn />

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
