"use client";

import { useParams, useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { Info, Package, Truck, Star } from "@phosphor-icons/react";

import Breadcrumb from "@/components/Breadcrumb";
import ImageGallery from "@/components/ImageGallery";
import { useAuth } from "@/lib/auth-context";

import ActionRow from "./components/ActionRow";
import ContactSidebar from "./components/ContactSidebar";
import ProducerHeader from "./components/ProducerHeader";
import ProducerSections from "./components/ProducerSections";
import StickyContactBar from "./components/StickyContactBar";
import { useLazyReviews } from "./hooks/useLazyReviews";
import { useProducerData } from "./hooks/useProducerData";
import { useStickyBar } from "./hooks/useStickyBar";
import { useTabScroll } from "./hooks/useTabScroll";
import {
  buildShareUrl,
  buildShowOnMapHandler,
  getProducerInitials,
  getVacationReturnLabel,
} from "./lib/producer-format";

/**
 * Producer detail page (docs/archive/ALL_PAGES_DESIGN.md עמוד 2).
 *
 * Layout: two-column on desktop — main info on the right (RTL leading),
 * sticky contact card on the left. Contact card stays visible while the
 * user scrolls through description/delivery/reviews.
 * Mobile: single column, contact card inlines after the header.
 *
 * Refactored in MEH-407 Phase 2.1 — body lives across hooks/, lib/,
 * components/. This file is now compose-only.
 */
export default function ProducerDetail({ initialProducer = null, fetchPath = null }) {
  const params = useParams();
  const router = useRouter();
  const { user } = useAuth();
  const t = useTranslations();

  const { producer, loading, events, similarProducers } = useProducerData({
    params,
    fetchPath,
    initialProducer,
  });
  const { activeTab, sectionRefs, tabBarRef, scrollToSection } = useTabScroll();
  const { inlineCTARef, isBarVisible } = useStickyBar({ producerId: producer?.id });
  const { reviewsContainerRef, reviewsVisible } = useLazyReviews({ producerId: producer?.id });

  if (loading) {
    return (
      <div className="max-w-4xl mx-auto px-4 py-12 text-center text-site-muted">
        {t("producer.detail.loading_fresh")}
      </div>
    );
  }

  if (!producer) {
    return (
      <div className="max-w-4xl mx-auto px-4 py-12 text-center text-site-muted">
        {t("producer.detail.not_found")}
      </div>
    );
  }

  const shareUrl = buildShareUrl(producer);
  // MEH-291 — read from new availability_state with legacy fallback during the 7-day overlap.
  const isVacation =
    producer.availability_state === "on_vacation" ||
    (!producer.availability_state && producer.availability_status === "vacation");
  const vacationReturnLabel = getVacationReturnLabel(producer);
  const producerInitials = getProducerInitials(producer);
  const primaryCategory = producer.categories?.[0];
  const handleShowOnMap = buildShowOnMapHandler(producer, router);

  return (
    <div className="max-w-6xl mx-auto px-4 py-6">
      {/* Breadcrumb + back button */}
      <div className="flex items-center justify-between mb-4">
        <Breadcrumb
          items={[
            { href: "/", label: t("producer.detail.breadcrumb_home") },
            ...(primaryCategory
              ? [{ href: `/?category=${primaryCategory.id}`, label: primaryCategory.name }]
              : []),
            { label: producer.name },
          ]}
        />
        <button
          type="button"
          onClick={() => router.back()}
          className="min-h-[44px] flex items-center text-sm text-primary hover:underline focus-visible:ring-2 focus-visible:ring-primary/40 rounded-lg px-1"
          aria-label={t("producer.detail.aria.back")}
        >
          {t("producer.detail.back_label")}
        </button>
      </div>

      {/* Gallery */}
      <ImageGallery
        images={producer.images || []}
        producerId={producer.id}
        categoryEmoji={primaryCategory?.emoji ?? "🌿"}
        producerInitials={producerInitials}
      />

      {/* Mobile tab bar */}
      <nav
        ref={tabBarRef}
        className="md:hidden sticky top-0 z-30 bg-white border-b border-border -mx-4 px-4 mt-6"
        aria-label={t("producer.detail.aria.tab_nav")}
      >
        <div className="flex">
          {[
            { key: "about", label: t("producer.detail.tabs.about"), Icon: Info },
            { key: "products", label: t("producer.detail.tabs.products"), Icon: Package },
            { key: "delivery", label: t("producer.detail.tabs.delivery"), Icon: Truck },
            { key: "reviews", label: t("producer.detail.tabs.reviews_label"), Icon: Star },
          ].map((tab) => (
            <button
              key={tab.key}
              type="button"
              onClick={() => scrollToSection(tab.key)}
              className={`flex-1 flex flex-col items-center gap-1 py-3 min-h-[44px] text-xs font-medium transition border-b-2 ${
                activeTab === tab.key
                  ? "border-primary text-primary"
                  : "border-transparent text-site-muted"
              }`}
            >
              <tab.Icon size={18} weight={activeTab === tab.key ? "fill" : "duotone"} />
              {tab.label}
            </button>
          ))}
        </div>
      </nav>

      {/* Two-column layout: main + sticky contact sidebar */}
      <div className="mt-8 grid grid-cols-1 lg:grid-cols-[1fr_320px] gap-8">
        {/* ================= Main column ================= */}
        <div>
          <ProducerHeader
            producer={producer}
            isVacation={isVacation}
            vacationReturnLabel={vacationReturnLabel}
            primaryCategory={primaryCategory}
          />
          <ActionRow
            producer={producer}
            user={user}
            inlineCTARef={inlineCTARef}
            shareUrl={shareUrl}
            onShowOnMap={handleShowOnMap}
          />
          <ProducerSections
            producer={producer}
            events={events}
            similarProducers={similarProducers}
            sectionRefs={sectionRefs}
            reviewsContainerRef={reviewsContainerRef}
            reviewsVisible={reviewsVisible}
            isOwner={user?.producer_id === producer.id}
          />
        </div>

        {/* ================= Sticky contact sidebar ================= */}
        <ContactSidebar
          producer={producer}
          isVacation={isVacation}
          vacationReturnLabel={vacationReturnLabel}
          primaryCategory={primaryCategory}
          shareUrl={shareUrl}
        />
      </div>

      {/* StickyContactBar — mobile only, IO-driven, always mounted. */}
      <StickyContactBar
        producer={producer}
        isVacation={isVacation}
        vacationReturnLabel={vacationReturnLabel}
        isBarVisible={isBarVisible}
      />
    </div>
  );
}
