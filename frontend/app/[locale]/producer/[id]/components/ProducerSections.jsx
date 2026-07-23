import { useEffect, useState } from "react";
import Image from "next/image";
import { Leaf, MapPin } from "@phosphor-icons/react";
import dynamic from "next/dynamic";
import { useTranslations, useFormatter, useLocale } from "next-intl";
import api from "@/lib/api";
import { optimizeCloudinary, IMAGE_RATIOS } from "@/lib/cloudinary";
import ImageWithFallback from "@/components/ImageWithFallback";
// MEH-1140: canonical shekel format — amount then ₪ ("35₪"), one owner in lib/utils.
import { formatPrice, formatPriceRange } from "@/lib/utils";
import { formatEventDate } from "@/lib/format-date";
import DeliveryBlock from "@/components/DeliveryBlock";
// MEH-788: scroll-reveal on the description + similar sections (not LCP/gallery).
import FadeInSection, { REVEAL_PRESET } from "@/components/FadeInSection";
import DirectoryDisclaimer from "@/components/DirectoryDisclaimer";
import OpeningHours from "@/components/OpeningHours";
// MEH-1306: owner-only per-section pencil → deep-links into the edit
// accordion. Self-gating (0 DOM for non-owners), mounted unconditionally.
import OwnerSectionEditLink from "@/components/OwnerSectionEditLink";
// MEH-1334 chunk 3: "מאחורי העסק" — data-gated owner card (Z4).
import OwnerCard from "./OwnerCard";
import ProducerCard from "@/components/ProducerCard";
import RecipeCard from "@/components/public/RecipeCard";
import ReportButton from "@/components/ReportButton";
// MEH-1460: the "טעות בפרטים?" correction link relocated here from
// ContactCard — its modal/email logic (v1, MEH-1443) is unchanged.
import ReportInfoModal from "@/components/ReportInfoModal";
import ReviewsSection from "@/components/ReviewsSection";
// MEH-1490: quiet live-fetch Google-rating line — renders below (and detached
// from) the native reviews block, only for producers an admin mapped.
import GoogleRatingLine from "@/components/GoogleRatingLine";

const MiniMap = dynamic(() => import("@/components/MiniMap"), { ssr: false });

// MEH-1146 chunk C: the discovery loop ("עוד בתי עסק באזור") renders only when
// at least this many same-city businesses (excluding the current one) come
// back — below it the section hides entirely so it never shows a thin 1-2 card
// row. Documented const per the spec.
const MIN_NEARBY_BUSINESSES = 4;

// MEH-1334 chunk 3: single owner of "does this producer have a mappable
// location" — gates both the merged location section and the MiniMap mount.
function parseHasLocation(producer) {
  return producer.has_physical_location !== false && !!producer.lat && !!producer.lng;
}

