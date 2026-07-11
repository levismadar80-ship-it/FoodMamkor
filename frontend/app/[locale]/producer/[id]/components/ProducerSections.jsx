import { useEffect, useState } from "react";
import Image from "next/image";
import dynamic from "next/dynamic";
import { useTranslations, useFormatter } from "next-intl";
import api from "@/lib/api";
import { optimizeCloudinary } from "@/lib/cloudinary";
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

/**
 * The middle of the main column: description, opening hours, mini-map,
 * similar producers, events, products, delivery, disclaimer, report,
 * lazy-mounted reviews. Verbatim move from ProducerDetail.jsx:482-690.
 *
 * Two delivery branches are PRESERVED VERBATIM (per Phase 1 risk
 * note + REFACTOR_PLAN.md §File 2 risk-d item):
 *   - New: <DeliveryBlock> when producer.offers_delivery is truthy
 *     (:621-631).
 *   - Legacy: an `<aזורי משלוח>` table when !offers_delivery and
 *     delivery_areas[].length > 0 (:633-663).
 * The legacy branch is kept because some producers still have
 * delivery_areas rows from the pre-MEH-213 model. Do NOT delete it
 * without a separate migration plan.
 *
 * showAllEvents state lives here as local UI state — no consumer
 * needs it. The reviews wrapper accepts reviewsContainerRef and
 * reviewsVisible from useLazyReviews so the IO observation point
 * remains identical to the source.
 */
export default function ProducerSections({
  producer,
  events,
  similarProducers,
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

      {/* MEH-102: Opening hours */}
      <OpeningHours opening_hours={producer.opening_hours} />

      {/* MEH-102: Mini-map with navigation — hidden for delivery-only */}
      {producer.has_physical_location !== false && producer.lat && producer.lng && (
        <MiniMap lat={producer.lat} lng={producer.lng} name={producer.name} />
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
                      <p className="text-sm text-accent font-medium mt-1">₪{ev.price}</p>
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

      {/* Products (premium only) */}
      {producer.products?.length > 0 && (
        <section className="mt-8" ref={(el) => { sectionRefs.current.products = el; }}>
          <h2 className="font-headline-md text-2xl font-bold text-text mb-4">{t("producer.detail.sections.products.heading")}</h2>
          {/* MEH-1126 (Task I): image-first product cards. Equal-height cells
              (grid items-stretch + card flex-col) so a 2+1 row never jumps. */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3 items-stretch">
            {producer.products.map((product) => {
              // Cloudinary 4:3 when a photo exists; otherwise a typographic card
              // (name in Frank Ruhl on a primary tint, mirroring the MEH-815
              // masthead idiom) — never a generic package icon.
              const img = product.image_url
                ? optimizeCloudinary(product.image_url, { aspectRatio: "4:3" })
                : null;
              const price =
                product.price_min != null && product.price_max != null
                  ? `₪${Number(product.price_min)}–₪${Number(product.price_max)}`
                  : product.price_min != null
                    ? `₪${Number(product.price_min)}`
                    : product.price_range || null;
              return (
                <div
                  key={product.id}
                  className="bg-white rounded-md border border-border overflow-hidden flex flex-col"
                >
                  {img ? (
                    <div className="relative w-full aspect-[4/3] bg-green-50">
                      <Image
                        src={img}
                        alt={product.name}
                        fill
                        className="object-cover"
                        sizes="(min-width: 768px) 50vw, 100vw"
                      />
                    </div>
                  ) : (
                    <div className="w-full aspect-[4/3] bg-primary/[0.06] flex items-center justify-center p-4">
                      <p className="font-headline-lg text-xl md:text-2xl font-black text-text text-center leading-tight line-clamp-3">
                        {product.name}
                      </p>
                    </div>
                  )}
                  <div className="p-4 flex-1 flex flex-col">
                    {/* imaged cards carry the name here; the imageless card already
                        shows it as the typographic hero above, so it's not repeated. */}
                    {img && <p className="font-medium text-text">{product.name}</p>}
                    {product.description && (
                      <p className="text-sm text-fg-muted mt-1 line-clamp-2">{product.description}</p>
                    )}
                    {price && <p className="text-accent font-medium mt-2">{price}</p>}
                  </div>
                </div>
              );
            })}
          </div>
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

      {/* MEH-213: DeliveryBlock — shown when offers_delivery=true.
          Replaces the old delivery_areas table for the new location model.
          MEH-904: cities derived from the delivery_areas relation (the only
          path the public POST /producers writer populates — the flat
          delivery_cities column is empty for registration-created producers). */}
      {producer.offers_delivery && (
        <div ref={(el) => { sectionRefs.current.delivery = el; }}>
          <DeliveryBlock
            nationwide={producer.delivery_nationwide}
            cities={[...new Set(
              (producer.delivery_areas || []).map((da) => da.city).filter(Boolean),
            )]}
            producer={producer}
          />
        </div>
      )}

      {/* Legacy delivery_areas table — shown for producers with the old model
          (has delivery_areas rows but no delivery_cities set yet). */}
      {!producer.offers_delivery && producer.delivery_areas?.length > 0 && (
        <section className="mt-8" ref={(el) => { sectionRefs.current.delivery = el; }}>
          <h2 className="font-headline-md text-2xl font-bold text-text mb-4">
            {t("producer.detail.sections.delivery.heading")}
          </h2>
          <div className="bg-white rounded-md overflow-hidden border border-border">
            <table className="w-full">
              <thead className="bg-green-50">
                <tr>
                  <th className="text-end px-4 py-3 text-sm font-medium text-primary">{t("producer.detail.sections.delivery.col.city")}</th>
                  <th className="text-end px-4 py-3 text-sm font-medium text-primary">{t("producer.detail.sections.delivery.col.min_order")}</th>
                  <th className="text-end px-4 py-3 text-sm font-medium text-primary">{t("producer.detail.sections.delivery.col.day")}</th>
                </tr>
              </thead>
              <tbody>
                {producer.delivery_areas.map((da) => (
                  <tr key={da.id} className="border-t border-border">
                    <td className="px-4 py-3 text-text">{da.city}</td>
                    <td className="px-4 py-3 text-text">
                      {da.min_order ? `₪${da.min_order}` : "—"}
                    </td>
                    <td className="px-4 py-3 text-text">{da.delivery_day || "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {/* Reviews — IO-lazy: only mounts the fetch when the section
          scrolls within 300px of the viewport (saves ~300ms on 3G).
          MEH-1048: id="reviews" is the anchor target for the header trust
          strip; scroll-mt-24 offsets the landing so the heading isn't
          flush against the top. The wrapper always renders (it's the IO
          observation point), so the anchor is valid before reviews mount. */}
      <div
        id="reviews"
        className="scroll-mt-24"
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

      {/* Directory-only disclaimer — required by Israeli consumer
          protection law. The seller bears legal responsibility for
          products and licensing; the platform is just a directory. */}
      <DirectoryDisclaimer className="mt-8" />

      {/* Report */}
      <div className="mt-6 pt-6 border-t border-border">
        <ReportButton producerId={producer.id} />
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
    </>
  );
}
