import { useEffect, useState } from "react";
import Image from "next/image";
import dynamic from "next/dynamic";
import { Package } from "@phosphor-icons/react";

import api from "@/lib/api";
import DeliveryBlock from "@/components/DeliveryBlock";
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
}) {
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
                className="bg-white rounded-[12px] p-4 border border-border flex gap-3 items-start"
              >
                {product.image_url ? (
                  <div className="relative w-16 h-16 shrink-0 rounded-[8px] overflow-hidden bg-light">
                    <Image
                      src={product.image_url}
                      alt={product.name}
                      fill
                      className="object-cover"
                      sizes="64px"
                    />
                  </div>
                ) : (
                  <div className="w-16 h-16 shrink-0 rounded-[8px] bg-light flex items-center justify-center">
                    <Package size={28} className="text-site-muted/60" aria-hidden="true" />
                  </div>
                )}
                <div className="flex-1 min-w-0">
                  <p className="font-medium text-site-text">{product.name}</p>
                  {product.description && (
                    <p className="text-sm text-site-muted mt-1 line-clamp-2">{product.description}</p>
                  )}
                  {(() => {
                    if (product.price_min != null && product.price_max != null)
                      return <p className="text-accent font-medium mt-2">₪{Number(product.price_min)}–₪{Number(product.price_max)}</p>;
                    if (product.price_min != null)
                      return <p className="text-accent font-medium mt-2">₪{Number(product.price_min)}</p>;
                    if (product.price_range)
                      return <p className="text-accent font-medium mt-2">{product.price_range}</p>;
                    return null;
                  })()}
                </div>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* MEH-591: Producer recipes (chunk 4/4). Section is hidden entirely
          when the producer has no published+approved recipes — empty state
          is silent per spec. Anchor id matches the breadcrumb in
          RecipeDetail.jsx ("חזרה לדף בית העסק > מתכונים"). */}
      {producer.slug && recipes.length > 0 && (
        <section className="mt-8" id="recipes">
          <h2 className="font-headline text-2xl font-bold text-site-text mb-4">
            המתכונים שלנו
          </h2>
          <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
            {recipes.map((r) => (
              <RecipeCard key={r.id} slug={producer.slug} recipe={r} />
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
    </>
  );
}
