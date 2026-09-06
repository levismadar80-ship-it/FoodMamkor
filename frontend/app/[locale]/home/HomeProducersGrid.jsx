"use client";

import Link from "next/link";
import { motion } from "framer-motion";
import { Faders, Info, Leaf, MapPin, X } from "@phosphor-icons/react";
import { useTranslations } from "next-intl";
import ProducerCard from "@/components/ProducerCard";
import { SkeletonProducerGrid } from "@/components/Skeleton";
import OnboardingTip from "@/components/OnboardingTip";
import { useEffect, useMemo, useState } from "react";
import { ActiveFilterChip } from "@/app/[locale]/home/ActiveFilterChip";
// MEH-2173: the same grouped sheet /map and /producers mount. Its chip SET is
// a prop (MEH-1862), so no widening was needed for a third surface.
import FilterSheet from "@/components/FilterSheet";
// MEH-1825: the day row is shared with /producers — one definition in components/.
import { DeliveryDayRow } from "@/components/DeliveryDayRow";
import { DELIVERY_DAYS } from "@/lib/delivery-days";
// MEH-1934: visibleGatedDietKeys gates the two newest diet chips here too.
// CHIPS_CONFIG is shared with /producers, so a chip added there appears on
// this row automatically — gating only at /producers would leave the home
// row deep-linking to a listing that returns nothing.
import {
  CHIPS_CONFIG,
  GATED_DIET_KEYS,
  openNowChipVisible,   // MEH-2131
  visibleGatedDietKeys,
  withChipGroups,       // MEH-2173 — sheet group metadata
} from "@/lib/producer-filters";
import { chipIcon } from "@/lib/chip-icons";
import { LOAD_MORE_CAP } from "@/lib/use-home-page";

// 🔒 MEH-2173 — the two axes the home row PROMOTES onto the surface. Every
// other axis stays reachable, one tap away, inside the FilterSheet.
//
// CHANGING THIS PAIR IS A SAPIR DECISION, not a refactor: it is a product
// ruling about which two filters are worth permanent screen space on the
// entry surface, and it was made in the 25/08 "סינון ארוך מדי" conversation.
//
// It deliberately does NOT mirror /map. /map promotes the FULFILMENT pair
// (`has_delivery` + `pickup_points`, ServiceChipRow.jsx:40, MEH-2046); home
// promotes trust + delivery. The card's own text described this list as a
// mirror of a `QUICK_CHIP_KEYS` 🔒 in lib/map-chips.js — that symbol does not
// exist. It was deleted in MEH-1468, which also retired the MEH-1461 "quick row
// capped at 2" lock along with it (map-chips.js:86-90). Both surfaces are
// intentionally different rows; neither is derived from the other, and there is
// no shared constant to keep them in step.
//
// Order is RTL reading order: the trust axis leads, matching the sheet's own
// service group (FilterSheet.jsx GROUP_CHIP_ORDER — verified, then has_delivery).
const PROMOTED_KEYS = ["verified", "has_delivery"];

/**
 * MEH-2198: the days a region-fallback producer delivers to the ACTIVE city,
 * read from the `delivery_areas` rows the list payload already carries
 * (MEH-902). No backend call — these rows are in the response already.
 *
 * Returns `null` when the producer has NO row for this city, and that is the
 * load-bearing distinction: `delivery_nationwide` is not resolvable
 * client-side (the XOR data model means a nationwide producer typically holds
 * ZERO delivery_areas rows), so a caption inferred for one would be an
 * unverifiable delivery promise — the MEH-1848 class. Omission over invention.
 * An empty array means the opposite: rows exist, but every `delivery_day` is
 * null, which is a real "by arrangement" answer.
 *
 * # REUSES: backend `_delivery_city_condition` (producer_listing.py:274)
 * compares `func.lower(DeliveryArea.city) == city.lower()`, so both sides are
 * lowercased here and NOT trimmed — matching the backend exactly rather than
 * being incidentally more permissive than the filter that produced this list.
 */
