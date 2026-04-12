"use client";

import { useEffect, useRef, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import {
  MapPin, MapTrifold, Phone, InstagramLogo, Globe,
  WhatsappLogo, Seal, ShareNetwork, Leaf, Cow,
} from "@phosphor-icons/react";
import api from "@/lib/api";
import { normalizePhone } from "@/lib/utils";
import { showToast } from "@/lib/toast";
import ImageGallery from "@/components/ImageGallery";
import CategoryTag from "@/components/CategoryTag";
import FavoriteButton from "@/components/FavoriteButton";
import FollowButton from "@/components/FollowButton";
import ReportButton from "@/components/ReportButton";
import WhatsAppShareButton from "@/components/WhatsAppShareButton";
import Breadcrumb from "@/components/Breadcrumb";
import ProducerReviews from "@/components/ProducerReviews";
import DirectoryDisclaimer from "@/components/DirectoryDisclaimer";

/**
 * Producer detail page — redesigned April 2026.
 *
 * Desktop (≥ 1024px): two-column layout. Main info on right (RTL leading),
 * sticky contact card on left. Everything visible, no tabs.
 *
 * Mobile (< 1024px): single column with tabs to reduce vertical scrolling.
 *   - Always visible: gallery, name+badges, contact buttons grid
 *   - Tabbed section: אודות | מוצרים | משלוח | ביקורות
 *   - Sticky bottom bar with WhatsApp CTA
 */
export default function ProducerDetail({ initialProducer = null, fetchPath = null }) {
  const params = useParams();
  const router = useRouter();
  const [producer, setProducer] = useState(initialProducer);
  const [loading, setLoading] = useState(!initialProducer);
  const [activeTab, setActiveTab] = useState("about");

  // Sticky mobile CTA: show when sidebar scrolls out of view
  const contactRef = useRef(null);
  const [showStickyBar, setShowStickyBar] = useState(false);

  useEffect(() => {
    const el = contactRef.current;
    if (!el) return;
    const observer = new IntersectionObserver(
      ([entry]) => setShowStickyBar(!entry.isIntersecting),
      { threshold: 0 },
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, [producer]);

  useEffect(() => {
    if (initialProducer) return;
    const path = fetchPath || `/producers/${params.id}`;
    api
      .get(path)
      .then((r) => setProducer(r.data))
      .catch(() => setProducer(null))
      .finally(() => setLoading(false));
  }, [params.id, fetchPath, initialProducer]);

  // Task 13: save to recently viewed in localStorage
  useEffect(() => {
    if (!producer?.id) return;
    try {
      const key = "recently_viewed";
      const stored = JSON.parse(localStorage.getItem(key) || "[]");
      const filtered = stored.filter((id) => id !== producer.id);
      filtered.unshift(producer.id);
      localStorage.setItem(key, JSON.stringify(filtered.slice(0, 5)));
    } catch {}
  }, [producer?.id]);

  if (loading) {
    return (
      <div className="max-w-4xl mx-auto px-4 py-12 text-center text-site-muted">
        טוענת עסקים טריים...
      </div>
    );
  }

  if (!producer) {
    return (
      <div className="max-w-4xl mx-auto px-4 py-12 text-center text-site-muted">
        לא מצאנו את בית העסק הזה — עדיין 🌱
      </div>
    );
  }

  const shareUrl =
    typeof window !== "undefined"
      ? `${window.location.origin}${producer.slug ? `/${producer.slug}` : `/producer/${producer.id}`}`
      : "";

  const primaryCategory = producer.categories?.[0];
  const whatsappNumber = normalizePhone(producer.phone) || null;
  const whatsappHref = whatsappNumber
    ? `https://wa.me/${whatsappNumber}?text=${encodeURIComponent(`היי! מצאתי אותך במהמקור — ${producer.name}`)}`
    : null;

  const hasProducts = producer.products?.length > 0;
  const hasDelivery = producer.delivery_areas?.length > 0;

  const handleShowOnMap = () => {
    try {
      sessionStorage.setItem(
        "focusProducer",
        JSON.stringify({ id: producer.id, lat: producer.lat, lng: producer.lng, name: producer.name }),
      );
    } catch {}
    router.push("/map");
  };

  const handleCopyLink = async () => {
    if (!shareUrl) return;
    if (typeof navigator !== "undefined" && navigator.share) {
      try { await navigator.share({ title: producer.name, url: shareUrl }); return; } catch {}
    }
    try {
      await navigator.clipboard.writeText(shareUrl);
      showToast("הקישור הועתק ✓");
    } catch {
      const ta = document.createElement("textarea");
      ta.value = shareUrl;
      document.body.appendChild(ta);
      ta.select();
      try { document.execCommand("copy"); showToast("הקישור הועתק ✓"); } finally { document.body.removeChild(ta); }
    }
  };

  const fireWhatsAppBeacon = () => {
    if (typeof navigator !== "undefined" && navigator.sendBeacon) {
      try { navigator.sendBeacon(`/api/producers/${producer.id}/whatsapp-click`); } catch {}
    }
  };

  // Build tabs list — hide empty ones
  const tabs = [
    { key: "about", label: "אודות" },
    ...(hasProducts ? [{ key: "products", label: "מוצרים" }] : []),
    ...(hasDelivery ? [{ key: "delivery", label: "משלוח" }] : []),
    { key: "reviews", label: "ביקורות" },
  ];

  // ─────────────── Shared content sections ───────────────
  const DescriptionSection = () => (
    <>
      {producer.description && (
        <div className="mb-6">
          <p className="text-site-text/85 leading-relaxed whitespace-pre-line">
            {producer.description}
          </p>
        </div>
      )}
      {/* Pill badges */}
      {(producer.organic_certified || producer.grass_fed || producer.kosher) && (
        <div className="flex flex-wrap gap-2 mb-6">
          {producer.organic_certified && (
            <span className="bg-light text-primary inline-flex items-center gap-1 text-sm" style={{ borderRadius: "20px", padding: "4px 12px" }}>
              <Leaf size={14} weight="duotone" /> אורגני
            </span>
          )}
          {producer.grass_fed && (
            <span className="bg-light text-primary inline-flex items-center gap-1 text-sm" style={{ borderRadius: "20px", padding: "4px 12px" }}>
              <Cow size={14} weight="duotone" /> גראס פד
            </span>
          )}
          {producer.kosher && (
            <span className="bg-light text-primary text-sm" style={{ borderRadius: "20px", padding: "4px 12px" }}>
              ✡️ {producer.kosher}
            </span>
          )}
        </div>
      )}
      {producer.categories?.length > 1 && (
        <div className="flex flex-wrap gap-2 mb-6">
          {producer.categories.map((cat) => <CategoryTag key={cat.id} category={cat} />)}
        </div>
      )}
      <DirectoryDisclaimer />
      <div className="mt-6 pt-6 border-t border-border">
        <ReportButton producerId={producer.id} />
      </div>
    </>
  );

  const ProductsSection = () => (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
      {producer.products.map((product) => (
        <div key={product.id} className="bg-white rounded-[12px] p-4 border border-border">
          <p className="font-medium text-site-text">{product.name}</p>
          {product.description && <p className="text-sm text-site-muted mt-1">{product.description}</p>}
          {product.price_range && <p className="text-accent font-medium mt-2">{product.price_range}</p>}
        </div>
      ))}
    </div>
  );

  const DeliverySection = () => (
    <div className="bg-white rounded-[12px] overflow-hidden border border-border overflow-x-auto">
      <table className="w-full min-w-[360px]">
        <thead className="bg-light">
          <tr>
            <th className="text-right px-4 py-3 text-sm font-medium text-primary">עיר</th>
            <th className="text-right px-4 py-3 text-sm font-medium text-primary">מינימום הזמנה</th>
            <th className="text-right px-4 py-3 text-sm font-medium text-primary">יום משלוח</th>
          </tr>
        </thead>
        <tbody>
          {producer.delivery_areas.map((da) => (
            <tr key={da.id} className="border-t border-border">
              <td className="px-4 py-3 text-site-text">{da.city}</td>
              <td className="px-4 py-3 text-site-text">{da.min_order ? `₪${da.min_order}` : "—"}</td>
              <td className="px-4 py-3 text-site-text">{da.delivery_day || "—"}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );

  // ─────────────── Contact buttons (shared between mobile + desktop) ───────────────
  const btnClass = "flex items-center justify-center gap-2 border border-border text-site-text px-3 rounded-[10px] hover:bg-light transition text-sm font-medium focus-visible:ring-2 focus-visible:ring-primary/40";
  const btnStyle = { minHeight: "48px" };

  const ContactButtons = () => (
    <div ref={contactRef} className="flex flex-col gap-2.5">
      {/* Row 1: Phone + Instagram (2-col grid) */}
      <div className="grid grid-cols-2 gap-2.5">
        {producer.phone ? (
          <a href={`tel:${producer.phone}`} className={btnClass} style={btnStyle} dir="ltr">
            <Phone size={18} weight="duotone" className="text-primary shrink-0" />
            <span className="truncate">{producer.phone}</span>
          </a>
        ) : <div />}
        {producer.instagram ? (
          <a href={`https://instagram.com/${producer.instagram}`} target="_blank" rel="noopener noreferrer" className={btnClass} style={btnStyle}>
            <InstagramLogo size={18} weight="duotone" className="text-primary shrink-0" />
            <span className="truncate">@{producer.instagram}</span>
          </a>
        ) : <div />}
      </div>
      {/* Row 2: Website + Copy link */}
      <div className="grid grid-cols-2 gap-2.5">
        {producer.website ? (
          <a href={producer.website.startsWith("http") ? producer.website : `https://${producer.website}`} target="_blank" rel="noopener noreferrer" className={btnClass} style={btnStyle}>
            <Globe size={18} weight="duotone" className="text-primary shrink-0" />
            אתר
          </a>
        ) : <div />}
        <button type="button" onClick={handleCopyLink} className={btnClass} style={btnStyle}>
          <ShareNetwork size={18} weight="duotone" className="text-primary shrink-0" />
          העתק קישור
        </button>
      </div>
      {/* Row 3: Share full width */}
      <WhatsAppShareButton producer={producer} url={shareUrl} />
      {/* Row 4: Show on map */}
      {producer.lat && producer.lng && (
        <button type="button" onClick={handleShowOnMap} className="w-full flex items-center justify-center gap-2 border border-primary text-primary px-4 rounded-[10px] hover:bg-light transition text-sm font-medium focus-visible:ring-2 focus-visible:ring-primary/40" style={btnStyle}>
          <MapTrifold size={16} weight="duotone" />
          הצג במפה
        </button>
      )}
      {/* Row 5: WhatsApp CTA — primary green */}
      {whatsappHref && (
        <a href={whatsappHref} target="_blank" rel="noopener noreferrer" onClick={fireWhatsAppBeacon} className="flex items-center justify-center gap-2 bg-[#25D366] text-white px-4 rounded-[10px] hover:bg-[#1ea855] transition font-medium focus-visible:ring-2 focus-visible:ring-[#25D366]/40" style={btnStyle}>
          <WhatsappLogo size={20} weight="fill" />
          שלחי הודעה
        </a>
      )}
    </div>
  );

  // ─────────────── Render ───────────────
  return (
    <div className="max-w-6xl mx-auto px-4 py-6 pb-20 lg:pb-6">
      {/* Breadcrumb */}
      <div className="flex items-center justify-between mb-4">
        <Breadcrumb
          items={[
            { href: "/", label: "בית" },
            ...(primaryCategory ? [{ href: `/?category=${primaryCategory.id}`, label: primaryCategory.name }] : []),
            { label: producer.name },
          ]}
        />
        <button type="button" onClick={() => router.back()} className="text-sm text-primary hover:underline focus-visible:ring-2 focus-visible:ring-primary/40 rounded py-2 px-3" aria-label="חזרה לעמוד הקודם">
          ← חזרה
        </button>
      </div>

      {/* Gallery */}
      <ImageGallery images={producer.images || []} />

      {/* ================= MOBILE LAYOUT (< lg) ================= */}
      <div className="lg:hidden mt-6">
        {/* Name + badges */}
        <div className="flex items-center flex-wrap gap-2 mb-2">
          <h1 className="font-headline text-2xl font-bold text-site-text">{producer.name}</h1>
          {producer.is_verified && (
            <span className="bg-light text-primary border border-primary/20 text-xs px-2 py-0.5 rounded-full inline-flex items-center gap-1">
              <Seal size={12} weight="fill" /> מאומת
            </span>
          )}
          {producer.reviews_count > 0 && (
            <span className="bg-[#FFF9E6] text-[#946A00] border border-[#F0C040] text-xs px-2 py-0.5 rounded-full">
              ⭐ {Number(producer.avg_rating).toFixed(1)} ({producer.reviews_count})
            </span>
          )}
        </div>
        <p className="text-site-muted text-sm flex items-center gap-1.5 mb-1">
          <MapPin size={14} weight="duotone" />
          {producer.city}
          {primaryCategory && <><span className="mx-1">·</span>{primaryCategory.emoji} {primaryCategory.name}</>}
        </p>
        {producer.starting_price_label && (
          <p className="text-accent font-semibold text-sm mb-4">{producer.starting_price_label}</p>
        )}

        {/* Contact buttons grid */}
        <ContactButtons />

        {/* Follow + favorite row */}
        <div className="flex gap-2 mt-3 mb-4">
          <div className="flex-1"><FollowButton producerId={producer.id} /></div>
          <FavoriteButton producerId={producer.id} />
        </div>

        {/* ── Tab bar ── */}
        <div className="sticky top-16 z-30 bg-background -mx-4 px-4 border-b border-border">
          <div className="flex" role="tablist">
            {tabs.map((tab) => (
              <button
                key={tab.key}
                role="tab"
                aria-selected={activeTab === tab.key}
                onClick={() => setActiveTab(tab.key)}
                className={`flex-1 py-3 text-sm font-medium text-center border-b-2 -mb-px transition ${
                  activeTab === tab.key
                    ? "border-primary text-primary"
                    : "border-transparent text-site-muted hover:text-primary"
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>
        </div>

        {/* ── Tab content ── */}
        <div className="mt-4">
          {activeTab === "about" && <DescriptionSection />}
          {activeTab === "products" && hasProducts && <ProductsSection />}
          {activeTab === "delivery" && hasDelivery && <DeliverySection />}
          {activeTab === "reviews" && <ProducerReviews producerId={producer.id} />}
        </div>
      </div>

      {/* ================= DESKTOP LAYOUT (≥ lg) ================= */}
      <div className="hidden lg:grid mt-8 grid-cols-[1fr_320px] gap-8">
        {/* Main column */}
        <div>
          <div className="flex items-center flex-wrap gap-2 mb-2">
            <h1 className="font-headline text-4xl font-bold text-site-text">{producer.name}</h1>
            {producer.is_verified && (
              <span className="bg-light text-primary border border-primary/20 text-xs px-3 py-1 rounded-full inline-flex items-center gap-1">
                <Seal size={14} weight="fill" /> עסק מאומת
              </span>
            )}
            {producer.reviews_count > 0 && (
              <span className="bg-[#FFF9E6] text-[#946A00] border border-[#F0C040] text-xs px-3 py-1 rounded-full" title={`${producer.reviews_count} ביקורות`}>
                ⭐ {Number(producer.avg_rating).toFixed(1)} ({producer.reviews_count})
              </span>
            )}
            {producer.plan === "premium" && (
              <span className="bg-accent text-white text-xs px-3 py-1 rounded-full">פרמיום</span>
            )}
          </div>

          <p className="text-site-muted text-sm flex items-center gap-1.5 mb-3">
            <MapPin size={14} weight="duotone" />
            {producer.city}
            {primaryCategory && <><span className="mx-1">·</span>{primaryCategory.emoji} {primaryCategory.name}</>}
          </p>

          {(producer.top_product_name || producer.starting_price_label) && (
            <p className="mt-1 text-sm mb-3">
              {producer.top_product_name && <span className="text-site-text">{producer.top_product_name}</span>}
              {producer.top_product_name && producer.starting_price_label && <span className="text-site-muted"> · </span>}
              {producer.starting_price_label && <span className="text-accent font-semibold">{producer.starting_price_label}</span>}
            </p>
          )}

          {producer.categories?.length > 1 && (
            <div className="flex flex-wrap gap-2 mt-4">
              {producer.categories.map((cat) => <CategoryTag key={cat.id} category={cat} />)}
            </div>
          )}

          {producer.description && (
            <section className="mt-8">
              <h2 className="font-headline text-2xl font-bold text-site-text mb-3">אודות</h2>
              <p className="text-site-text/85 leading-relaxed whitespace-pre-line">{producer.description}</p>
            </section>
          )}

          {hasProducts && (
            <section className="mt-8">
              <h2 className="font-headline text-2xl font-bold text-site-text mb-4">מוצרים</h2>
              <ProductsSection />
            </section>
          )}

          {hasDelivery && (
            <section className="mt-8">
              <h2 className="font-headline text-2xl font-bold text-site-text mb-4">אזורי משלוח</h2>
              <DeliverySection />
            </section>
          )}

          <DirectoryDisclaimer className="mt-8" />
          <div className="mt-6 pt-6 border-t border-border">
            <ReportButton producerId={producer.id} />
          </div>
          <ProducerReviews producerId={producer.id} />
        </div>

        {/* Desktop sidebar */}
        <aside>
          <div className="sticky top-24 bg-white rounded-[16px] p-6 border border-border shadow-[0_4px_24px_rgba(46,104,83,0.06)]">
            <h3 className="font-headline text-xl font-bold text-site-text mb-4">צרי קשר</h3>
            <ContactButtons />
            <div className="flex gap-2 mt-3">
              <div className="flex-1"><FollowButton producerId={producer.id} /></div>
              <FavoriteButton producerId={producer.id} />
            </div>
          </div>
        </aside>
      </div>

      {/* Sticky mobile WhatsApp bar — hidden on desktop */}
      {whatsappHref && showStickyBar && (
        <div className="lg:hidden fixed bottom-0 inset-x-0 z-[800] bg-white border-t border-border px-4 py-3 shadow-[0_-2px_12px_rgba(0,0,0,0.08)]">
          <a
            href={whatsappHref}
            target="_blank"
            rel="noopener noreferrer"
            onClick={fireWhatsAppBeacon}
            className="flex items-center justify-center gap-2 bg-[#25D366] text-white w-full py-3 rounded-[10px] hover:bg-[#1ea855] transition font-medium"
          >
            <WhatsappLogo size={20} weight="fill" />
            שלחי הודעה — {producer.name}
          </a>
        </div>
      )}
    </div>
  );
}
