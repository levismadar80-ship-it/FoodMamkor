"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { MapPin, MapTrifold, Phone, InstagramLogo, Globe, WhatsappLogo, Seal } from "@phosphor-icons/react";
import api from "@/lib/api";
import { normalizePhone } from "@/lib/utils";
import ImageGallery from "@/components/ImageGallery";
import CategoryTag from "@/components/CategoryTag";
import FavoriteButton from "@/components/FavoriteButton";
import FollowButton from "@/components/FollowButton";
import ReportButton from "@/components/ReportButton";
import ShareButton from "@/components/ShareButton";
import WhatsAppShareButton from "@/components/WhatsAppShareButton";
import Breadcrumb from "@/components/Breadcrumb";
import ProducerReviews from "@/components/ProducerReviews";
import DirectoryDisclaimer from "@/components/DirectoryDisclaimer";

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
  const [producer, setProducer] = useState(initialProducer);
  const [loading, setLoading] = useState(!initialProducer);

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
    } catch {
      // localStorage unavailable — ignore
    }
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
  // tasks_for_claude_code.md task 17: shared normalizer replaces the
  // previous inline logic that had an order-of-operations bug on inputs
  // with leading whitespace. See lib/utils.js.
  const whatsappNumber = normalizePhone(producer.phone) || null;

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
          className="text-sm text-primary hover:underline focus-visible:ring-2 focus-visible:ring-primary/40 rounded"
          aria-label="חזרה לעמוד הקודם"
        >
          ← חזרה
        </button>
      </div>

      {/* Gallery */}
      <ImageGallery images={producer.images || []} />

      {/* Two-column layout: main + sticky contact sidebar */}
      <div className="mt-8 grid grid-cols-1 lg:grid-cols-[1fr_320px] gap-8">
        {/* ================= Main column ================= */}
        <div>
          {/* Header: name + trust badges */}
          <div className="flex items-center flex-wrap gap-2 mb-2">
            <h1 className="font-headline text-4xl font-bold text-site-text">
              {producer.name}
            </h1>
            {producer.is_verified && (
              <span className="bg-light text-primary border border-primary/20 text-xs px-3 py-1 rounded-full inline-flex items-center gap-1">
                <Seal size={14} weight="fill" aria-hidden="true" />
                עסק מאומת
              </span>
            )}
            {producer.reviews_count > 0 && (
              <span
                className="bg-[#FFF9E6] text-[#946A00] border border-[#F0C040] text-xs px-3 py-1 rounded-full"
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
          </div>

          <p className="text-site-muted text-sm flex items-center gap-1.5 mb-3">
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

          {/* Description */}
          {producer.description && (
            <section className="mt-8">
              <h2 className="font-headline text-2xl font-bold text-site-text mb-3">אודות</h2>
              <p className="text-site-text/85 leading-relaxed whitespace-pre-line">
                {producer.description}
              </p>
            </section>
          )}

          {/* Products (premium only) */}
          {producer.products?.length > 0 && (
            <section className="mt-8">
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

          {/* Delivery Areas */}
          {producer.delivery_areas?.length > 0 && (
            <section className="mt-8">
              <h2 className="font-headline text-2xl font-bold text-site-text mb-4">
                אזורי משלוח
              </h2>
              <div className="bg-white rounded-[12px] overflow-hidden border border-border">
                <table className="w-full">
                  <thead className="bg-light">
                    <tr>
                      <th className="text-right px-4 py-3 text-sm font-medium text-primary">
                        עיר
                      </th>
                      <th className="text-right px-4 py-3 text-sm font-medium text-primary">
                        מינימום הזמנה
                      </th>
                      <th className="text-right px-4 py-3 text-sm font-medium text-primary">
                        יום משלוח
                      </th>
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

          {/* Reviews */}
          <ProducerReviews producerId={producer.id} />
        </div>

        {/* ================= Sticky contact sidebar ================= */}
        <aside className="order-first lg:order-last">
          <div className="lg:sticky lg:top-24 bg-white rounded-[16px] p-6 border border-border shadow-[0_4px_24px_rgba(46,104,83,0.06)]">
            <h3 className="font-headline text-xl font-bold text-site-text mb-5">צרי קשר</h3>

            {/* WhatsApp — primary CTA */}
            {whatsappNumber && (
              <a
                href={`https://wa.me/${whatsappNumber}?text=${encodeURIComponent(`היי! מצאתי אותך במהמקור — ${producer.name}`)}`}
                target="_blank"
                rel="noopener noreferrer"
                onClick={() => {
                  // feature/producer-analytics — fire-and-forget beacon
                  // so the producer dashboard counts this click. Doesn't
                  // block the wa.me window open.
                  if (
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
                }}
                className="flex items-center justify-center gap-2 bg-[#25D366] text-white px-4 py-3 rounded-[10px] hover:bg-[#1ea855] transition font-medium mb-2.5 focus-visible:ring-2 focus-visible:ring-[#25D366]/40"
              >
                <WhatsappLogo size={20} weight="fill" />
                שלחי הודעה
              </a>
            )}

            {/* Phone */}
            {producer.phone && (
              <a
                href={`tel:${producer.phone}`}
                className="flex items-center gap-2 border border-border text-site-text px-4 py-3 rounded-[10px] hover:bg-light transition text-sm mb-2.5"
                dir="ltr"
              >
                <Phone size={18} weight="duotone" className="text-primary shrink-0" />
                {producer.phone}
              </a>
            )}

            {/* Instagram */}
            {producer.instagram && (
              <a
                href={`https://instagram.com/${producer.instagram}`}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-2 border border-border text-site-text px-4 py-3 rounded-[10px] hover:bg-light transition text-sm mb-2.5"
              >
                <InstagramLogo size={18} weight="duotone" className="text-primary shrink-0" />
                @{producer.instagram}
              </a>
            )}

            {/* Website */}
            {producer.website && (
              <a
                href={producer.website.startsWith("http") ? producer.website : `https://${producer.website}`}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-2 border border-border text-site-text px-4 py-3 rounded-[10px] hover:bg-light transition text-sm mb-4"
              >
                <Globe size={18} weight="duotone" className="text-primary shrink-0" />
                אתר
              </a>
            )}

            {/* Follow button — docs/archive/FEEDBACK_FIXES.md new feature */}
            <div className="mb-2">
              <FollowButton producerId={producer.id} />
            </div>

            {/* Favorites + Share row */}
            <div className="flex gap-2 mb-3">
              <div className="flex-1 flex justify-center border border-border rounded-[10px] py-2 hover:bg-light transition">
                <FavoriteButton producerId={producer.id} />
              </div>
              <div className="flex-1">
                <ShareButton
                  url={shareUrl}
                  title={producer.name}
                  description={producer.description}
                  city={producer.city}
                  category={primaryCategory?.name}
                />
              </div>
            </div>

            {/* FINAL_AUDIT: WhatsApp share — the viral loop */}
            <div className="mb-3">
              <WhatsAppShareButton producer={producer} url={shareUrl} />
            </div>

            {/* Show on map */}
            {producer.lat && producer.lng && (
              <button
                type="button"
                onClick={handleShowOnMap}
                className="w-full flex items-center justify-center gap-2 border border-primary text-primary px-4 py-2.5 rounded-[10px] hover:bg-light transition text-sm font-medium focus-visible:ring-2 focus-visible:ring-primary/40"
                aria-label="פתח את המיקום של העסק במפה"
              >
                <MapTrifold size={16} weight="duotone" />
                הצג במפה
              </button>
            )}
          </div>
        </aside>
      </div>
    </div>
  );
}
