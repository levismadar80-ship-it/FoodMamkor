"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import api from "@/lib/api";
import EmptyState from "@/components/ui/EmptyState";
import Tooltip from "@/components/ui/Tooltip";
import ImageGallery from "@/components/ImageGallery";
import CategoryTag from "@/components/CategoryTag";
import FavoriteButton from "@/components/FavoriteButton";
import ReportButton from "@/components/ReportButton";
import ShareButton from "@/components/ShareButton";
import WhatsAppButton from "@/components/WhatsAppButton";

export default function ProducerDetail({ initialProducer = null, fetchPath = null }) {
  const params = useParams();
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
      <div className="max-w-4xl mx-auto px-4 py-12">
        <div className="flex gap-4 mb-8">
          {[0, 1, 2].map((i) => (
            <div key={i} className="flex-1 h-64 bg-border rounded-[12px] animate-pulse" />
          ))}
        </div>
        <div className="space-y-4">
          <div className="h-8 bg-border rounded w-1/2 animate-pulse" />
          <div className="h-4 bg-border rounded w-1/4 animate-pulse" />
          <div className="h-20 bg-border rounded animate-pulse" />
        </div>
      </div>
    );
  }

  if (!producer) {
    return (
      <div className="max-w-4xl mx-auto px-4 py-12">
        <EmptyState
          emoji="🔍"
          title="בית עסק לא נמצא"
          description="יכול להיות שהעסק הוסר או שהקישור שגוי"
          ctaLabel="חזרה למפה"
          ctaHref="/map"
          secondaryLabel="גלי עסקים דומים"
          secondaryHref="/"
        />
      </div>
    );
  }

  const shareUrl =
    typeof window !== "undefined"
      ? `${window.location.origin}${producer.slug ? `/${producer.slug}` : `/producer/${producer.id}`}`
      : "";

  return (
    <div className="max-w-4xl mx-auto px-4 py-8">
      {/* Gallery */}
      <ImageGallery images={producer.images || []} />

      {/* Header */}
      <div className="mt-6 flex items-start justify-between">
        <div>
          <div className="flex items-center gap-3 mb-2">
            <h1 className="text-3xl font-bold">{producer.name}</h1>
            {producer.is_verified && (
              <Tooltip content="עסק שאומת על ידי צוות מהמקור — נפגשנו איתם ובדקנו את המוצרים">
                <span className="bg-primary text-white text-xs px-3 py-1 rounded-full cursor-help">מאומת ✓</span>
              </Tooltip>
            )}
            {producer.plan === "premium" && (
              <Tooltip content="בית עסק בתוכנית הפרמיום — תמיכה מורחבת ותכונות נוספות">
                <span className="bg-accent-warm text-white text-xs px-3 py-1 rounded-full cursor-help">פרמיום</span>
              </Tooltip>
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
      <div className="mt-8 pt-6 border-t flex items-center justify-between">
        {producer.lat && producer.lng && (
          <Link
            href={`/map?lat=${producer.lat}&lng=${producer.lng}`}
            className="inline-flex items-center gap-2 text-primary hover:underline text-sm font-medium"
          >
            🗺️ הצג במפה
          </Link>
        )}
        <ReportButton producerId={producer.id} />
      </div>
    </div>
  );
}
