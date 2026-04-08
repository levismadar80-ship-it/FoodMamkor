"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import api from "@/lib/api";
import ImageGallery from "@/components/ImageGallery";
import CategoryTag from "@/components/CategoryTag";
import FavoriteButton from "@/components/FavoriteButton";
import ReportButton from "@/components/ReportButton";
import ShareButton from "@/components/ShareButton";
import WhatsAppButton from "@/components/WhatsAppButton";
import Breadcrumb from "@/components/Breadcrumb";
import ProducerReviews from "@/components/ProducerReviews";

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

  return (
    <div className="max-w-4xl mx-auto px-4 py-6">
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

      {/* Header */}
      <div className="mt-6 flex items-start justify-between">
        <div>
          <div className="flex items-center flex-wrap gap-2 mb-2">
            <h1 className="font-headline text-3xl font-bold text-site-text ml-2">{producer.name}</h1>
            {producer.is_verified && (
              <span className="bg-light text-primary border border-primary/20 text-xs px-3 py-1 rounded-full">
                ✅ עסק מאומת
              </span>
            )}
            {producer.reviews_count > 0 && (
              <span
                className="text-xs px-3 py-1 rounded-full"
                style={{ background: "#FFF9E6", color: "#946A00", border: "1px solid #F0C040" }}
                title={`${producer.reviews_count} ביקורות`}
              >
                ⭐ {Number(producer.avg_rating).toFixed(1)} ({producer.reviews_count})
              </span>
            )}
            {producer.plan === "premium" && (
              <span className="bg-accent text-white text-xs px-3 py-1 rounded-full">פרמיום</span>
            )}
          </div>
          <p className="text-text-secondary">{producer.city}</p>
          {(producer.top_product_name || producer.starting_price_label) && (
            <p className="mt-1 text-sm">
              {producer.top_product_name && (
                <span className="text-text-primary">{producer.top_product_name}</span>
              )}
              {producer.top_product_name && producer.starting_price_label && (
                <span className="text-text-secondary"> · </span>
              )}
              {producer.starting_price_label && (
                <span className="text-primary font-semibold">{producer.starting_price_label}</span>
              )}
            </p>
          )}
        </div>
        <div className="flex items-center gap-2">
          <ShareButton url={shareUrl} title={producer.name} />
          <FavoriteButton producerId={producer.id} />
        </div>
      </div>

      {/* Categories */}
      <div className="flex flex-wrap gap-2 mt-4">
        {producer.categories?.map((cat) => (
          <CategoryTag key={cat.id} category={cat} />
        ))}
      </div>

      {/* Description */}
      {producer.description && (
        <div className="mt-6">
          <h2 className="font-semibold text-lg mb-2">אודות</h2>
          <p className="text-text-secondary leading-relaxed">{producer.description}</p>
        </div>
      )}

      {/* Contact */}
      <div className="mt-6 flex flex-wrap gap-3">
        {producer.phone && (
          <>
            <a
              href={`tel:${producer.phone}`}
              className="inline-flex items-center gap-2 bg-gray-100 px-4 py-2 rounded-[12px] hover:bg-gray-200 transition text-sm"
            >
              📞 {producer.phone}
            </a>
            <WhatsAppButton phone={producer.phone} productTitle={producer.name} />
          </>
        )}
        {producer.instagram && (
          <a
            href={`https://instagram.com/${producer.instagram}`}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-2 bg-gray-100 px-4 py-2 rounded-[12px] hover:bg-gray-200 transition text-sm"
          >
            📷 Instagram
          </a>
        )}
        {producer.website && (
          <a
            href={producer.website.startsWith("http") ? producer.website : `https://${producer.website}`}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-2 bg-gray-100 px-4 py-2 rounded-[12px] hover:bg-gray-200 transition text-sm"
          >
            🌐 אתר
          </a>
        )}
      </div>

      {/* Products (premium only) */}
      {producer.products?.length > 0 && (
        <div className="mt-8">
          <h2 className="font-semibold text-lg mb-4">מוצרים</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {producer.products.map((product) => (
              <div key={product.id} className="bg-white rounded-[12px] p-4 border">
                <p className="font-medium">{product.name}</p>
                {product.description && <p className="text-sm text-text-secondary">{product.description}</p>}
                {product.price_range && <p className="text-primary font-medium mt-1">{product.price_range}</p>}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Delivery Areas */}
      {producer.delivery_areas?.length > 0 && (
        <div className="mt-8">
          <h2 className="font-semibold text-lg mb-4">אזורי משלוח</h2>
          <div className="bg-white rounded-[12px] overflow-hidden border">
            <table className="w-full">
              <thead className="bg-gray-50">
                <tr>
                  <th className="text-right px-4 py-3 text-sm font-medium text-text-secondary">עיר</th>
                  <th className="text-right px-4 py-3 text-sm font-medium text-text-secondary">מינימום הזמנה</th>
                  <th className="text-right px-4 py-3 text-sm font-medium text-text-secondary">יום משלוח</th>
                </tr>
              </thead>
              <tbody>
                {producer.delivery_areas.map((da) => (
                  <tr key={da.id} className="border-t">
                    <td className="px-4 py-3">{da.city}</td>
                    <td className="px-4 py-3">{da.min_order ? `₪${da.min_order}` : "-"}</td>
                    <td className="px-4 py-3">{da.delivery_day || "-"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Show on map + Report */}
      <div className="mt-8 pt-6 border-t border-border flex items-center justify-between">
        {producer.lat && producer.lng && (
          <button
            type="button"
            onClick={() => {
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
                // sessionStorage may be unavailable (private mode) — map will still open
              }
              router.push("/map");
            }}
            className="inline-flex items-center gap-2 text-primary hover:underline text-sm font-medium focus-visible:ring-2 focus-visible:ring-primary rounded"
            aria-label="פתח את המיקום של העסק במפה"
          >
            🗺️ הצג במפה
          </button>
        )}
        <ReportButton producerId={producer.id} />
      </div>

      {/* Reviews section (FIXES_V2.md fix 3) */}
      <ProducerReviews producerId={producer.id} />
    </div>
  );
}
