"use client";

import Link from "next/link";
import { motion } from "framer-motion";
import { Info, Leaf, MapPin, X } from "@phosphor-icons/react";
import { useTranslations } from "next-intl";
import ProducerCard from "@/components/ProducerCard";
import { SkeletonProducerGrid } from "@/components/Skeleton";
import OnboardingTip from "@/components/OnboardingTip";
import { useMemo } from "react";
import ChipScrollRow from "@/components/ChipScrollRow";
import { ActiveFilterChip, DeliveryDayRow } from "@/app/[locale]/home/ActiveFilterChip";
import { CHIPS_CONFIG } from "@/lib/producer-filters";
import { withChipIcons } from "@/lib/chip-icons";
import { LOAD_MORE_CAP } from "@/lib/use-home-page";

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
  onChipNavigate,
  onClearCategory,
  onClearLocation,
  onLoadMore,
  onSurprise,
  hasProducers,
  geoActive,
  cityActive,
  // MEH-1645: active day refinement + its handler (day row + empty-state CTA).
  dayActive,
  onSelectDay,
  geoEmptyNotice,
  regionFallback,
}) {
  const t = useTranslations();
  // MEH-1418: attach Phosphor leading icons once (static config → stable ref).
  const chipsWithIcons = useMemo(() => withChipIcons(CHIPS_CONFIG), []);
  // MEH-1174: derive the active category once — drives both the dynamic
  // heading and the removable applied-filters tag. `null` when no category
  // is selected OR the id hasn't resolved against the loaded list yet, so
  // the heading falls back to the default rather than rendering an empty name.
  const chipsActive = Object.values(chips).some(Boolean);
  const activeCategory = filters.category
    ? categories.find((c) => String(c.id) === filters.category)
    : null;
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

      {/* MEH-1774: this row is now NAVIGATION, not filtering — a tap deep-links
          to /producers with the attribute applied, so the canonical filtering
          surface is one place instead of two. `variant="toggle"` and
          `activeKeys` are retained on purpose: home still hydrates chips from
          its own URL params, and changing that reading is out of scope here
          (MEH-1083). Visuals are unchanged by design — behavior only. */}
      <ChipScrollRow
        variant="toggle"
        chips={chipsWithIcons}
        activeKeys={chips}
        onChipClick={onChipNavigate}
        className="mb-3"
      />
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
      {(chipsActive || activeCategory) && (
        <div className="mb-6 flex flex-wrap items-center gap-2" aria-live="polite">
          <span className="text-xs text-fg-muted">{t("home.producers.filter_prefix")}</span>
          {chipsActive && (
            <span className="text-xs text-fg-muted">
              {CHIPS_CONFIG.filter((c) => chips[c.key])
                .map((c) => c.label)
                .join(" · ")}
            </span>
          )}
          {activeCategory && (
            <button
              type="button"
              onClick={onClearCategory}
              aria-label={t("home.producers.clear_filter")}
              className="inline-flex items-center gap-1 bg-green-50 text-primary ps-3 pe-2 py-1 rounded-full text-sm hover:bg-primary/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40"
            >
              <span>{activeCategory.name}</span>
              <X size={12} weight="bold" aria-hidden="true" />
            </button>
          )}
        </div>
      )}

      {/* MEH-1269: dismissible location-filter chip (geo "קרוב אליי" or an
          explicit city choice). Self-hides when no location filter is active. */}
      <ActiveFilterChip
        geoActive={geoActive}
        cityActive={cityActive}
        dayActive={dayActive}
        onClear={onClearLocation}
      />

      {/* MEH-1645: progressive-disclosure day refinement — renders only while
          a city filter is active (DeliveryDayRow self-gates on cityActive). */}
      <DeliveryDayRow
        cityActive={cityActive}
        dayActive={dayActive}
        onSelectDay={onSelectDay}
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
          <div className="grid grid-cols-2 gap-3 md:gap-6 lg:grid-cols-4">
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
          {producers.length === 0 && dayActive && (
            <div className="text-center py-8" data-testid="day-empty-suggestion">
              <p className="text-fg-muted mb-3 max-w-md mx-auto">
                {t("home.producers.day_empty_suggestion", { day: dayActive, city: filters.delivery_city })}
              </p>
              <button
                type="button"
                onClick={() => onSelectDay(dayActive)}
                className="inline-flex items-center gap-2 bg-primary text-white px-6 py-3 rounded-sm hover:bg-primary-dark transition font-medium"
              >
                {t("home.producers.day_empty_clear_cta")}
              </button>
            </div>
          )}
          {/* MEH-1487: region fallback — when a city filter returned 0 but the
              city belongs to a region, show the businesses that deliver
              anywhere in that region. Editorial discovery framing, not a
              delivery-eligibility check. Replaces the generic empty state. */}
          {producers.length === 0 && regionFallback?.producers?.length > 0 && (
            <div data-testid="region-fallback">
              <h3 className="font-headline-md text-lg font-bold text-text mb-4">
                {t("home.producers.region_fallback_header", {
                  city: filters.delivery_city,
                  region: regionFallback.regionName,
                })}
              </h3>
              <div className="grid grid-cols-2 gap-3 md:gap-6 lg:grid-cols-4">
                {regionFallback.producers.map((p, idx) => (
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
            </div>
          )}
          {producers.length === 0 && !(regionFallback?.producers?.length > 0) && (
            <div className="text-center py-16">
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
