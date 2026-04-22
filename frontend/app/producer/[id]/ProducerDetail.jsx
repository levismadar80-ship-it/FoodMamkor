"use client";

import { useEffect, useState, useRef, useCallback } from "react";
import { useParams, useRouter } from "next/navigation";
import { MapPin, MapTrifold, Phone, InstagramLogo, Globe, WhatsappLogo, Info, Package, Truck, Star, EnvelopeSimple, Heart } from "@phosphor-icons/react";
import api from "@/lib/api";
import ImageGallery from "@/components/ImageGallery";
import CategoryTag from "@/components/CategoryTag";
import FollowButton from "@/components/FollowButton";
import ReportButton from "@/components/ReportButton";
import ShareButton from "@/components/ShareButton";
import WhatsAppShareButton from "@/components/WhatsAppShareButton";
import Breadcrumb from "@/components/Breadcrumb";
import AvailabilityBadge from "@/components/AvailabilityBadge";
import BadgeRow from "@/components/BadgeRow";
import TrustBadge from "@/components/TrustBadge";
import KashrutBadgeStrip from "@/components/KashrutBadgeStrip";
import ReviewsSection from "@/components/ReviewsSection";
import DirectoryDisclaimer from "@/components/DirectoryDisclaimer";
import { pushRecentlyViewed } from "@/lib/recently-viewed";
import OpeningHours from "@/components/OpeningHours";
import DeliveryBlock from "@/components/DeliveryBlock";
import ProducerCard from "@/components/ProducerCard";
import dynamic from "next/dynamic";
const MiniMap = dynamic(() => import("@/components/MiniMap"), { ssr: false });
import { useAuth } from "@/lib/auth-context";
import PrimaryContactButton from "@/components/PrimaryContactButton";
import WhatsAppQuestionChips from "@/components/WhatsAppQuestionChips";
import {
  getPrimaryMethod,
  getPrimaryContactHref,
  getPrimaryContactLabel,
  isPrimaryExternal,
} from "@/lib/contact-method";

/**
 * Producer detail page (docs/archive/ALL_PAGES_DESIGN.md עמוד 2).
 *
 * Layout: two-column on desktop — main info on the right (RTL leading),
 * sticky contact card on the left. Contact card stays visible while the
 * user scrolls through description/delivery/reviews.
 * Mobile: single column, contact card inlines after the header.
 */