/**
 * The middle of the main column. MEH-1146 chunk B reorders the sections to
 * the editorial IA: about → products → recipes → events → delivery →
 * reviews → similar → location (OpeningHours + MiniMap, LAST) → disclaimer →
 * report. The signature product (top_product_name / starting_price_label)
 * moved OUT of ProducerHeader to the top of the products section here.
 *
 * Delivery (MEH-1168 P3, decision A): a single editorial <DeliveryBlock> serves
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
  const locale = useLocale();
  const [showAllEvents, setShowAllEvents] = useState(false);
  // MEH-1460: "report wrong info" modal — moved from ContactCard so the
  // correction link lives in the page-end meta block, not the CTA card.
  const [reportOpen, setReportOpen] = useState(false);
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
  // MEH-1233 B4: the signature product (top_product_name) is a free-text DB
  // label. When it names a product that ALSO has a grid entry, feature that
  // entry's photo in the highlight and DROP it from the grid below (fixes the
  // MEH-1146 chunk B duplicate — C4). Exact name match only; a free-text label
  // with no matching product just renders name + price on the leaf placeholder.
  const signatureProduct =
    producer.top_product_name
      ? (producer.products || []).find(
          (p) => p.name?.trim() === producer.top_product_name.trim(),
        )
      : null;
  const signatureImg = signatureProduct?.image_url
    ? optimizeCloudinary(signatureProduct.image_url, { aspectRatio: "1:1", width: 160 })
    : null;
  const gridProducts = signatureProduct
    ? (producer.products || []).filter((p) => p.id !== signatureProduct.id)
    : producer.products || [];

  // MEH-1463: when the signature product was deduped out of the grid and the
  // free-text starting_price_label is empty, surface the matched product's own
  // price/description on the highlight card so the info the dedup removed isn't
  // lost. starting_price_label keeps priority when present (unchanged). Numeric
  // price → canonical formatPriceRange (MEH-1140) with dir="ltr" bidi isolation;
  // free-text price_range is DATA (MEH-1305 F) rendered in natural direction.
  const signatureNumericPrice =
    !producer.starting_price_label && signatureProduct?.price_min != null
      ? formatPriceRange(signatureProduct.price_min, signatureProduct.price_max)
      : null;
  const signatureFreeTextPrice =
    !producer.starting_price_label && !signatureNumericPrice
      ? signatureProduct?.price_range || null
      : null;

  return (
    <>
      {/* Description — MEH-788: scroll-reveal (motion.section keeps the
          sectionRefs callback ref for the tab-scroll IO). */}
      {producer.description && (
        // MEH-1306: stable id (deep-link target of the edit tab's view-link)
        // + scroll-mt clearing the sticky header/tab bar (the #reviews idiom).
        <FadeInSection as="section" {...REVEAL_PRESET} id="section-bio" className="mt-8 scroll-mt-[calc(var(--chrome-top,82px)_+_68px)] md:scroll-mt-24" ref={(el) => { sectionRefs.current.about = el; }}>
          <div className="flex items-center gap-2 mb-3">
            <h2 className="font-headline-md text-2xl font-bold text-text">{t("producer.detail.sections.about")}</h2>
            <OwnerSectionEditLink producerId={producer.id} anchor="bio" sectionKey="bio" />
          </div>
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
        <section id="section-products" className="mt-8 scroll-mt-[calc(var(--chrome-top,82px)_+_68px)] md:scroll-mt-24" ref={(el) => { sectionRefs.current.products = el; }}>
          {/* MEH-1306: owner pencil beside the heading → #products card. */}
          <div className="flex items-center gap-2 mb-4">
            <h2 className="font-headline-md text-2xl font-bold text-text">{t("producer.detail.sections.products.heading")}</h2>
            <OwnerSectionEditLink producerId={producer.id} anchor="products" sectionKey="products" />
          </div>

          {/* Signature product — moved from ProducerHeader (MEH-1146 chunk B).
              MEH-1233 B4: rendered as a real highlight CARD (thumbnail + name +
              starting_price_label) on the lighter surface-card token, not the
              page-cream `bg-background` box that read as an empty wide row when
              only the name was present. starting_price_label is a free-text DB
              label (NOT routed through formatPrice per MEH-1140 — data, not a
              numeric amount). The photo comes from the matching grid product
              when one exists (that product is deduped out of the grid below);
              otherwise the canonical leaf placeholder (MEH-1138). */}
          {hasSignature && (
            <div className="mb-4 flex items-center gap-3 bg-surface-card border border-border rounded-md p-3">
              <div className="relative w-16 h-16 flex-shrink-0 rounded-md overflow-hidden bg-background">
                {signatureImg ? (
                  <Image
                    src={signatureImg}
                    alt={producer.top_product_name || ""}
                    fill
                    className="object-cover"
                    sizes="64px"
                  />
                ) : (
                  <div className="w-full h-full bg-background flex items-center justify-center" aria-hidden="true">
                    <Leaf size={28} weight="light" className="text-primary/[0.32]" />
                  </div>
                )}
              </div>
              <div className="min-w-0">
                {/* MEH-1463: accent eyebrow so the card reads as "the signature
                    product", not just a bigger unlabeled row. */}
                <p className="text-accent text-xs font-medium">
                  {t("producer.detail.sections.products.signature_label")}
                </p>
                {producer.top_product_name && (
                  <p className="font-medium text-text">{producer.top_product_name}</p>
                )}
                {/* MEH-1463: description fallback from the deduped grid product. */}
                {signatureProduct?.description && (
                  <p className="text-sm text-fg-muted mt-0.5 line-clamp-2">{signatureProduct.description}</p>
                )}
                {producer.starting_price_label ? (
                  <p className="text-accent font-semibold mt-0.5">{producer.starting_price_label}</p>
                ) : signatureNumericPrice ? (
                  <p className="text-accent font-semibold mt-0.5"><span dir="ltr">{signatureNumericPrice}</span></p>
                ) : signatureFreeTextPrice ? (
                  <p className="text-accent font-semibold mt-0.5">{signatureFreeTextPrice}</p>
                ) : null}
              </div>
            </div>
          )}

          {/* MEH-1168 P2: compact product ROWS (approved 1b anatomy), replacing
              the giant image-first cards. Each row = a square thumbnail at the
              inline-start + name/price beside it, ~96px tall, hairline-separated.
              Desktop lays the rows out in two columns (fixes the old 2+1
              asymmetric card grid). Prices via formatPriceRange (MEH-1140) with
              dir="ltr" bidi isolation (regression baseline:
              qa-artifacts/MEH-1168-p1/price-cell-zoom.webp). */}
          {gridProducts.length > 0 && (
            <div className="grid grid-cols-1 md:grid-cols-2 md:gap-x-6 border-t border-border">
              {gridProducts.map((product) => {
                // Cloudinary 1:1 square when a photo exists; otherwise the
                // canonical no-photo state (MEH-1138) — never a package icon.
                const img = product.image_url
                  ? optimizeCloudinary(product.image_url, { aspectRatio: IMAGE_RATIOS.square, width: 160 })
                  : null;
                // MEH-1305 F: numeric prices go through the canonical
                // formatPriceRange (MEH-1140) and are bidi-isolated; a free-text
                // price_range is DATA (MEH-1140 — never reformatted) and renders
                // in the natural direction, since forcing dir="ltr" corrupts a
                // Hebrew-bearing label like "מ-30₪" / "30₪ לחבילה".
                const numericPrice =
                  product.price_min != null
                    ? formatPriceRange(product.price_min, product.price_max)
                    : null;
                const freeTextPrice = numericPrice ? null : product.price_range || null;
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
                        // MEH-1305 E: typographic no-photo cell — the product's
                        // initial in Frank Ruhl (font-headline-md) on a
                        // bg-primary/[0.06] tint, NO leaf glyph. Realises
                        // MEH-1126's "אין placeholder אייקון" intent for the grid
                        // (supersedes the MEH-1168 P1 leaf), so photo and
                        // no-photo grid cells read as one calm, uniform system.
                        <div
                          className="w-full h-full bg-primary/[0.06] flex items-center justify-center"
                          aria-label={t("producer.card.aria.image_missing", { name: product.name })}
                          role="img"
                        >
                          <span className="font-headline-md text-2xl text-primary/40" aria-hidden="true">
                            {product.name?.trim()?.[0] || "•"}
                          </span>
                        </div>
                      )}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="font-medium text-text">{product.name}</p>
                      {product.description && (
                        <p className="text-sm text-fg-muted mt-0.5 line-clamp-1">{product.description}</p>
                      )}
                      {/* Same price cell/position for every card. MEH-1168 P1:
                          the ₪-suffixed numeric amount is bidi-isolated so RTL
                          flow can't render "35₪" as "₪35". */}
                      {numericPrice && (
                        <p className="text-accent font-medium mt-1"><span dir="ltr">{numericPrice}</span></p>
                      )}
                      {freeTextPrice && (
                        <p className="text-accent font-medium mt-1">{freeTextPrice}</p>
                      )}
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
                  {/* MEH-1229: was a raw <Image src={ev.image_url}> that bypassed
                      the helper. Now routed through it (square crop + f_auto,q_auto)
                      with graceful fallback so a broken URL degrades to the
                      placeholder instead of a _next/image 404. */}
                  {ev.image_url && (
                    <ImageWithFallback
                      src={ev.image_url}
                      alt={ev.title}
                      aspectRatio={IMAGE_RATIOS.square}
                      optimizeWidth={128}
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

      {/* MEH-1168 P3 (decision A): the editorial DeliveryBlock now serves ALL
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
            excluded={producer.delivery_excluded_cities || []}
            areas={producer.delivery_areas || []}
            pickup={!!producer.pickup_points}
            producer={producer}
          />
        </div>
      )}

      {/* MEH-1334 chunk 3: owner card — between delivery and reviews per the
          approved mockup (a NEW section; the MEH-1146 order of existing
          sections is untouched). Self-gates on contact_name (null without). */}
      <OwnerCard producer={producer} />

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
        // MEH-1202: mobile offset = live header height (`--chrome-top`) + the
        // tab-bar band (~68px), replacing the hardcoded 150px. Desktop keeps
        // the header-only scroll-mt-24 (no tab bar there).
        className="scroll-mt-[calc(var(--chrome-top,82px)_+_68px)] md:scroll-mt-24"
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

      {/* MEH-1490: quiet Google-rating trust line — detached from the native
          reviews block above (its own border-t + margin, ToS visual separation
          + cannibalization guard). Mount is gated on a mapped place_id so
          unmapped producers make zero requests; the component itself renders
          nothing on a 204 (< 20 reviews / API error / no key). */}
      {producer.google_place_id && <GoogleRatingLine producerId={producer.id} />}

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

      {/* MEH-1146 chunk B: location is the LAST content section. MEH-1334
          chunk 3: merged into ONE "הגעה ומיקום" section (mockup Z3) — heading
          + address line (city ONLY — street address is admin/owner-private
          per MEH-829, decision 3) + collapsed OpeningHours + the Leaflet
          MiniMap (never a Google embed) with brand nav buttons. The owner
          pencil (MEH-1306) moved inline beside the heading, matching the
          bio/products idiom. */}
      {(parseHasLocation(producer) || producer.opening_hours) && (
        <section
          id="section-location"
          className="mt-8 border-t border-border pt-8 scroll-mt-[calc(var(--chrome-top,82px)_+_68px)] md:scroll-mt-24"
        >
          <div className="flex items-center gap-2 mb-3">
            <h2 className="font-headline-md text-2xl font-bold text-text">
              {t("producer.detail.sections.location")}
            </h2>
            <OwnerSectionEditLink producerId={producer.id} anchor="location" sectionKey="location" />
          </div>
          {/* Address line — city-only fallback, never empty (revision-1 #5). */}
          {producer.city && (
            <p className="flex items-center gap-1.5 text-[13.5px] text-muted mb-3">
              <MapPin size={14} aria-hidden="true" />
              {producer.city}
            </p>
          )}
          <OpeningHours opening_hours={producer.opening_hours} />
          {parseHasLocation(producer) && (
            <MiniMap lat={producer.lat} lng={producer.lng} name={producer.name} />
          )}
        </section>
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
        {/* MEH-1460: quiet "טעות בפרטים? עדכנו אותנו" correction link,
            directly below ReportButton (opens the MEH-1443 email-only modal).
            Relocated here from ContactCard — same quiet-link styling. */}
        <button
          type="button"
          onClick={() => setReportOpen(true)}
          className="mt-3 block text-xs text-fg-muted underline hover:text-text transition"
        >
          {t("producer.detail.contact_card.report_info_link")}
        </button>
      </div>

      <ReportInfoModal
        open={reportOpen}
        onClose={() => setReportOpen(false)}
        producerSlug={producer.slug || producer.id}
      />

      {/* MEH-1291: last-updated freshness signal. Renders ONLY when a real
          edit has stamped producer.updated_at (nullable, no backfill — Chunk A
          migration a3f1c9d2e4b7), so untouched producers show nothing. Modest
          month-year granularity via the shared format-date util (he→he-IL,
          en→en-US). Page-end meta footnote — no section reorder. */}
      {producer.updated_at && (
        <p className="mt-4 text-xs text-fg-muted">
          {t("producer.detail.last_updated", {
            date: formatEventDate(producer.updated_at, locale, {
              month: "long",
              year: "numeric",
            }),
          })}
        </p>
      )}
    </>
  );
}