function deliveryDaysForCity(producer, city) {
  if (!city) return null;
  const target = city.toLowerCase();
  const rows = (producer?.delivery_areas || []).filter(
    (row) => typeof row?.city === "string" && row.city.toLowerCase() === target,
  );
  if (rows.length === 0) return null;
  const days = [...new Set(rows.map((row) => row?.delivery_day).filter(Boolean))];
  // The SORT KEY is shared, not copied: DELIVERY_DAYS is imported from
  // lib/delivery-days.js, so a change to week order cannot make this and
  // DeliveryDayRow disagree. What is duplicated is only the two-term
  // comparator expression (DeliveryDayRow.jsx:20-21), which has nothing to
  // drift into. Note that file's own comment at :18-19 — sortByWeek is not in
  // a shared lib "because after that move exactly one component needs it".
  // That premise now has a second consumer; hoisting it is a separate ticket,
  // not a change to make from inside this one.
  return days.sort((a, b) => DELIVERY_DAYS.indexOf(a) - DELIVERY_DAYS.indexOf(b));
}

/**
 * Producers grid section — heading + map link, onboarding tips,
 * chip filter row, active-category pill, "showing X of Y" counter,
 * new-user-hint banner, the producer grid itself, the empty-state,
 * and the "load more" button.
 *
 * All state ownership stays in useHomePage; this component is purely
 * presentational and emits its callbacks (onChipNavigate / onClearCategory
 * / onLoadMore / onSurprise) plus the onboarding-advance/dismiss pair.
 *
 * MEH-1774: the attribute chip row is NAVIGATION, not filtering — a tap
 * deep-links to /producers with that attribute applied, so attribute filtering
 * has one canonical home instead of two drifting ones. Category / city /
 * delivery-day / "קרוב אליי" still filter this grid in place, unchanged.
 *
 * MEH-1476: owns the "הפתיעו אותי" surprise-me button at the grid end (moved
 * from the hero, MEH-1288/MEH-1369). onSurprise = use-home-page handleSurprise
 * (GET /producers/random); render-gated on hasProducers.
 */