export default function ProducerDetail({ initialProducer = null, fetchPath = null }) {
  const params = useParams();
  const router = useRouter();
  const { user } = useAuth();
  const [producer, setProducer] = useState(initialProducer);
  const [loading, setLoading] = useState(!initialProducer);
  const [activeTab, setActiveTab] = useState("about");

  const sectionRefs = useRef({});
  const tabBarRef = useRef(null);
  const reviewsContainerRef = useRef(null);
  const inlineCTARef = useRef(null);
  const [reviewsVisible, setReviewsVisible] = useState(false);
  const [isBarVisible, setIsBarVisible] = useState(false);
  const [events, setEvents] = useState([]);
  const [showAllEvents, setShowAllEvents] = useState(false);
  const [similarProducers, setSimilarProducers] = useState([]);

  const scrollToSection = useCallback((key) => {
    setActiveTab(key);
    const el = sectionRefs.current[key];
    if (el) {
      const tabBarHeight = tabBarRef.current?.offsetHeight || 56;
      const y = el.getBoundingClientRect().top + window.scrollY - tabBarHeight - 16;
      window.scrollTo({ top: y, behavior: "smooth" });
    }
  }, []);

  useEffect(() => {
    if (initialProducer) return;
    const path = fetchPath || `/producers/${params.id}`;
    api
      .get(path)
      .then((r) => setProducer(r.data))
      .catch(() => setProducer(null))
      .finally(() => setLoading(false));
  }, [params.id, fetchPath, initialProducer]);

  // StickyContactBar trigger: show bar when inline CTA exits viewport.
  useEffect(() => {
    const el = inlineCTARef.current;
    if (!el) return;
    const io = new IntersectionObserver(
      ([entry]) => setIsBarVisible(!entry.isIntersecting),
      { threshold: 0 },
    );
    io.observe(el);
    return () => io.disconnect();
  }, [producer?.id]);

  // Lazy-mount reviews: only fetch when the section scrolls into view.
  // rootMargin 300px pre-loads just before the user reaches the fold.
  useEffect(() => {
    const el = reviewsContainerRef.current;
    if (!el) return;
    const io = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setReviewsVisible(true);
          io.disconnect();
        }
      },
      { rootMargin: "300px" },
    );
    io.observe(el);
    return () => io.disconnect();
  }, [producer?.id]);

  // Task 13: save to recently viewed in localStorage. Storage shape +
  // 7-day TTL live in lib/recently-viewed.js (MEH-11) so the homepage
  // read site and this write site can't drift.
  useEffect(() => {
    if (!producer?.id) return;
    pushRecentlyViewed(producer.id);
  }, [producer?.id]);

  useEffect(() => {
    if (!producer?.id) return;
    api
      .get(`/events?producer_id=${producer.id}`)
      .then((r) => setEvents(r.data || []))
      .catch(() => setEvents([]));
  }, [producer?.id]);

  // MEH-102: fetch similar producers (same first category, excluding self)
  useEffect(() => {
    if (!producer?.id || !producer?.categories?.length) return;
    const catId = producer.categories[0]?.id;
    if (!catId) return;
    api
      .get("/producers", { params: { category: catId, exclude: producer.id, limit: 3 } })
      .then((r) => {
        const list = Array.isArray(r.data) ? r.data : [];
        setSimilarProducers(list.length >= 3 ? list.slice(0, 3) : []);
      })
      .catch(() => setSimilarProducers([]));
  }, [producer?.id, producer?.categories]);

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

  const isVacation = producer.availability_status === "vacation";
  const vacationReturnLabel = (() => {
    if (!producer.vacation_until) return "חוזרת בקרוב";
    try {
      // Parse as local date (not UTC) to avoid off-by-one in UTC+2/+3 (Israel).
      const [y, m, d] = producer.vacation_until.split("-").map(Number);
      return "חוזרת ב-" + new Date(y, m - 1, d).toLocaleDateString("he-IL", { day: "numeric", month: "long" });
    } catch {
      return "חוזרת בקרוב";
    }
  })();

  const words = (producer.name || "").trim().split(/\s+/).filter(Boolean);
  const producerInitials =
    words.length >= 2 ? words[0][0] + words[1][0] : words[0]?.slice(0, 2) ?? "מ";

  const primaryCategory = producer.categories?.[0];
  const handleShowOnMap = () => {
    try {
      sessionStorage.setItem(
        "focusProducer",
        JSON.stringify({
          id: producer.id,
          lat: producer.lat,
          lng: producer.lng,
          name: producer.name,
        }),
      );
    } catch {
      // private mode — map will still open, just without highlight
    }
    router.push("/map");
  };

  return (
    <div className="max-w-6xl mx-auto px-4 py-6">
      {/* Breadcrumb + back button */}
      <div className="flex items-center justify-between mb-4">
        <Breadcrumb
          items={[
            { href: "/", label: "בית" },
            ...(primaryCategory
              ? [{ href: `/?category=${primaryCategory.id}`, label: primaryCategory.name }]
              : []),
            { label: producer.name },
          ]}
        />
        <button
          type="button"
          onClick={() => router.back()}
          className="min-h-[44px] flex items-center text-sm text-primary hover:underline focus-visible:ring-2 focus-visible:ring-primary/40 rounded px-1"
          aria-label="חזרה לעמוד הקודם"
        >
          ← חזרה
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
        aria-label="ניווט מהיר בפרופיל"
      >
        <div className="flex">
          {[
            { key: "about", label: "אודות", Icon: Info },
            { key: "products", label: "מוצרים", Icon: Package },
            { key: "delivery", label: "משלוח", Icon: Truck },
            { key: "reviews", label: "ביקורות", Icon: Star },
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
          {/* Header: name + trust badges */}
          <div className="flex items-center flex-wrap gap-2 mb-2">
            <h1 className="font-headline text-4xl font-bold text-site-text">
              {producer.name}
            </h1>
            {/* MEH-18: unified badge row (all earned badges on Detail — no limit). */}
            <BadgeRow producer={producer} />
            {/* MEH-51: trust tier badge */}
            <TrustBadge tier={producer.trust_tier} />
            {producer.reviews_count > 0 && (
              <span
                className="bg-light text-accent border border-accent/20 text-xs px-3 py-1 rounded-full"
                title={`${producer.reviews_count} ביקורות`}
              >
                ⭐ {Number(producer.avg_rating).toFixed(1)} ({producer.reviews_count})
              </span>
            )}
            {producer.plan === "premium" && (
              <span className="bg-accent text-white text-xs px-3 py-1 rounded-full">
                פרמיום
              </span>
            )}
            {(producer.favorites_count ?? 0) >= 5 && (
              <span className="inline-flex items-center gap-1 text-[13px] text-site-muted">
                <Heart size={14} weight="fill" style={{ color: "#A32D2D" }} aria-hidden="true" />
                {producer.favorites_count} שמרו את העסק הזה
              </span>
            )}
            {/* MEH-12 — durable availability status */}
            <AvailabilityBadge
              status={producer.availability_status}
              variant="detail"
            />
            {/* Daily availability toggle — suppressed during vacation (badge + banner already signal it) */}
            {producer.is_available_today != null && !isVacation && (
              <span
                className={`inline-flex items-center gap-1.5 text-[11px] px-2 py-0.5 rounded-full border ${
                  producer.is_available_today
                    ? "bg-green-50 border-green-200 text-green-800"
                    : "bg-gray-50 border-gray-200 text-gray-600"
                }`}
              >
                <span
                  className={`w-2 h-2 rounded-full shrink-0 ${
                    producer.is_available_today ? "bg-[#4cb08b]" : "bg-gray-400"
                  }`}
                />
                {producer.is_available_today ? "זמינה היום" : "לא זמינה היום"}
              </span>
            )}
          </div>

          {producer.short_description && (
            <p className="text-sm md:text-base text-site-muted line-clamp-1 mt-1">
              {producer.short_description}
            </p>
          )}

          {producer.contact_name && (
            <p className="text-[12px] text-site-muted mt-0.5">
              מאחורי העסק: {producer.contact_name}
            </p>
          )}

          <p className="text-site-muted text-sm flex items-center gap-1.5 mt-2 mb-3">
            <MapPin size={14} weight="duotone" />
            {producer.city}
            {primaryCategory && (
              <>
                <span className="mx-1">·</span>
                {primaryCategory.emoji} {primaryCategory.name}
              </>
            )}
          </p>

          {(producer.top_product_name || producer.starting_price_label) && (
            <p className="mt-1 text-sm mb-3">
              {producer.top_product_name && (
                <span className="text-site-text">{producer.top_product_name}</span>
              )}
              {producer.top_product_name && producer.starting_price_label && (
                <span className="text-site-muted"> · </span>
              )}
              {producer.starting_price_label && (
                <span className="text-accent font-semibold">{producer.starting_price_label}</span>
              )}
            </p>
          )}

          {/* Categories */}
          {producer.categories?.length > 1 && (
            <div className="flex flex-wrap gap-2 mt-4">
              {producer.categories.map((cat) => (
                <CategoryTag key={cat.id} category={cat} />
              ))}
            </div>
          )}

          {/* Highlights strip — grass_fed / organic / delivery / kosher */}
          {(producer.grass_fed || producer.organic_certified || producer.delivery_areas?.length > 0 || producer.kosher) && (
            <div className="flex flex-wrap gap-2 mt-3">
              {producer.grass_fed && (
                <span className="bg-light text-site-text border border-border rounded-[20px] text-[11px] px-[10px] py-[4px]">
                  🌾<span className="hidden sm:inline"> מרעה חופשי</span>
                </span>
              )}
              {producer.organic_certified && (
                <span className="bg-light text-site-text border border-border rounded-[20px] text-[11px] px-[10px] py-[4px]">
                  🌿<span className="hidden sm:inline"> אורגני מוסמך</span>
                </span>
              )}
              {producer.delivery_areas?.length > 0 && (
                <span className="bg-light text-site-text border border-border rounded-[20px] text-[11px] px-[10px] py-[4px]">
                  🚚<span className="hidden sm:inline"> משלוח</span>
                </span>
              )}
              {producer.kosher && (
                <span className="bg-light text-site-text border border-border rounded-[20px] text-[11px] px-[10px] py-[4px]">
                  ✡️<span className="hidden sm:inline"> כשר</span>
                </span>
              )}
            </div>
          )}

          {/* MEH-51: kashrut badge strip (rendered even when kosher text exists — additive) */}
          {producer.kashrut_badges?.length > 0 && (
            <div className="mt-3">
              <KashrutBadgeStrip
                badges={producer.kashrut_badges}
                verified_at={producer.kashrut_verified_at}
                expires_at={producer.kashrut_expires_at}
              />
            </div>
          )}

          {/* Vacation banner — slate (neutral unavailable), not amber (which reads as sale/warning) */}
          {isVacation && (
            <div className="mx-0 mt-3 bg-slate-50 border border-slate-200 rounded-xl p-3">
              <p className="text-sm font-bold text-slate-700">🌙 בית עסק זה בהפסקה כרגע</p>
              <p className="text-xs text-slate-500 mt-1">
                {vacationReturnLabel} — ניתן להשאיר הודעה
              </p>
            </div>
          )}

          {/* Mobile inline CTA — IO trigger for StickyContactBar.
              ref={inlineCTARef}: when this exits viewport, the sticky bar slides in.
              md:hidden — desktop sidebar already has the CTA. */}
          <div ref={inlineCTARef} className="md:hidden mt-4">
            <WhatsAppQuestionChips producer={producer} />
            <PrimaryContactButton
              producer={producer}
              onClick={() => {
                if (
                  getPrimaryMethod(producer) === "whatsapp" &&
                  typeof navigator !== "undefined" &&
                  navigator.sendBeacon
                ) {
                  try {
                    navigator.sendBeacon(`/api/producers/${producer.id}/whatsapp-click`);
                  } catch {
                    // tracking is best-effort
                  }
                }
                // Mark that this user has contacted via WhatsApp — unlocks review form
                try {
                  localStorage.setItem(`wa_clicked_${producer.id}`, "1");
                } catch {}
              }}
            />
          </div>

          {/* Action row — map + viral share. Shown at all breakpoints.
              Desktop: MapButton moves here from sidebar to reduce sidebar density.
              WhatsAppShareButton is secondary (gray outlined) to avoid green conflict with primary CTA. */}
          <div className="flex flex-wrap gap-2 mt-3">
            {/* MEH-213: map button only for producers with a physical location */}
            {producer.has_physical_location !== false && producer.lat && producer.lng && (
              <button
                type="button"
                onClick={handleShowOnMap}
                className="flex items-center justify-center gap-2 border border-primary text-primary px-4 min-h-[44px] rounded-[10px] hover:bg-light transition text-sm font-medium focus-visible:ring-2 focus-visible:ring-primary/40"
                aria-label="פתח את המיקום של העסק במפה"
              >
                <MapTrifold size={16} weight="duotone" />
                הצג במפה
              </button>
            )}
            <WhatsAppShareButton producer={producer} url={shareUrl} />
            {/* MEH-49: referral chip — only for logged-in users with a referral code */}
            {user?.referral_code && (
              <a
                href={`https://wa.me/?text=${encodeURIComponent(`גיליתי את מהמקור — בתי עסק מקומיים מדהימים 🌿\nהצטרפי עם קישור שלי וקבלי 10% הנחה: https://mehamakor.co.il/ref/${user.referral_code}`)}`}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center justify-center gap-2 border border-border text-site-muted px-4 min-h-[44px] rounded-[10px] hover:bg-light transition text-sm font-medium"
              >
                שתפי וקבלי 10% 🌿
              </a>
            )}
          </div>

          {/* Description */}
          {producer.description && (
            <section className="mt-8" ref={(el) => { sectionRefs.current.about = el; }}>
              <h2 className="font-headline text-2xl font-bold text-site-text mb-3">אודות</h2>
              <p className="text-site-text/85 leading-relaxed whitespace-pre-line">
                {producer.description}
              </p>
            </section>
          )}

          {/* MEH-102: Opening hours */}
          <OpeningHours opening_hours={producer.opening_hours} />

          {/* MEH-102: Mini-map with navigation — hidden for delivery-only */}
          {producer.has_physical_location !== false && producer.lat && producer.lng && (
            <MiniMap lat={producer.lat} lng={producer.lng} name={producer.name} />
          )}

          {/* MEH-102: Similar producers */}
          {similarProducers.length >= 3 && (
            <section className="mt-8 border-t border-border pt-8">
              <h2 className="font-headline text-2xl font-bold text-site-text mb-1">עסקים דומים</h2>
              {producer.categories?.[0]?.name && (
                <p className="text-sm text-site-muted mb-4">
                  {producer.categories[0].name} · באזור שלך
                </p>
              )}
              <div className="flex gap-4 overflow-x-auto pb-2 md:grid md:grid-cols-3 md:overflow-visible">
                {similarProducers.map((p) => (
                  <div key={p.id} className="flex-shrink-0 w-72 md:w-auto">
                    <ProducerCard producer={p} referrer="similar" />
                  </div>
                ))}
              </div>
            </section>
          )}

          {/* Events section */}
          {events.length > 0 && (
            <section className="mt-8" ref={(el) => { sectionRefs.current.events = el; }}>
              <h2 className="font-headline text-2xl font-bold text-site-text mb-4">אירועים קרובים</h2>
              <div className="space-y-3">
                {(showAllEvents ? events : events.slice(0, 3)).map((ev) => {
                  const dateStr = new Date(ev.event_date).toLocaleDateString("he-IL", {
                    weekday: "short", day: "numeric", month: "long",
                  });
                  const timeStr = ev.event_time
                    ? ev.event_time.slice(0, 5)
                    : null;
                  return (
                    <div
                      key={ev.id}
                      className="bg-white rounded-[12px] border border-border p-4 flex gap-4"
                    >
                      {ev.image_url && (
                        <img
                          src={ev.image_url}
                          alt={ev.title}
                          className="w-16 h-16 rounded-[8px] object-cover flex-shrink-0"
                        />
                      )}
                      <div className="flex-1 min-w-0">
                        <p className="font-medium text-site-text leading-snug">{ev.title}</p>
                        <p className="text-sm text-site-muted mt-0.5">
                          {dateStr}{timeStr && ` · ${timeStr}`}
                          {ev.city && ` · ${ev.city}`}
                        </p>
                        {ev.price > 0 && (
                          <p className="text-sm text-accent font-medium mt-1">₪{ev.price}</p>
                        )}
                        {ev.price === 0 && (
                          <p className="text-sm text-primary font-medium mt-1">חינם</p>
                        )}
                        {ev.registration_url && (
                          <a
                            href={ev.registration_url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-block mt-2 text-xs text-primary underline hover:text-primary-dark"
                          >
                            הרשמה לאירוע →
                          </a>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
              {events.length > 3 && !showAllEvents && (
                <button
                  onClick={() => setShowAllEvents(true)}
                  className="mt-4 text-sm text-primary hover:text-primary-dark font-medium underline"
                >
                  הצג את כל {events.length} האירועים
                </button>
              )}
            </section>
          )}

          {/* Products (premium only) */}
          {producer.products?.length > 0 && (
            <section className="mt-8" ref={(el) => { sectionRefs.current.products = el; }}>
              <h2 className="font-headline text-2xl font-bold text-site-text mb-4">מוצרים</h2>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                {producer.products.map((product) => (
                  <div
                    key={product.id}
                    className="bg-white rounded-[12px] p-4 border border-border"
                  >
                    <p className="font-medium text-site-text">{product.name}</p>
                    {product.description && (
                      <p className="text-sm text-site-muted mt-1">{product.description}</p>
                    )}
                    {product.price_range && (
                      <p className="text-accent font-medium mt-2">{product.price_range}</p>
                    )}
                  </div>
                ))}
              </div>
            </section>
          )}

          {/* MEH-213: DeliveryBlock — shown when offers_delivery=true.
              Replaces the old delivery_areas table for the new location model. */}
          {producer.offers_delivery && (
            <div ref={(el) => { sectionRefs.current.delivery = el; }}>
              <DeliveryBlock
                nationwide={producer.delivery_nationwide}
                cities={producer.delivery_cities || []}
                producer={producer}
              />
            </div>
          )}

          {/* Legacy delivery_areas table — shown for producers with the old model
              (has delivery_areas rows but no delivery_cities set yet). */}
          {!producer.offers_delivery && producer.delivery_areas?.length > 0 && (
            <section className="mt-8" ref={(el) => { sectionRefs.current.delivery = el; }}>
              <h2 className="font-headline text-2xl font-bold text-site-text mb-4">
                אזורי משלוח
              </h2>
              <div className="bg-white rounded-[12px] overflow-hidden border border-border">
                <table className="w-full">
                  <thead className="bg-light">
                    <tr>
                      <th className="text-end px-4 py-3 text-sm font-medium text-primary">עיר</th>
                      <th className="text-end px-4 py-3 text-sm font-medium text-primary">מינימום הזמנה</th>
                      <th className="text-end px-4 py-3 text-sm font-medium text-primary">יום משלוח</th>
                    </tr>
                  </thead>
                  <tbody>
                    {producer.delivery_areas.map((da) => (
                      <tr key={da.id} className="border-t border-border">
                        <td className="px-4 py-3 text-site-text">{da.city}</td>
                        <td className="px-4 py-3 text-site-text">
                          {da.min_order ? `₪${da.min_order}` : "—"}
                        </td>
                        <td className="px-4 py-3 text-site-text">{da.delivery_day || "—"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>
          )}

          {/* Directory-only disclaimer — required by Israeli consumer
              protection law. The seller bears legal responsibility for
              products and licensing; the platform is just a directory. */}
          <DirectoryDisclaimer className="mt-8" />

          {/* Report */}
          <div className="mt-6 pt-6 border-t border-border">
            <ReportButton producerId={producer.id} />
          </div>

          {/* Reviews — IO-lazy: only mounts the fetch when the section
              scrolls within 300px of the viewport (saves ~300ms on 3G) */}
          <div
            ref={(el) => {
              sectionRefs.current.reviews = el;
              reviewsContainerRef.current = el;
            }}
          >
            {reviewsVisible && (
              <ReviewsSection
                producerId={producer.id}
                avgRating={producer.avg_rating ?? 0}
                reviewCount={producer.reviews_count ?? 0}
              />
            )}
          </div>
        </div>

        {/* ================= Sticky contact sidebar ================= */}
        <aside>
          <div className="lg:sticky lg:top-24 bg-white rounded-[16px] p-6 border border-border shadow-[0_4px_24px_rgba(46,104,83,0.06)]">
            {/* Vacation notice in sidebar */}
            {isVacation && (
              <div className="bg-slate-50 border border-slate-200 rounded-xl p-3 mb-4">
                <p className="text-xs font-bold text-slate-700">🌙 בית עסק זה בהפסקה כרגע</p>
                <p className="text-xs text-slate-500 mt-0.5">{vacationReturnLabel}</p>
              </div>
            )}

            {/* Dim contact content when on vacation — pointer-events-auto keeps clicking possible */}
            <div className={isVacation ? "opacity-50 pointer-events-auto" : ""}>

            {/* MEH-17: primary CTA follows producer.primary_contact_method.
                WhatsApp still pings the analytics beacon on click so the
                existing producer-dashboard metric keeps working. */}
            <WhatsAppQuestionChips producer={producer} />
            <PrimaryContactButton
              producer={producer}
              onClick={() => {
                if (
                  getPrimaryMethod(producer) === "whatsapp" &&
                  typeof navigator !== "undefined" &&
                  navigator.sendBeacon
                ) {
                  try {
                    navigator.sendBeacon(
                      `/api/producers/${producer.id}/whatsapp-click`,
                    );
                  } catch {
                    // tracking is best-effort
                  }
                }
                // Mark that this user has contacted via WhatsApp — unlocks review form
                try {
                  localStorage.setItem(`wa_clicked_${producer.id}`, "1");
                } catch {}
              }}
            />

            {/* Contact buttons — 2-per-row dynamic grid */}
            <div className="grid grid-cols-2 gap-2 mb-4">
              {producer.phone && (
                <a
                  href={`tel:${producer.phone}`}
                  className="flex items-center justify-center gap-2 border border-border text-site-text px-3 py-3 rounded-[10px] hover:bg-light transition text-sm"
                  dir="ltr"
                >
                  <Phone size={18} weight="duotone" className="text-primary shrink-0" />
                  <span className="truncate">{producer.phone}</span>
                </a>
              )}
              {producer.instagram?.trim() && (() => {
                // Strip leading "@" so stored values like "@heese_farm"
                // don't render as "@@heese_farm" (which truncates weirdly
                // into "heese@@" in the RTL sidebar without an explicit
                // dir override). The URL path also drops the @.
                const handle = producer.instagram.trim().replace(/^@+/, "");
                return (
                  <a
                    href={`https://instagram.com/${handle}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center justify-center gap-2 border border-border text-site-text px-3 py-3 rounded-[10px] hover:bg-light transition text-sm overflow-hidden"
                    dir="ltr"
                  >
                    <InstagramLogo size={18} weight="duotone" className="text-primary shrink-0" />
                    <span className="truncate min-w-0">@{handle}</span>
                  </a>
                );
              })()}
              {/* Pattern 2 guard: producer.website may be "" or "   "
                  (whitespace-only), which is truthy in JS. Without
                  trimming, the tile renders with an href of "https:// "
                  and clicks go nowhere. */}
              {producer.website?.trim() && (
                <a
                  href={
                    producer.website.trim().startsWith("http")
                      ? producer.website.trim()
                      : `https://${producer.website.trim()}`
                  }
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center justify-center gap-2 border border-border text-site-text px-3 py-3 rounded-[10px] hover:bg-light transition text-sm"
                >
                  <Globe size={18} weight="duotone" className="text-primary shrink-0" />
                  אתר
                </a>
              )}
              {/* MEH-17 — secondary email tile. Skipped when email IS
                  the primary method (redundant with the big CTA above). */}
              {producer.contact_email && getPrimaryMethod(producer) !== "email" && (
                <a
                  href={`mailto:${producer.contact_email}`}
                  className="flex items-center justify-center gap-2 border border-border text-site-text px-3 py-3 rounded-[10px] hover:bg-light transition text-sm"
                  dir="ltr"
                >
                  <EnvelopeSimple size={18} weight="duotone" className="text-primary shrink-0" />
                  <span className="truncate">{producer.contact_email}</span>
                </a>
              )}
            </div>

            {/* Follow button — docs/archive/FEEDBACK_FIXES.md new feature */}
            <div className="mb-2">
              <FollowButton producerId={producer.id} />
            </div>

            {/* WhatsApp group invite link — only shown when the producer has set one */}
            {producer.whatsapp_group && (
              <a
                href={producer.whatsapp_group}
                target="_blank"
                rel="noopener noreferrer"
                className="w-full flex items-center justify-center gap-2 border border-border text-site-muted px-4 min-h-[44px] rounded-[10px] hover:bg-background transition text-sm font-medium mb-2"
              >
                <WhatsappLogo size={16} weight="duotone" />
                הצטרפי לקבוצת וואטסאפ
              </a>
            )}

            <div className="mb-3">
              <ShareButton
                url={shareUrl}
                title={producer.name}
                description={producer.description}
                city={producer.city}
                category={primaryCategory?.name}
              />
            </div>
            </div>{/* end vacation-dim wrapper */}
          </div>
        </aside>
      </div>

      {/* StickyContactBar — mobile only, IO-driven, always mounted.
          Animates via CSS transform so no layout shift on enter/exit.
          z-[598]: below CookieBanner (z-[599]) + BottomNav (z-[1000]).
          On first visit CookieBanner overlaps — correct UX. */}
      <div
        className="md:hidden fixed bottom-16 inset-x-0 z-[598]"
        style={{
          transform: isBarVisible ? "translateY(0)" : "translateY(100%)",
          transition: isBarVisible ? "transform 200ms ease-out" : "transform 150ms ease-in",
          paddingBottom: "env(safe-area-inset-bottom, 0px)",
          background: "white",
          borderTop: "1px solid #DDD5C8",
          boxShadow: "0 -4px 12px rgba(0,0,0,0.06)",
          opacity: isVacation ? 0.85 : 1,
        }}
        aria-hidden={!isBarVisible}
      >
        <div className="flex items-center gap-3 px-4 py-3">
          {/* Social proof — hidden if < 3 reviews; replaced by vacation notice */}
          {isVacation ? (
            <span className="text-[11px] text-site-muted shrink-0">🌿 {vacationReturnLabel}</span>
          ) : producer.reviews_count >= 3 ? (
            <div className="shrink-0 text-[11px] text-site-muted leading-tight">
              <div className="font-bold text-[#8B6914]">
                ⭐ {Number(producer.avg_rating).toFixed(1)}
              </div>
              <div>{producer.reviews_count} ביקורות</div>
            </div>
          ) : null}
          {/* Primary CTA */}
          {getPrimaryContactHref(producer) && (
            <a
              href={getPrimaryContactHref(producer)}
              {...(isPrimaryExternal(producer)
                ? { target: "_blank", rel: "noopener noreferrer" }
                : {})}
              onClick={() => {
                if (getPrimaryMethod(producer) === "whatsapp" &&
                    typeof navigator !== "undefined" &&
                    navigator.sendBeacon) {
                  try {
                    navigator.sendBeacon(`/api/producers/${producer.id}/whatsapp-click`);
                  } catch {
                    // tracking is best-effort
                  }
                }
              }}
              className={`flex-1 flex items-center justify-center gap-2 py-3 rounded-[10px] font-medium text-sm transition ${
                isVacation
                  ? "bg-[#6EAF8A] text-white"
                  : getPrimaryMethod(producer) === "whatsapp"
                  ? "btn-whatsapp"
                  : getPrimaryMethod(producer) === "phone"
                  ? "bg-primary text-white hover:bg-primary-light"
                  : getPrimaryMethod(producer) === "email"
                  ? "bg-primary-dark text-white hover:bg-primary"
                  : "bg-white text-site-text border border-primary hover:bg-light"
              }`}
            >
              {isVacation ? "שלחי הודעה — יחזרו בקרוב" : getPrimaryContactLabel(producer)}
            </a>
          )}
        </div>
      </div>
    </div>
  );
}
