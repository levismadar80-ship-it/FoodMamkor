"use client";

import Link from "next/link";
import { motion } from "framer-motion";
import { Leaf, MapPin, X } from "@phosphor-icons/react";
import { useTranslations } from "next-intl";
import ProducerCard from "@/components/ProducerCard";
import { SkeletonProducerGrid } from "@/components/Skeleton";
import OnboardingTip from "@/components/OnboardingTip";
import ChipScrollRow from "@/components/ChipScrollRow";
import { CHIPS_CONFIG } from "@/lib/producer-filters";

/**
 * Producers grid section — heading + map link, onboarding tips,
 * chip filter row, active-category pill, "showing X of Y" counter,
 * new-user-hint banner, the producer grid itself, the empty-state,
 * and the "load more" button.
 *
 * All state ownership stays in useHomePage; this component is purely
 * presentational and emits two callbacks (onToggleChip / onClearCategory
 * / onLoadMore) plus the onboarding-advance/dismiss pair.
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
  onToggleChip,
  onClearCategory,
  onLoadMore,
}) {
  const t = useTranslations();
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

      {/* Filter chips */}
      <ChipScrollRow
        variant="toggle"
        chips={CHIPS_CONFIG}
        activeKeys={chips}
        onChipClick={onToggleChip}
        fadeBg="#F5F0E8"
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

      {producersLoading ? (
        <SkeletonProducerGrid count={8} />
      ) : (
        <>
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
          {producers.length === 0 && (
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
              <button
                onClick={onLoadMore}
                className="bg-white text-primary border-2 border-primary px-8 py-3 rounded-sm hover:bg-green-50 transition font-medium"
              >
                {t("home.producers.load_more")}
              </button>
            </div>
          )}
        </>
      )}
    </section>
  );
}