export function HomeProducersGrid({
  producers,
  producersLoading,
  visibleProducers,
  hasMore,
  visibleCount,
  filters,
  chips,
  categories,
  showNewUserHint,
  fridayMode,
  step0Visible,
  onboardStep,
  onboardAdvance,
  onboardDismiss,
  onAdvanceFromStep0,
  // MEH-2130: remove ONE active attribute filter from the applied-filter strip.
  onRemoveChip,
  // MEH-2173: the promoted chips AND the sheet's switches both call this — one
  // toggle over one state, so the surface and the panel cannot disagree.
  onToggleChip,
  onClearChips,
  filterSheetOpen,
  onToggleFilterSheet,
  onCloseFilterSheet,
  onClearCategory,
  onClearLocation,
  onLoadMore,
  onSurprise,
  hasProducers,
  geoActive,
  cityActive,
  // MEH-1645: active day refinement + its handler (day row + empty-state CTA).
  // MEH-2036: default to [] so a caller that has not yet been threaded the
  // prop renders an empty day axis instead of throwing on .length. Mirrors the
  // same tolerance in DeliveryDayRow.
  daysActive = [],
  onClearDays,
  onSelectDay,
  geoEmptyNotice,
  regionFallback,
}) {
  const t = useTranslations();
  // MEH-1418: attach Phosphor leading icons once (static config → stable ref).
  // MEH-1934: recomputed when the loaded set changes — the gate turns the chips
  // on by itself once the catalog carries the markings, with nobody flipping a
  // flag. An ACTIVE chip always survives the gate (see visibleGatedDietKeys).
  // MEH-2131: same clock discipline as /producers — null through the SSR pass
  // and the first client render, filled in afterwards. The chip's PRESENCE
  // depends on it, so reading `new Date()` during render would make the server
  // and client DOM disagree (lib/orderWindow.js header).
  const [openNowClock, setOpenNowClock] = useState(null);
  useEffect(() => {
    setOpenNowClock(new Date());
  }, []);
  // MEH-2173: the GATED axis list. Unchanged in what it computes — both
  // runtime gates below still decide what exists — but it now yields plain chip
  // defs instead of icon-attached ones, because its two consumers attach their
  // own glyphs: the promoted row via `chipIcon`, and FilterSheet internally
  // (FilterSheet.jsx calls chipIcon per row). This ticket changes WHERE an axis
  // renders, never WHETHER it is offered.
  const gatedChips = useMemo(() => {
    const shown = visibleGatedDietKeys(visibleProducers, chips);
    const hidden = GATED_DIET_KEYS.filter((k) => !shown.includes(k));
    // MEH-2131: the open-now axis reaches the home row via the unified config,
    // so it needs the home row's copy of the gate. Gating only at /producers
    // would leave this row deep-linking to a listing that returns nothing —
    // the same reasoning MEH-1934 used for the diet gates.
    //
    // `catalogFullyLoaded: true`, and the distinction is load-bearing rather
    // than a shortcut. Home's `hasMore` is `visibleCount < producers.length`
    // (use-home-page.js:819) — a DISPLAY collapse behind "עוד בתי עסק", not
    // "more pages unfetched". `producers` already holds everything home
    // fetched, so it is the complete catalog from the guard's point of view.
    //
    // Passing `!hasMore` here was the first version of this line, and it was
    // wrong in the way that matters: with more than one screenful of results
    // `hasMore` is true, the zero-result half never ran, and the chip rendered
    // at 3am exactly as before. The self-QA harness caught it (case B), which
    // is the entire reason that harness asserts the withheld case and not only
    // the visible one.
    const openNowHidden =
      !openNowChipVisible({
        producers,
        active: chips.open_for_orders_now,
        catalogFullyLoaded: true,
        now: openNowClock,
      }) && "open_for_orders_now";
    return CHIPS_CONFIG.filter(
      (c) => !hidden.includes(c.key) && c.key !== openNowHidden,
    );
  }, [visibleProducers, chips, producers, openNowClock]);

  // MEH-2173: the promoted pair, resolved out of CHIPS_CONFIG — the same
  // taxonomy declaration `gatedChips` (and therefore the sheet) is built from.
  // Looking each key up rather than hand-writing a label is what stops the
  // surface chip and its twin inside the sheet from ever showing different
  // Hebrew for one axis: ATTRIBUTE_LABELS owns the string, in one place.
  //
  // Read from CHIPS_CONFIG and NOT from `gatedChips`, on purpose. A promoted
  // chip is one the surface commits to showing, so a runtime data gate must not
  // be able to take it away — that is what "promoted" means. Moot today (the
  // only gates are MEH-1934's no_added_sugar and MEH-2131's open-now, neither
  // of which is promoted), and stated so the distinction survives a third gate.
  // A key absent from CHIPS_CONFIG yields nothing rather than an empty chip;
  // the count assertion in HomePromotedFilters.test.jsx is what would catch it.
  const promotedChips = useMemo(
    () =>
      PROMOTED_KEYS.map((key) => {
        const chip = CHIPS_CONFIG.find((c) => c.key === key);
        return chip ? { ...chip, icon: chipIcon(key) } : null;
      }).filter(Boolean),
    [],
  );
  // The sheet gets the gated list plus its group metadata (MEH-1862's seam).
  const sheetChips = useMemo(() => withChipGroups(gatedChips), [gatedChips]);
  // The "· N" on the trigger counts ACTIVE ATTRIBUTE axes, promoted included:
  // the button stands for the whole attribute surface, and a visitor who
  // switched on a promoted chip has one filter active, not zero.
  const activeAttributeCount = gatedChips.filter((c) => chips[c.key]).length;

  // MEH-1174: derive the active category once — drives both the dynamic
  // heading and the removable applied-filters tag. `null` when no category
  // is selected OR the id hasn't resolved against the loaded list yet, so
  // the heading falls back to the default rather than rendering an empty name.
  const activeCategory = filters.category
    ? categories.find((c) => String(c.id) === filters.category)
    : null;
  // MEH-2173: the applied-filter strip carries the NON-promoted active axes
  // only. A promoted axis shows its active state on its own chip, which is
  // still on screen — tagging it too would print the same filter twice in
  // adjacent rows. Together the two halves are the Baymard applied-filters
  // rule: every active filter is visible AND removable, each in exactly one
  // place.
  //
  // 5-state rule (CLAUDE.md): this list is what the strip's render condition
  // keys on, NOT "is any chip active" — which is what the condition used to be
  // (a `chipsActive` derived from Object.values(chips).some(Boolean), removed
  // with this change). With only a promoted chip on, that test is true while
  // this list is empty, so the row rendered the "מסנן לפי:" label with nothing
  // after it: a heading for an empty set.
  const tagChips = gatedChips.filter(
    (c) => chips[c.key] && !PROMOTED_KEYS.includes(c.key),
  );
  return (
    <section id="producers-grid" className="max-w-7xl mx-auto px-4 pb-20">
      {/* Step 0 — producers grid tip (2s delay). MEH-1174: mounted ABOVE the
          heading so the tour opens over the section title, not between the
          heading and the chips row. Tour state machine unchanged. */}
      <OnboardingTip
        show={step0Visible && onboardStep === 0}
        text={t("home.producers.onboarding0")}
        onDismiss={onboardDismiss}
        onNext={onAdvanceFromStep0}
      />
      <div className="flex items-center justify-between mb-8">
        <h2 className="font-headline-lg text-headline-lg text-text">
          {/* MEH-1174: default vs "בתי עסק · {name}" when a category is active. */}
          {activeCategory
            ? t("home.producers.heading_category", { name: activeCategory.name })
            : t("home.producers.heading")}
        </h2>
        <Link href="/map" className="text-primary hover:underline flex items-center gap-1 rounded-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40">
          <MapPin size={14} className="text-current" />
          {t("home.producers.map_link")}
        </Link>
      </div>

      {/* MEH-2173 — "promoted + all": the flat 8-chip scroll row is replaced by
          TWO promoted chips plus one "סינון" button opening the grouped
          FilterSheet. Baymard: a horizontal toolbar stops giving an overview
          past ~6-8 filter types, but a SMALL one beats a sidebar (which is
          scanned and skipped); the answer is to promote a couple and file the
          rest behind a panel. Same IA /map has run since MEH-1368 and
          /producers since MEH-1862 — now shared by all three discovery
          surfaces rather than diverging on the entry one.

          NO capability is removed: every axis the old row rendered is in the
          sheet, gated by the same runtime gates (`gatedChips` feeds both).

          This REVERSES MEH-1774 on home, deliberately and by the card's own
          instruction. That ticket made an attribute chip a deep-link to
          /producers so attribute filtering had one canonical home. The card
          asks for a sheet that filters THIS grid in place, so home is an
          attribute-filtering surface again whatever the chips do — and once it
          is, a promoted chip that navigated away while its twin switch inside
          the sheet filtered in place would be the same axis behaving two ways
          on one row. One state (`chips`), one handler (`onToggleChip`), for
          the surface chips and the sheet alike. */}
      <div className="mb-3 flex items-center gap-2 min-w-0" data-testid="home-filter-row">
        {promotedChips.map((chip) => {
          const active = !!chips[chip.key];
          return (
            <button
              key={chip.key}
              type="button"
              onClick={() => onToggleChip(chip.key)}
              aria-pressed={active}
              data-testid={`home-promoted-chip-${chip.key}`}
              // REUSES: frontend/app/[locale]/map/components/ServiceChipRow.jsx:69-73
              // — identical promoted-chip geometry and the MEH-1181-A Direction A
              // wash+ring for the active state, so a promoted chip reads the same
              // on home as it does on /map even though the PAIR differs.
              className={`inline-flex items-center gap-1.5 whitespace-nowrap px-4 py-2.5 rounded-md text-sm font-medium border transition shrink-0 ${
                active
                  ? "bg-green-50 text-primary border-primary ring-1 ring-primary"
                  : "bg-white text-text border-border hover:border-primary hover:text-primary"
              }`}
            >
              <span aria-hidden="true">{chip.icon}</span>
              {chip.label}
            </button>
          );
        })}
        {/* Anchor wrapper — FilterSheet's lg+ panel positions off this
            `relative` parent, exactly as on /map and /producers. `ms-auto`
            pushes the trigger to the inline-END (the LEFT in RTL). */}
        <div className="relative shrink-0 ms-auto">
          <button
            type="button"
            onClick={onToggleFilterSheet}
            aria-expanded={filterSheetOpen}
            aria-controls="filter-sheet-panel"
            data-testid="home-filters-button"
            // REUSES: frontend/components/ProducersClient.jsx:775-787 — same
            // trigger, same inactive chip visuals, same inline count.
            className="inline-flex items-center gap-1.5 whitespace-nowrap px-4 py-2.5 rounded-md text-sm font-medium border transition bg-white text-text border-border hover:border-primary hover:text-primary"
          >
            {/* `Faders`, not `FadersHorizontal` as the card's prose says: the
                two shipped sheet triggers both use `Faders`
                (FilterChipsBar.jsx:107, ProducersClient.jsx:784) and the card
                also names "the existing sheet-trigger pattern". Matching the
                glyph the other two surfaces already show beat matching the
                parenthetical. */}
            <Faders size={16} aria-hidden="true" />
            {t("filters.button")}
            {/* `.numeric` = tabular/LTR digits inside the RTL button. */}
            {activeAttributeCount > 0 && (
              <span className="numeric">{` · ${activeAttributeCount}`}</span>
            )}
          </button>
          <FilterSheet
            open={filterSheetOpen}
            onClose={onCloseFilterSheet}
            chips={sheetChips}
            chipState={chips}
            onToggleChip={onToggleChip}
            // The live client-side count, matching what the counter above the
            // grid says. `producers` is the FILTERED set home last fetched.
            resultCount={producers.length}
            onClearAll={onClearChips}
          />
        </div>
      </div>
      {/* Step 1 — filter chips tip */}
      <OnboardingTip
        show={onboardStep === 1}
        text={t("home.producers.onboarding1")}
        onDismiss={onboardDismiss}
        onNext={onboardAdvance}
      />
      {/* MEH-1174: single applied-filters summary row — the active category
          now lives here as a removable "× {name}" tag alongside the chip
          summary (replacing the old separate "מציג:" row). */}
      {(tagChips.length > 0 || activeCategory) && (
        <div className="mb-6 flex flex-wrap items-center gap-2" aria-live="polite">
          <span className="text-xs text-fg-muted">{t("home.producers.filter_prefix")}</span>
          {/* MEH-2130: each active attribute is now a REMOVABLE tag, matching
              /producers (ProducersClient.jsx) and /map (useMapFilters
              activeFilterTags) — one applied-filter pattern across all three
              discovery surfaces instead of two removable strips and one
              read-only string. Before this, home joined the active labels into
              a static "משלוח · טבעוני" span: a filter arriving from a shared
              link was visible with no way to switch it off short of editing the
              URL.
              REUSES: frontend/components/ProducersClient.jsx — same pill
              geometry, same leading "×" glyph (U+00D7, not an emoji), same
              colours. The aria-label is the one addition: the /producers pill's
              accessible name is just "× {label}", which does not say what the
              button does. It reuses an existing key, so no new i18n twin. */}
          {tagChips.map((chip) => (
              <button
                key={chip.key}
                type="button"
                onClick={() => onRemoveChip(chip.key)}
                // The label MUST carry the chip name. `aria-label` overrides the
                // computed accessible name outright, so a bare "נקה סינון" here
                // both makes every tag announce identically AND hides chip.label
                // from a screen reader — strictly worse than /producers, which
                // has no aria-label and so announces "× משלוח". Interpolating
                // keeps the existing i18n key (no new he/en twin) while giving
                // each button a distinct name. Caught by the CI reviewer.
                aria-label={`${t("home.producers.clear_filter")} ${chip.label}`}
                data-testid={`home-active-filter-${chip.key}`}
                className="inline-flex items-center gap-1 bg-white text-primary border border-primary rounded-full px-3 py-1 text-xs font-medium whitespace-nowrap shrink-0"
              >
                <span aria-hidden="true" className="text-[10px] font-bold">×</span>
                {chip.label}
              </button>
          ))}
          {activeCategory && (
            <button
              type="button"
              onClick={onClearCategory}
              // Same override as the attribute tags above (pre-existing, from
              // the MEH-1174 summary row): the category name lives in a child
              // span that the bare aria-label suppresses, so with an attribute
              // tag also active the two buttons were indistinguishable by name.
              aria-label={`${t("home.producers.clear_filter")} ${activeCategory.name}`}
              className="inline-flex items-center gap-1 bg-green-50 text-primary ps-3 pe-2 py-1 rounded-full text-sm hover:bg-primary/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40"
            >
              <span>{activeCategory.name}</span>
              <X size={12} weight="bold" aria-hidden="true" />
            </button>
          )}
        </div>
      )}

      {/* MEH-1269: dismissible location-filter chip (geo "קרוב אליי" or an
          explicit city choice). Self-hides when no location filter is active.
          MEH-2186: LOCATION-ONLY — the day value moved to the day chip below,
          so `daysActive` is no longer passed here. It still reaches this
          component for the empty-state CTA further down. */}
      <ActiveFilterChip
        geoActive={geoActive}
        cityActive={cityActive}
        onClear={onClearLocation}
      />

      {/* MEH-1645 day refinement, a permanent anchor since MEH-1771 and ONE
          value-carrying dropdown chip since MEH-2186: always rendered — with
          no city a tap routes into the LocationModal (handleDaySelected), with
          a city it opens the inline day panel. `onClearDays` is the chip's ✕:
          it drops the whole day set and leaves the city standing, which is the
          same handler the empty-state CTA below already uses. */}
      <DeliveryDayRow
        cityActive={cityActive}
        daysActive={daysActive}
        onSelectDay={onSelectDay}
        onClearDays={onClearDays}
      />

      {producersLoading ? (
        <SkeletonProducerGrid count={8} />
      ) : (
        <>
          {/* MEH-1282 (GAP A): persistent inline notice when "קרוב אליי" found
              nothing nearby and fell back to the full list. The MEH-1269 toast
              was too transient — its final state read as "nothing happened".
              Muted, tokens-only, sits above the counter. Cleared by any filter
              action (chip / city / category / location) in useHomePage. */}
          {geoEmptyNotice && (
            <p
              className="flex items-center gap-1.5 text-sm text-fg-muted mb-3"
              data-testid="geo-empty-notice"
              role="status"
              aria-live="polite"
            >
              <Info size={16} className="text-current shrink-0" aria-hidden="true" />
              {t("home.producers.geo_empty")}
            </p>
          )}
          {/* MEH-23 — "מציגים X מתוך Y" counter above the grid. */}
          {producers.length > 0 && (
            <p
              className="text-sm text-fg-muted mb-3"
              data-testid="producers-counter"
              aria-live="polite"
            >
              {t("home.producers.counter", { shown: Math.min(visibleCount, producers.length), total: producers.length })}
            </p>
          )}
          {showNewUserHint && visibleProducers.length > 0 && (
            <div className="flex items-center gap-2 bg-green-50 border border-primary/20 rounded-[12px] px-4 py-2.5 mb-4 text-sm text-primary w-fit">
              <span className="relative flex h-2.5 w-2.5 flex-shrink-0">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-primary opacity-60" />
                <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-primary" />
              </span>
              {t("home.producers.hint_favorites")}
            </div>
          )}
          <div className="grid grid-cols-2 gap-3 md:gap-6 lg:grid-cols-4" data-testid="home-producers-grid">
            {visibleProducers.map((p, idx) => (
              <motion.div
                key={p.id}
                className="h-full"
                initial={{ opacity: 0, y: 40 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true, amount: 0.1 }}
                transition={{ duration: 0.5, delay: (idx % 4) * 0.08, ease: [0.25, 0.46, 0.45, 0.94] }}
              >
                <ProducerCard producer={p} referrer="home" fridayMode={fridayMode} />
              </motion.div>
            ))}
          </div>
          {/* MEH-1645: zero results while a DAY refinement is active → suggest
              removing the day BEFORE the region fallback — the day is the
              narrowest filter, so it is the first thing to relax. */}
          {/* MEH-2197: compact, cause-aware. The day filter is the narrowest
              refinement, so its zero-result is a one-line note above the
              fallback grid — not a hero dead-end that pushes the near-matches
              below the fold. */}
          {producers.length === 0 && daysActive.length > 0 && (
            <div className="py-2 text-start" data-testid="day-empty-suggestion">
              <p className="text-sm text-fg-muted">
                {/* MEH-2036: the full set reads out here — this is a
                    paragraph, not the width-constrained chip, so it never
                    truncates the way ActiveFilterChip's label does. */}
                {t("home.producers.day_empty_suggestion", { day: daysActive.join(" · "), city: filters.delivery_city })}{" "}
                <button
                  type="button"
                  onClick={onClearDays}
                  className="underline text-primary hover:text-primary-dark transition font-medium"
                >
                  {t("home.producers.day_empty_clear_cta")}
                </button>
              </p>
            </div>
          )}
          {/* MEH-1487: region fallback — when a city filter returned 0 but the
              city belongs to a region, show the businesses that deliver
              anywhere in that region. Editorial discovery framing, not a
              delivery-eligibility check. Replaces the generic empty state. */}
          {producers.length === 0 && regionFallback?.producers?.length > 0 && (
            <div data-testid="region-fallback">
              <h3 className="font-headline-md text-lg font-bold text-text mb-4">
                {/* MEH-2197: when the DAY filter is what zeroed the grid, the
                    city itself is served — the old header would falsely claim
                    it is not. Cause-aware variant, region only. */}
                {daysActive.length > 0
                  ? t("home.producers.region_fallback_header_days", {
                      region: regionFallback.regionName,
                    })
                  : t("home.producers.region_fallback_header", {
                      city: filters.delivery_city,
                      region: regionFallback.regionName,
                    })}
              </h3>
              <div className="grid grid-cols-2 gap-3 md:gap-6 lg:grid-cols-4">
                {regionFallback.producers.map((p, idx) => {
                  /* MEH-2198: these cards already ARE the near-matches — same
                     city, other days — but carried no day info. The caption
                     says which days, and ONLY when a day filter is what zeroed
                     the grid; the city-zero path is untouched. */
                  const captionDays =
                    daysActive.length > 0
                      ? deliveryDaysForCity(p, filters.delivery_city)
                      : null;
                  const card = (
                    <ProducerCard producer={p} referrer="home" fridayMode={fridayMode} />
                  );
                  return (
                    <motion.div
                      key={p.id}
                      /* ProducerCard's own root is `h-full` (ProducerCard.jsx:306),
                         so a caption added as a plain sibling here is pushed OUTSIDE
                         the grid cell and collides with the row below — measured at
                         375 on the first capture of this ticket. The captioned cell
                         becomes a flex column so the card grows and the caption keeps
                         its own space inside the cell. The uncaptioned cell keeps the
                         exact markup it had before this ticket. */
                      className={captionDays === null ? "h-full" : "h-full flex flex-col"}
                      initial={{ opacity: 0, y: 40 }}
                      whileInView={{ opacity: 1, y: 0 }}
                      viewport={{ once: true, amount: 0.1 }}
                      transition={{ duration: 0.5, delay: (idx % 4) * 0.08, ease: [0.25, 0.46, 0.45, 0.94] }}
                    >
                      {captionDays === null ? (
                        card
                      ) : (
                        <>
                          <div className="flex-1 min-h-0">{card}</div>
                          <p className="text-sm text-fg-muted mt-1" data-testid="fallback-day-caption">
                            {captionDays.length > 0
                              ? t("home.producers.fallback_day_caption", {
                                  city: filters.delivery_city,
                                  days: captionDays.join(" · "),
                                })
                              : t("home.producers.fallback_day_caption_flexible", {
                                  city: filters.delivery_city,
                                })}
                          </p>
                        </>
                      )}
                    </motion.div>
                  );
                })}
              </div>
            </div>
          )}
          {/* MEH-2197: daysActive guard — a day-zero result already renders the
              compact day block above; without this the two empty states stack. */}
          {producers.length === 0 && daysActive.length === 0 && !(regionFallback?.producers?.length > 0) && (
            <div className="text-center py-16" data-testid="empty-generic">
              <div className="inline-flex items-center justify-center w-20 h-20 rounded-full bg-green-50 mb-4" aria-hidden="true">
                <Leaf size={36} className="text-primary" />
              </div>
              {/* MEH-1085 (DISC-07): cause-aware branch — a category-filtered
                  zero-result names the category as the cause and clears it in
                  place; only the geographic case escapes to /map. */}
              <h3 className="font-headline-md text-xl font-bold text-text mb-2">
                {t(filters.category ? "home.producers.empty_heading_category" : "home.producers.empty_heading")}
              </h3>
              <p className="text-fg-muted mb-5 max-w-md mx-auto">
                {t(filters.category ? "home.producers.empty_subtext_category" : "home.producers.empty_subtext")}
              </p>
              {filters.category ? (
                <button
                  type="button"
                  onClick={onClearCategory}
                  className="inline-flex items-center gap-2 bg-primary text-white px-6 py-3 rounded-sm hover:bg-primary-dark transition font-medium"
                >
                  {t("home.producers.clear_category_cta")}
                </button>
              ) : (
                <Link
                  href="/map"
                  className="inline-flex items-center gap-2 bg-primary text-white px-6 py-3 rounded-sm hover:bg-primary-dark transition font-medium"
                >
                  {t("home.producers.explore_map")}
                </Link>
              )}
            </div>
          )}
          {hasMore && (
            <div className="text-center mt-8">
              {/* MEH-1387: one expansion max — at the cap (reached by clicking
                  or restored from sessionStorage) the button becomes a link to
                  the full /producers listing, same outline-pill style. */}
              {visibleCount >= LOAD_MORE_CAP ? (
                <Link
                  href="/producers"
                  className="inline-block bg-white text-primary border-2 border-primary px-8 py-3 rounded-sm hover:bg-green-50 transition font-medium"
                >
                  {t("home.producers.all_businesses")}
                </Link>
              ) : (
                <button
                  onClick={onLoadMore}
                  className="bg-white text-primary border-2 border-primary px-8 py-3 rounded-sm hover:bg-green-50 transition font-medium"
                >
                  {t("home.producers.load_more")}
                </button>
              )}
            </div>
          )}
          {/* MEH-1476: surprise-me relocated here from the hero (was
              MEH-1288/MEH-1369). Full-catalog random producer via onSurprise
              (use-home-page handleSurprise → GET /producers/random); gated on
              hasProducers. Rendered as a TEXT LINK (same weight/classes as the
              hero "how it works" link) — deliberately LIGHTER than the
              "עוד בתי עסק" pill above so the two never read as equal-weight twin
              actions (the MEH-1369 anti-pattern Sapir caught 22/07). `inline-block
              px-4 py-3` keeps the tap target ≥44px via padding, not font size.
              Reuses t("home.hero.surprise_me"). */}
          {hasProducers && (
            <div className="text-center mt-3">
              <button
                type="button"
                onClick={onSurprise}
                className="inline-block px-4 py-3 text-primary hover:text-primary-dark underline underline-offset-4 text-sm transition-colors duration-base ease-quart focus-ring rounded"
              >
                {t("home.hero.surprise_me")}
              </button>
            </div>
          )}
        </>
      )}
    </section>
  );
}
