"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import api from "@/lib/api";
import ImageGallery from "@/components/ImageGallery";
import CategoryTag from "@/components/CategoryTag";
import FavoriteButton from "@/components/FavoriteButton";
import ReportButton from "@/components/ReportButton";
import WhatsAppButton from "@/components/WhatsAppButton";

export default function ProducerDetailPage() {
  const { id } = useParams();
  const [producer, setProducer] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api
      .get(`/producers/${id}`)
      .then((r) => setProducer(r.data))
      .catch(() => setProducer(null))
      .finally(() => setLoading(false));
  }, [id]);

  if (loading) {
    return (
      <div className="max-w-4xl mx-auto px-4 py-12 text-center text-text-secondary">
        טוען...
      </div>
    );
  }

  if (!producer) {
    return (
      <div className="max-w-4xl mx-auto px-4 py-12 text-center text-text-secondary">
        יצרן לא נמצא
      </div>
    );
  }

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
              <span className="bg-primary text-white text-xs px-3 py-1 rounded-full">מאומת ✓</span>
            )}
            {producer.plan === "premium" && (
              <span className="bg-accent text-white text-xs px-3 py-1 rounded-full">פרמיום</span>
            )}
          </div>
          <p className="text-text-secondary">{producer.city}</p>
        </div>
        <FavoriteButton producerId={producer.id} />
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

      {/* Report */}
      <div className="mt-8 pt-6 border-t">
        <ReportButton producerId={producer.id} />
      </div>
    </div>
  );
}
