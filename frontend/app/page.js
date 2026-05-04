"use client";

import Link from "next/link";
import { motion } from "framer-motion";
import { House, Leaf } from "@phosphor-icons/react";
import ProducerCard from "@/components/ProducerCard";
import HomeProductCard from "@/components/HomeProductCard";
import ParallaxQuote from "@/components/ParallaxQuote";
import { SkeletonProducerGrid } from "@/components/Skeleton";
import AnimatedCounter from "@/components/AnimatedCounter";
import LocationModal from "@/components/LocationModal";
import LocationBanner from "@/components/LocationBanner";
import ChipScrollRow from "@/components/ChipScrollRow";
import { CHIPS_CONFIG } from "@/lib/producer-filters";
import OnboardingTip from "@/components/OnboardingTip";
import HolidayBanner from "@/components/HolidayBanner";
import FridayDeliveryStrip from "@/components/FridayDeliveryStrip";
import { UpcomingEventsPreview } from "@/app/home/UpcomingEventsPreview";
import {
  HomeMarquee,
  HomeFounderQuote,
  HomeHowItWorks,
} from "@/app/home/HomeStaticBlocks";
import { HomeHero } from "@/app/home/HomeHero";
import { HomeCategoryGrid } from "@/app/home/HomeCategoryGrid";
import { useHomePage } from "@/lib/use-home-page";

// PREMIUM_DESIGN: parallax divider images between sections.
const PARALLAX_IMAGE_1 = "https://images.unsplash.com/photo-1488459716781-31db52582fe9?w=1600&auto=format&q=80&fm=webp";
const PARALLAX_IMAGE_2 = "https://images.unsplash.com/photo-1464226184884-fa280b87c399?w=1600&auto=format&q=80&fm=webp";

