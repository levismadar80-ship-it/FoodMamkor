import { useEffect, useState } from "react";
import Image from "next/image";
import { Leaf } from "@phosphor-icons/react";
import dynamic from "next/dynamic";
import { useTranslations, useFormatter } from "next-intl";
import api from "@/lib/api";
import { optimizeCloudinary } from "@/lib/cloudinary";
// MEH-1140: canonical shekel format — amount then ₪ ("35₪"), one owner in lib/utils.
import { formatPrice, formatPriceRange } from "@/lib/utils";
import DeliveryBlock from "@/components/DeliveryBlock";
// MEH-788: scroll-reveal on the description + similar sections (not LCP/gallery).
import FadeInSection, { REVEAL_PRESET } from "@/components/FadeInSection";
import DirectoryDisclaimer from "@/components/DirectoryDisclaimer";
import OpeningHours from "@/components/OpeningHours";
import ProducerCard from "@/components/ProducerCard";
import RecipeCard from "@/components/public/RecipeCard";
import ReportButton from "@/components/ReportButton";
import ReviewsSection from "@/components/ReviewsSection";

const MiniMap = dynamic(() => import("@/components/MiniMap"), { ssr: false });

// MEH-1146 chunk C: the discovery loop ("עוד בתי עסק באזור") renders only when
// at least this many same-city businesses (excluding the current one) come
// back — below it the section hides entirely so it never shows a thin 1-2 card
// row. Documented const per the spec.
const MIN_NEARBY_BUSINESSES = 4;

/**
 * The middle of the main column. MEH-1146 chunk B reorders the sections to
 * the editorial IA: about → products → recipes → events → delivery →
 * reviews → similar → location (OpeningHours + MiniMap, LAST) → disclaimer →
 * report. The signature product (top_product_name / starting_price_label)
 * moved OUT of ProducerHeader to the top of the products section here.
 *
 * Delivery (MEH-1168 P3, decision א): a single editorial <DeliveryBlock> serves
 * ALL producers — fed delivery_areas (city · min order · day) + pickup_points +
 * a demoted tertiary CTA. It renders whenever the producer has any delivery or
 * pickup signal. The legacy delivery_areas table was retired from this page.
 *
 * showAllEvents state lives here as local UI state. The reviews wrapper
 * accepts reviewsContainerRef and reviewsVisible from useLazyReviews so the
 * IO observation point remains identical to the source.
 */
