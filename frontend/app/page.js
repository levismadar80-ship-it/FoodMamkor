"use client";

import Link from "next/link";
import { House, Leaf } from "@phosphor-icons/react";
import ProducerCard from "@/components/ProducerCard";
import HomeProductCard from "@/components/HomeProductCard";
import ParallaxQuote from "@/components/ParallaxQuote";
import AnimatedCounter from "@/components/AnimatedCounter";
import LocationModal from "@/components/LocationModal";
import LocationBanner from "@/components/LocationBanner";
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
import { HomeProducersGrid } from "@/app/home/HomeProducersGrid";
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
    handleClearCategory, handleLoadMore, handleAdvanceFromStep0,
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