export default function HomePage() {
  const {
    t, user,
    producers, homeProducts, categories, filters, chips,
    visibleCount, producersLoading, geoLoading,
    recentlyViewed, showNewUserHint, locationModalOpen, setLocationModalOpen,
    fridayMode, step0Visible, userCity,
    onboardStep, onboardAdvance, onboardDismiss,
    visibleProducers, hasMore, categoryCards,
    statsProducersCount, statsCategoriesCount, newestProducers,
    handleNearMe, handleCitySelected, handleCategoryCardClick,
    handleWhatsAppClick, scrollToProducers, toggleChip,
    handleClearCategory, handleLoadMore,
  } = useHomePage();

  return (
    <div>
      <HomeHero
        t={t}
        fridayMode={fridayMode}
        geoLoading={geoLoading}
        onNearMe={handleNearMe}
        onScrollDown={scrollToProducers}
      />

      {/* MEH-50: שוק שישי strip — shown Thu 18:00 → Fri 14:00 only */}
      {fridayMode && <FridayDeliveryStrip city={userCity} />}

      {/* =========================
          SOCIAL PROOF BAR
          PREMIUM_DESIGN: numbers count up from 0 when scrolled into view.
          ========================= */}
      <section className="bg-primary text-white py-4 text-center">
        <p className="font-body text-lg tracking-wide">
          <span className="font-semibold tabular-nums">
            <AnimatedCounter target={statsProducersCount} />
          </span>{" "}
          בתי עסק מאומתים
          &nbsp;·&nbsp;
          <span className="font-semibold tabular-nums">
            <AnimatedCounter target={statsCategoriesCount} />
          </span>{" "}
          קטגוריות
          &nbsp;·&nbsp;
          מכל רחבי הארץ
        </p>
      </section>

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

      {/* =========================
          RECENTLY VIEWED (task 13)
          ========================= */}
      {recentlyViewed.length > 0 && (
        <section className="max-w-7xl mx-auto px-4 pb-10">
          <h2 className="font-headline font-bold text-site-text mb-4" style={{ fontSize: "clamp(22px, 2.5vw, 28px)" }}>
            צפית לאחרונה
          </h2>
          <div className="flex gap-4 overflow-x-auto pb-2 scrollbar-hide -mx-1 ps-1 after:content-[''] after:shrink-0 after:w-4">
            {recentlyViewed.map((p) => {
              const href = p.slug ? `/${p.slug}` : `/producer/${p.id}`;
              const imgSrc = p.images?.[0];
              return (
                <Link
                  key={p.id}
                  href={href}
                  className="shrink-0 w-[160px] bg-background border border-border rounded-[12px] overflow-hidden hover:shadow-md transition group"
                >
                  <div className="relative w-full h-[100px] bg-light overflow-hidden">
                    {imgSrc ? (
                      <img
                        src={imgSrc}
                        alt={p.name}
                        className="w-full h-full object-cover group-hover:scale-105 transition duration-300"
                      />
                    ) : (
                      <div className="flex items-center justify-center h-full text-primary">
                        <Leaf size={32} weight="duotone" aria-hidden="true" />
                      </div>
                    )}
                  </div>
                  <div className="p-2.5">
                    <p className="font-headline font-bold text-sm text-site-text truncate">{p.name}</p>
                    <p className="text-xs text-site-muted truncate">{p.city}</p>
                  </div>
                </Link>
              );
            })}
          </div>
        </section>
      )}

      {/* =========================
          PRODUCERS GRID
          ========================= */}
      <section id="producers-grid" className="max-w-7xl mx-auto px-4 pb-20">
        <div className="flex items-center justify-between mb-8">
          <h2 className="font-headline font-bold text-site-text" style={{ fontSize: "clamp(28px, 3.5vw, 40px)" }}>
            בתי עסק מומלצים
          </h2>
          <Link href="/map" className="text-primary hover:underline flex items-center gap-1">
            הצג במפה 🗺️
          </Link>
        </div>

        {/* Step 0 — producers grid tip (2s delay) */}
        <OnboardingTip
          show={step0Visible && onboardStep === 0}
          text="גלי בתי עסק מקומיים — ירקות טריים, גבינות, לחם מחמצת ועוד 🌿 לחצי על כרטיס כדי לצפות בפרטים"
          onDismiss={onboardDismiss}
          onNext={() => { setStep0Visible(false); onboardAdvance(); }}
        />

        {/* Filter chips */}
        <ChipScrollRow
          variant="toggle"
          chips={CHIPS_CONFIG}
          activeKeys={chips}
          onChipClick={toggleChip}
          fadeBg="#F5F0E8"
          className="mb-3"
        />
        {/* Step 1 — filter chips tip */}
        <OnboardingTip
          show={onboardStep === 1}
          text="סנני לפי אורגני, כשר, משלוח ועוד — לחצי על אחד מהכפתורים למעלה 👆"
          onDismiss={onboardDismiss}
          onNext={onboardAdvance}
        />
        {Object.values(chips).some(Boolean) && (
          <p className="text-xs text-site-muted mb-4" aria-live="polite">
            מסנן לפי:{" "}
            {CHIPS_CONFIG.filter((c) => chips[c.key])
              .map((c) => c.label)
              .join(" · ")}
          </p>
        )}

        {filters.category && (
          <div className="mb-6 flex items-center gap-2">
            <span className="text-sm text-site-muted">מציג:</span>
            {categories.find((c) => String(c.id) === filters.category) && (
              <span className="bg-light text-primary px-3 py-1 rounded-full text-sm">
                {categories.find((c) => String(c.id) === filters.category).emoji}{" "}
                {categories.find((c) => String(c.id) === filters.category).name}
              </span>
            )}
            <button
              onClick={handleClearCategory}
              className="text-sm text-primary hover:underline"
            >
              נקה סינון
            </button>
          </div>
        )}

        {producersLoading ? (
          <SkeletonProducerGrid count={8} />
        ) : (
          <>
            {/* MEH-23 — "מציגים X מתוך Y" counter above the grid. */}
            {producers.length > 0 && (
              <p
                className="text-sm text-site-muted mb-3"
                data-testid="producers-counter"
                aria-live="polite"
              >
                מציגים {Math.min(visibleCount, producers.length)} מתוך {producers.length}
              </p>
            )}
            {showNewUserHint && visibleProducers.length > 0 && (
              <div className="flex items-center gap-2 bg-light border border-primary/20 rounded-[12px] px-4 py-2.5 mb-4 text-sm text-primary w-fit">
                <span className="relative flex h-2.5 w-2.5 flex-shrink-0">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-primary opacity-60" />
                  <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-primary" />
                </span>
                לחצי ❤️ בכרטיס עסק כדי לשמור עסקים שאהבת
              </div>
            )}
            <div className="grid grid-cols-2 gap-3 md:gap-6 lg:grid-cols-4">
              {visibleProducers.map((p, idx) => (
                <motion.div
                  key={p.id}
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
                <div className="inline-flex items-center justify-center w-20 h-20 rounded-full bg-light mb-4" aria-hidden="true">
                  <Leaf size={36} weight="duotone" className="text-primary" />
                </div>
                <h3 className="font-headline text-xl font-bold text-site-text mb-2">
                  לא מצאנו עסקים באזור הזה — עדיין 🌱
                </h3>
                <p className="text-site-muted mb-5 max-w-md mx-auto">
                  נסי לשנות את הסינון, או גלי בתי עסק על המפה
                </p>
                <Link
                  href="/map"
                  className="inline-flex items-center gap-2 bg-primary text-white px-6 py-3 rounded-[16px] hover:bg-primary-light transition font-medium"
                >
                  גלי על המפה
                </Link>
              </div>
            )}
            {hasMore && (
              <div className="text-center mt-8">
                <button
                  onClick={handleLoadMore}
                  className="bg-white text-primary border-2 border-primary px-8 py-3 rounded-[16px] hover:bg-light transition font-medium"
                >
                  עוד בתי עסק
                </button>
              </div>
            )}
          </>
        )}
      </section>

      {/* =========================
          NEW PRODUCERS (last 4 added)
          ========================= */}
      {newestProducers.length > 0 && (
        <section className="max-w-7xl mx-auto px-4 pb-20">
          <h2 className="font-headline font-bold text-site-text mb-8" style={{ fontSize: "clamp(26px, 3vw, 36px)" }}>
            עסקים חדשים ✨
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

      {/* =========================
          מהמטבח של השכן — preview (max 3)
          Full browse lives at /neighbor. Hidden entirely when no products exist.
          ========================= */}
      {homeProducts.length > 0 && (
      <section
        id="home-kitchen"
        className="max-w-7xl mx-auto px-4 section-y border-t border-border scroll-mt-24"
      >
        <div className="flex items-baseline justify-between mb-6">
          <h2
            className="font-headline font-bold text-site-text inline-flex items-center gap-2"
            style={{ fontSize: "clamp(28px, 3.5vw, 40px)" }}
          >
            <House size={32} weight="duotone" className="text-primary" aria-hidden="true" />
            מהמטבח של השכן
          </h2>
          <Link
            href="/neighbor"
            className="text-primary hover:underline text-sm font-medium whitespace-nowrap"
          >
            ראי עוד →
          </Link>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {homeProducts.slice(0, 3).map((hp) => (
            <HomeProductCard
              key={hp.id}
              product={hp}
              onWhatsAppClick={() => handleWhatsAppClick(hp.id)}
            />
          ))}
        </div>
      </section>
      )}

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

      {/* =========================
          CTA — הוסף את העסק שלך
          ========================= */}
      <section className="bg-primary-dark text-white py-20">
        <div className="max-w-3xl mx-auto px-4 text-center">
          <h2 className="font-headline font-bold mb-4" style={{ fontSize: "clamp(32px, 4vw, 52px)" }}>
            יש לך עסק? בואי אליו
          </h2>
          <p className="text-light/90 text-lg mb-8 max-w-xl mx-auto">
            אם את בעלת עסק, חקלאית או מגדלת — הצטרפי לדירקטורי הראשון בישראל לאוכל אמיתי.
          </p>
          <Link
            href="/register/producer"
            className="inline-block bg-white text-primary px-8 py-3 rounded-[12px] hover:bg-light transition font-medium"
          >
            הוסיפי את העסק שלך 🌿
          </Link>
        </div>
      </section>
    </div>
  );
}
