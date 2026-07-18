"use client";

import { useEffect } from "react";
import { useParams } from "next/navigation";
import { useLocale, useTranslations } from "next-intl";
import { Info, Package, Truck, ChatCircleText } from "@phosphor-icons/react";

import Breadcrumb from "@/components/Breadcrumb";
import ImageGallery from "@/components/ImageGallery";
// MEH-1306: owner-only per-section pencil (self-gating, 0 DOM non-owner).
import OwnerSectionEditLink from "@/components/OwnerSectionEditLink";
import { useAuth } from "@/lib/auth-context";

import ContactCard from "./components/ContactCard";
import ContactSidebar from "./components/ContactSidebar";
import OwnerEditBar from "./components/OwnerEditBar";
import ProducerHeader from "./components/ProducerHeader";
import ProducerSections from "./components/ProducerSections";
import StickyContactBar from "./components/StickyContactBar";
import { useLazyReviews } from "./hooks/useLazyReviews";
import { useProducerData } from "./hooks/useProducerData";
import { useStickyBar } from "./hooks/useStickyBar";
import { useTabScroll } from "./hooks/useTabScroll";
import {
  buildShareUrl,
  getRenderableImages,
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
  const { user } = useAuth();
  const t = useTranslations();
  const locale = useLocale();

  const { producer, loading, events, similarProducers, nearbyProducers } = useProducerData({
    params,
    fetchPath,
    initialProducer,
  });
  const { activeTab, sectionRefs, tabBarRef, scrollToSection } = useTabScroll();
  const { inlineCTARef, isBarVisible } = useStickyBar({ producerId: producer?.id });
  const { reviewsContainerRef, reviewsVisible } = useLazyReviews({ producerId: producer?.id });

  // MEH-1306: deep-link landing for the edit tab's "view on page" links. The
  // sections mount only after the client fetch resolves, so the browser's
  // native hash scroll fires before #section-* exists — re-apply it once the
  // producer has rendered (mirror of edit/page.js applyHash, load-time only;
  // later same-page hash clicks scroll natively because the target exists).
  useEffect(() => {
    if (!producer) return;
    const hash = window.location.hash.replace(/^#/, "");
    if (!hash.startsWith("section-")) return;
    requestAnimationFrame(() => {
      document.getElementById(hash)?.scrollIntoView({ behavior: "smooth", block: "start" });
    });
  }, [producer]);

  if (loading) {
    return (
      <div className="max-w-4xl mx-auto px-4 py-12 text-center text-fg-muted">
        {t("producer.detail.loading_fresh")}
      </div>
    );
  }

  if (!producer) {
    return (
      <div className="max-w-4xl mx-auto px-4 py-12 text-center text-fg-muted">
        {t("producer.detail.not_found")}
      </div>
    );
  }

  const shareUrl = buildShareUrl(producer);
  // MEH-291 — read from new availability_state with legacy fallback during the 7-day overlap.
  const isVacation =
    producer.availability_state === "on_vacation" ||
    (!producer.availability_state && producer.availability_status === "vacation");
  const vacationReturnLabel = getVacationReturnLabel(producer, t, locale);
  // MEH-815: imageless profiles render the Tinted Masthead hero (name as h1);
  // ProducerHeader omits its own name h1 in that case to keep the name singular.
  // MEH-1121 (Task D): blank/whitespace image entries are filtered out so a
  // producer with only empty strings is treated as imageless — hasImages and
  // the gallery prop below both derive from this one list (single owner).
  const images = getRenderableImages(producer.images);
  const hasImages = images.length > 0;
  const primaryCategory = producer.categories?.[0];

  return (
    <div className="max-w-6xl mx-auto px-4 py-6">
      {/* MEH-1209: owner-only edit entry — renders above the h1 (which lives in
          the Tinted Masthead for imageless profiles and in ProducerHeader
          otherwise), in-flow, above the fold. Self-gates on ownership; a
          non-owner viewer gets 0 DOM, so there is no reserved space / CLS. */}
      <OwnerEditBar producer={producer} />
      {/* MEH-1146 chunk B: breadcrumb only — the redundant "→ חזרה" button was
          removed (the breadcrumb already provides the home/category path). */}
      <div className="mb-4">
        <Breadcrumb
          items={[
            { href: "/", label: t("producer.detail.breadcrumb_home") },
            ...(primaryCategory
              ? [{ href: `/?category=${primaryCategory.id}`, label: primaryCategory.name }]
              : []),
            { label: producer.name },
          ]}
        />
      </div>

      {/* Gallery — MEH-1306: wrapped with the stable section id (deep-link
          target of the edit tab's view-link) + an owner-only pencil row below
          it (→ #images card). Non-owners get an empty zero-height flex div —
          no reserved space, no CLS. */}
      <div id="section-images" className="scroll-mt-[calc(var(--chrome-top,82px)_+_68px)] md:scroll-mt-24">
        <ImageGallery
          images={images}
          producerId={producer.id}
          producerName={producer.name}
          verified={producer.verification_tier === "verified"}
        />
        <div className="flex justify-end">
          <OwnerSectionEditLink producerId={producer.id} anchor="images" sectionKey="images" />
        </div>
      </div>

      {/* Mobile tab bar — MEH-1168 P2: sticks BELOW the global sticky header so
          it stays visible page-long (at top-0 it hid behind the z-[1050]
          header once scrolled into a deep section). MEH-1202: the offset is now
          the LIVE-measured header height via the `--chrome-top` CSS var
          (Header.jsx publishes it), not the old hardcoded `top-[82px]` — the
          82px stays only as an SSR/first-paint fallback. */}
      <nav
        ref={tabBarRef}
        style={{ top: "var(--chrome-top, 82px)" }}
        className="md:hidden sticky z-30 bg-white border-b border-border -mx-4 px-4 mt-6"
        aria-label={t("producer.detail.aria.tab_nav")}
      >
        <div className="flex">
          {[
            { key: "about", label: t("producer.detail.tabs.about"), Icon: Info },
            { key: "products", label: t("producer.detail.tabs.products"), Icon: Package },
            { key: "delivery", label: t("producer.detail.tabs.delivery"), Icon: Truck },
            // MEH-1168 P1: reviews tab uses a chat-bubble glyph, not a star — a
            // star implies a rating system the reviews section doesn't provide.
            { key: "reviews", label: t("producer.detail.tabs.reviews_label"), Icon: ChatCircleText },
          ].map((tab) => (
            <button
              key={tab.key}
              type="button"
              onClick={() => scrollToSection(tab.key)}
              className={`flex-1 flex flex-col items-center gap-1 py-3 min-h-[44px] text-xs font-medium transition border-b-2 ${
                activeTab === tab.key
                  ? "border-primary text-primary"
                  : "border-transparent text-fg-muted"
              }`}
            >
              <tab.Icon size={18} weight={activeTab === tab.key ? "fill" : "regular"} />
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
            hasImages={hasImages}
          />
          {/* Mobile/tablet inline contact card — the IntersectionObserver
              target for useStickyBar. Must stay the first child after
              ProducerHeader so the sticky bar fires at the same scroll
              boundary as the pre-1146 inline CTA. Desktop renders the card
              in the sticky sidebar instead (ContactSidebar, hidden below lg),
              so exactly one primary CTA is visible per viewport. */}
          {/* MEH-1306: section-contact anchors the inline (mobile) card — on
              desktop this wrapper is display:none, but the contact card is
              already always visible there in the sticky sidebar. Owner-only
              pencil row above the card (→ #contact-channels); non-owners get
              an empty zero-height flex div — no CLS. */}
          <div ref={inlineCTARef} id="section-contact" className="lg:hidden mt-4 scroll-mt-[calc(var(--chrome-top,82px)_+_68px)]">
            <div className="flex justify-end">
              <OwnerSectionEditLink producerId={producer.id} anchor="contact-channels" sectionKey="contact" />
            </div>
            <ContactCard
              producer={producer}
              isVacation={isVacation}
              primaryCategory={primaryCategory}
              shareUrl={shareUrl}
            />
          </div>
          <ProducerSections
            producer={producer}
            events={events}
            similarProducers={similarProducers}
            nearbyProducers={nearbyProducers}
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
          primaryCategory={primaryCategory}
          shareUrl={shareUrl}
        />
      </div>

      {/* StickyContactBar — mobile only, IO-driven, always mounted. */}
      <StickyContactBar
        producer={producer}
        isVacation={isVacation}
        isBarVisible={isBarVisible}
      />
    </div>
  );
}