export default function ProducerSections({
  producer,
  events,
  similarProducers,
  nearbyProducers = [],
  sectionRefs,
  reviewsContainerRef,
  reviewsVisible,
  isOwner = false,
}) {
  const t = useTranslations();
  const format = useFormatter();
  const [showAllEvents, setShowAllEvents] = useState(false);
  // MEH-591: producer recipes (chunk 4/4). Fetched client-side via the
  // public read endpoint added in chunk 2 — backend already filters to
  // published+approved, so an empty array means "no recipes to show"
  // and the section hides entirely (silent empty, per spec).
  const [recipes, setRecipes] = useState([]);
  useEffect(() => {
    if (!producer?.slug) return;
    let cancelled = false;
    api
      .get(`/producers/${encodeURIComponent(producer.slug)}/recipes`)
      .then((r) => {
        if (!cancelled) setRecipes(r.data || []);
      })
      .catch(() => {
        if (!cancelled) setRecipes([]);
      });
    return () => {
      cancelled = true;
    };
  }, [producer?.slug]);

  const hasSignature = !!(producer.top_product_name || producer.starting_price_label);

  return (
    <>
      {/* Description — MEH-788: scroll-reveal (motion.section keeps the
          sectionRefs callback ref for the tab-scroll IO). */}
      {producer.description && (
        <FadeInSection as="section" {...REVEAL_PRESET} className="mt-8" ref={(el) => { sectionRefs.current.about = el; }}>
          <h2 className="font-headline-md text-2xl font-bold text-text mb-3">{t("producer.detail.sections.about")}</h2>
          <p className="text-text/85 leading-relaxed whitespace-pre-line">
            {producer.description}
          </p>
        </FadeInSection>
      )}

      {/* Products (premium only) + the signature product at the top.
          MEH-1146 chunk B: the section also renders when only the signature
          product exists (no product entries) so the moved-out header
          signature never vanishes. */}
      {(producer.products?.length > 0 || hasSignature) && (
        <section className="mt-8" ref={(el) => { sectionRefs.current.products = el; }}>
          <h2 className="font-headline-md text-2xl font-bold text-text mb-4">{t("producer.detail.sections.products.heading")}</h2>

          {/* Signature product — moved from ProducerHeader (MEH-1146 chunk B).
              starting_price_label is a free-text DB label (NOT routed through
              formatPrice per MEH-1140 — it is data, not a numeric amount). */}
          {hasSignature && (
            <div className="mb-4 flex flex-wrap items-baseline gap-x-2 gap-y-1 bg-background border border-border rounded-md px-4 py-3">
              {producer.top_product_name && (
                <span className="font-medium text-text">{producer.top_product_name}</span>
              )}
              {producer.top_product_name && producer.starting_price_label && (
                <span className="text-fg-muted" aria-hidden="true">·</span>
              )}
              {producer.starting_price_label && (
                <span className="text-accent font-semibold">{producer.starting_price_label}</span>
              )}
            </div>
          )}

          {/* MEH-1168 P2: compact product ROWS (approved 1b anatomy), replacing
              the giant image-first cards. Each row = a square thumbnail at the
              inline-start + name/price beside it, ~96px tall, hairline-separated.
              Desktop lays the rows out in two columns (fixes the old 2+1
              asymmetric card grid). Prices via formatPriceRange (MEH-1140) with
              dir="ltr" bidi isolation (regression baseline:
              qa-artifacts/MEH-1168-p1/price-cell-zoom.webp). */}
          {producer.products?.length > 0 && (
            <div className="grid grid-cols-1 md:grid-cols-2 md:gap-x-6 border-t border-border">
              {producer.products.map((product) => {
                // Cloudinary 1:1 square when a photo exists; otherwise the
                // canonical no-photo state (MEH-1138) — never a package icon.
                const img = product.image_url
                  ? optimizeCloudinary(product.image_url, { aspectRatio: "1:1", width: 160 })
                  : null;
                const price =
                  product.price_min != null
                    ? formatPriceRange(product.price_min, product.price_max)
                    : product.price_range || null;
                return (
                  <div
                    key={product.id}
                    className="flex items-center gap-3 py-2 min-h-[96px] border-b border-border"
                  >
                    <div className="relative w-20 h-20 flex-shrink-0 rounded-md overflow-hidden bg-background">
                      {img ? (
                        <Image
                          src={img}
                          alt={product.name}
                          fill
                          className="object-cover"
                          sizes="80px"
                        />
                      ) : (
                        // MEH-1138 / MEH-1168 P1: cream surface + leaf glyph only
                        // (no "מהמקור" wordmark inside a business's own products).
                        <div
                          className="w-full h-full bg-background flex items-center justify-center"
                          aria-label={t("producer.card.aria.image_missing", { name: product.name })}
                        >
                          <Leaf size={32} weight="light" className="text-primary/[0.32]" data-testid="leaf-icon" aria-hidden="true" />
                        </div>
                      )}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="font-medium text-text">{product.name}</p>
                      {product.description && (
                        <p className="text-sm text-fg-muted mt-0.5 line-clamp-1">{product.description}</p>
                      )}
                      {/* MEH-1168 P1 (bidi): the ₪-suffixed amount is bidi-
                          isolated so RTL flow can't render "35₪" as "₪35". */}
                      {price && <p className="text-accent font-medium mt-1"><span dir="ltr">{price}</span></p>}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </section>
      )}

      {/* MEH-591: Producer recipes (chunk 4/4). Section is hidden entirely
          when the producer has no published+approved recipes — empty state
          is silent per spec. Anchor id matches the breadcrumb in
          RecipeDetail.jsx ("חזרה לדף בית העסק > מתכונים"). */}
      {producer.slug && recipes.length > 0 && (
        <section className="mt-8" id="recipes">
          <h2 className="font-headline-md text-2xl font-bold text-text mb-4">
            {t("producer.detail.sections.recipes.cta")}
          </h2>
          <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
            {recipes.map((r) => (
              <RecipeCard key={r.id} slug={producer.slug} recipe={r} />
            ))}
          </div>
        </section>
      )}

      {/* Events section */}
      {events.length > 0 && (
        <section className="mt-8" ref={(el) => { sectionRefs.current.events = el; }}>
          <h2 className="font-headline-md text-2xl font-bold text-text mb-4">{t("producer.detail.sections.events.heading")}</h2>
          <div className="space-y-3">
            {(showAllEvents ? events : events.slice(0, 3)).map((ev) => {
              // MEH-473: Q4 — Gregorian dates via next-intl/format. The
              // `locale` param is implicit (provider sets it); options match
              // the prior `toLocaleDateString("he-IL", {weekday/day/month})`.
              const dateStr = format.dateTime(new Date(ev.event_date), {
                weekday: "short", day: "numeric", month: "long",
              });
              const timeStr = ev.event_time
                ? ev.event_time.slice(0, 5)
                : null;
              return (
                <div
                  key={ev.id}
                  className="bg-white rounded-md border border-border p-4 flex gap-4"
                >
                  {ev.image_url && (
                    <Image
                      src={ev.image_url}
                      alt={ev.title}
                      width={64}
                      height={64}
                      className="w-16 h-16 rounded-sm object-cover flex-shrink-0"
                    />
                  )}
                  <div className="flex-1 min-w-0">
                    <p className="font-medium text-text leading-snug">{ev.title}</p>
                    <p className="text-sm text-fg-muted mt-0.5">
                      {dateStr}{timeStr && ` · ${timeStr}`}
                      {ev.city && ` · ${ev.city}`}
                    </p>
                    {ev.price > 0 && (
                      <p className="text-sm text-accent font-medium mt-1"><span dir="ltr">{formatPrice(ev.price)}</span></p>
                    )}
                    {ev.price === 0 && (
                      <p className="text-sm text-primary font-medium mt-1">{t("producer.detail.sections.events.free")}</p>
                    )}
                    {ev.registration_url && (
                      <a
                        href={ev.registration_url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-block mt-2 text-xs text-primary underline hover:text-primary-dark"
                      >
                        {t("producer.detail.sections.events.register")}
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
              {t("producer.detail.sections.events.show_all_count", { count: events.length })}
            </button>
          )}
        </section>
      )}

      {/* MEH-1168 P3 (decision א): the editorial DeliveryBlock now serves ALL
          producers — the legacy delivery_areas table retired from this page. It
          is fed the full delivery_areas (city · min order · day) + pickup_points
          and renders whenever the producer has any delivery/pickup signal
          (offers_delivery, delivery_areas rows, or pickup_points). Its WhatsApp
          order CTA stays tone="tertiary" so it never competes with the contact
          card's single primary CTA. */}
      {(producer.offers_delivery ||
        producer.delivery_areas?.length > 0 ||
        producer.pickup_points) && (
        <div ref={(el) => { sectionRefs.current.delivery = el; }}>
          <DeliveryBlock
            nationwide={producer.delivery_nationwide}
            areas={producer.delivery_areas || []}
            pickup={!!producer.pickup_points}
            producer={producer}
          />
        </div>
      )}

      {/* Reviews — IO-lazy: only mounts the fetch when the section
          scrolls within 300px of the viewport (saves ~300ms on 3G).
          MEH-1048: id="reviews" is the anchor target for the header trust
          strip; scroll-mt-24 offsets the landing so the heading isn't
          flush against the top. The wrapper always renders (it's the IO
          observation point), so the anchor is valid before reviews mount. */}
      <div
        id="reviews"
        // MEH-1168 P2: on mobile the anchor must clear BOTH the sticky header
        // and the now-visible section tab bar (which sticks below it); desktop
        // has no tab bar so it keeps the header-only offset.
        className="scroll-mt-[150px] md:scroll-mt-24"
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
            isOwner={isOwner}
          />
        )}
      </div>

      {/* MEH-102: Similar producers — MEH-788: scroll-reveal (below fold). */}
      {similarProducers.length >= 3 && (
        <FadeInSection as="section" {...REVEAL_PRESET} className="mt-8 border-t border-border pt-8">
          <h2 className="font-headline-md text-2xl font-bold text-text mb-1">{t("producer.detail.sections.similar.heading")}</h2>
          {producer.categories?.[0]?.name && (
            <p className="text-sm text-fg-muted mb-4">
              {t("producer.detail.sections.similar.in_area", { category: producer.categories[0].name })}
            </p>
          )}
          <div className="flex gap-4 overflow-x-auto pb-2 md:grid md:grid-cols-3 md:overflow-visible">
            {similarProducers.map((p) => (
              <div key={p.id} className="flex-shrink-0 w-72 md:w-auto">
                <ProducerCard producer={p} referrer="similar" />
              </div>
            ))}
          </div>
        </FadeInSection>
      )}

      {/* MEH-1146 chunk B: location is the LAST content section — opening hours
          + the Leaflet MiniMap (never a Google embed, fix 1) with the
          "פתיחה במפות Google" navigation link inside MiniMap. */}
      {/* MEH-102: Opening hours */}
      <OpeningHours opening_hours={producer.opening_hours} />

      {/* MEH-102: Mini-map with navigation — hidden for delivery-only */}
      {producer.has_physical_location !== false && producer.lat && producer.lng && (
        <MiniMap lat={producer.lat} lng={producer.lng} name={producer.name} />
      )}

      {/* Directory-only disclaimer — required by Israeli consumer
          protection law. The seller bears legal responsibility for
          products and licensing; the platform is just a directory. */}
      <DirectoryDisclaimer className="mt-8" />

      {/* MEH-1146 chunk C: discovery loop — more businesses in the same area
          (city). Frontend-only (reuses GET /producers with city+exclude via
          useProducerData). Hidden entirely below MIN_NEARBY_BUSINESSES so a
          thin 1-2 card row never shows; the report link stays below it. */}
      {nearbyProducers.length >= MIN_NEARBY_BUSINESSES && (
        <FadeInSection as="section" {...REVEAL_PRESET} className="mt-8 border-t border-border pt-8">
          <h2 className="font-headline-md text-2xl font-bold text-text mb-4">
            {t("producer.detail.sections.nearby.heading")}
          </h2>
          <div className="flex gap-4 overflow-x-auto pb-2 md:grid md:grid-cols-3 md:overflow-visible">
            {nearbyProducers.slice(0, 6).map((p) => (
              <div key={p.id} className="flex-shrink-0 w-72 md:w-auto">
                <ProducerCard producer={p} referrer="nearby" />
              </div>
            ))}
          </div>
        </FadeInSection>
      )}

      {/* Report — stays at the page end, below the discovery loop. */}
      <div className="mt-6 pt-6 border-t border-border">
        <ReportButton producerId={producer.id} />
      </div>
    </>
  );
}
