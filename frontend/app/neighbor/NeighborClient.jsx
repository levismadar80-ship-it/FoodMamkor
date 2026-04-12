"use client";

import { useCallback, useEffect, useState } from "react";
import { useAuth } from "@/lib/auth-context";
import { Plus, X, House } from "@phosphor-icons/react";
import api from "@/lib/api";
import HomeProductCard from "@/components/HomeProductCard";
import HomeProductForm from "@/components/HomeProductForm";
import CitySearch from "@/components/CitySearch";
import Breadcrumb from "@/components/Breadcrumb";
import { SkeletonProducerGrid } from "@/components/Skeleton";
import { showToast } from "@/lib/toast";

/**
 * /neighbor page — dedicated browse view for "מהמטבח של השכן".
 *
 * Design brief:
 *   - Dark-green hero (#2E4A2E / bg-primary-dark) with title + subtitle
 *   - CitySearch filter bar below the hero
 *   - Grid of HomeProductCard (3/2/1 responsive)
 *   - Floating "+ פרסמי מוצר" CTA (bottom-right on mobile, inline on desktop)
 *   - Section-level disclaimer (not per-card) — the liability notice
 *
 * Privacy note: HomeProductCard only shows city + neighborhood, never
 * street/zip. Those are persisted server-side via FIXES_V2 fix 7c but
 * deliberately excluded from HomeProductOut.
 */
export default function NeighborClient() {
  const { user } = useAuth();
  const [listings, setListings] = useState([]);
  const [loading, setLoading] = useState(true);
  const [city, setCity] = useState("");
  const [showForm, setShowForm] = useState(false);

  const loadListings = useCallback(() => {
    setLoading(true);
    const params = city ? { city } : {};
    api
      .get("/home-products", { params })
      .then((r) => setListings(r.data))
      .catch(() => setListings([]))
      .finally(() => setLoading(false));
  }, [city]);

  useEffect(() => {
    loadListings();
  }, [loadListings]);

  const handleWhatsAppClick = async (productId) => {
    if (!user) return;
    try {
      await api.post(`/home-products/${productId}/whatsapp-click`);
    } catch {
      // ignore — the click still opens WhatsApp via the anchor
    }
  };

  const handleCreated = (created) => {
    setShowForm(false);
    if (created?.moderation_status === "FLAGGED") {
      showToast("המוצר פורסם עם תגית 'בבדיקה' 🔍");
    } else {
      showToast("המוצר פורסם! 🌿");
    }
    loadListings();
  };

  return (
    <div>
      {/* ================= Hero =================
          PREMIUM_DESIGN: Ken Burns background image behind the title —
          kitchen/cooking photo from Unsplash. */}
      <section className="relative text-light py-16 md:py-20 overflow-hidden">
        <div
          className="kenburns-left absolute"
          style={{
            inset: "-5%",
            backgroundImage:
              "url(https://images.unsplash.com/photo-1498579809087-ef1e558fd1da?w=1600&auto=format&q=80)",
            backgroundSize: "cover",
            backgroundPosition: "center",
          }}
        />
        <div
          className="absolute inset-0"
          style={{
            background:
              "linear-gradient(to bottom, rgba(46,74,46,0.78) 0%, rgba(46,74,46,0.90) 100%)",
          }}
        />
        <div className="relative max-w-5xl mx-auto px-4 text-center">
          <h1
            className="font-headline font-bold text-white mb-3 inline-flex items-center gap-3"
            style={{ fontSize: "clamp(36px, 5vw, 56px)" }}
          >
            מהמטבח של השכן
            <House size={44} weight="duotone" color="#EAF3DE" aria-hidden="true" />
          </h1>
          <p className="font-body text-light/90 text-lg max-w-xl mx-auto">
            מוצרים ביתיים מהשכנות שלך — ישירות מהמטבח
          </p>
        </div>
      </section>

      <div className="max-w-7xl mx-auto px-4 py-8">
        <Breadcrumb
          items={[{ href: "/", label: "בית" }, { label: "מהמטבח של השכן" }]}
          className="mb-4"
        />

        {/* ================= Filter bar ================= */}
        <div className="flex flex-wrap items-center gap-3 mb-6">
          <div className="flex-1 min-w-[240px] max-w-md">
            <CitySearch
              id="neighbor-city"
              label="סנני לפי עיר"
              value={city}
              onChange={setCity}
              placeholder="סנני לפי עיר..."
            />
          </div>
          {city && (
            <button
              type="button"
              onClick={() => setCity("")}
              className="text-sm text-primary hover:underline"
            >
              הצגי הכל
            </button>
          )}
          {/* Desktop: inline CTA. Mobile: floating button below. */}
          {user && (
            <button
              type="button"
              onClick={() => setShowForm(!showForm)}
              className="hidden md:inline-flex items-center gap-2 bg-primary text-white px-5 py-2.5 rounded-full hover:bg-primary-light transition focus-visible:ring-2 focus-visible:ring-primary/40"
            >
              {showForm ? <X size={18} weight="bold" /> : <Plus size={18} weight="bold" />}
              {showForm ? "סגרי טופס" : "פרסמי מוצר"}
            </button>
          )}
        </div>

        {/* ================= Section disclaimer ================= */}
        <div
          role="note"
          className="bg-yellow-50 border border-yellow-200 rounded-[16px] p-4 mb-6 text-sm text-yellow-800"
        >
          ⚠️ האחריות על המוצר היא של המוכר בלבד. מהמקור אינה מאמתת מוצרים בסקציה
          זו — סמכי על האינסטינקטים שלך, בקשי פרטים, ותני אמון לשכנות שלך.
        </div>

        {/* ================= Create form (inline, togglable) ================= */}
        {showForm && user && (
          <HomeProductForm
            onCreated={handleCreated}
            onCancel={() => setShowForm(false)}
          />
        )}

        {/* ================= Grid ================= */}
        {loading ? (
          <SkeletonProducerGrid count={6} />
        ) : listings.length === 0 ? (
          <div className="text-center py-16">
            <div className="inline-flex items-center justify-center w-24 h-24 rounded-full bg-light mb-6 text-5xl" aria-hidden="true">
              🏡
            </div>
            <h2 className="font-headline text-2xl font-bold text-site-text mb-2">
              {city
                ? "אין מוצרים באזור הזה עדיין 🌱"
                : "אין עדיין מוצרים ביתיים 🌱"}
            </h2>
            <p className="text-site-muted mb-6 max-w-md mx-auto">
              {user
                ? "היי את הראשונה לפרסם מוצר בית!"
                : "התחברי כדי לפרסם מוצר משלך."}
            </p>
            {user && !showForm && (
              <button
                type="button"
                onClick={() => setShowForm(true)}
                className="bg-primary text-white px-6 py-3 rounded-full hover:bg-primary-light transition font-medium"
              >
                פרסמי מוצר +
              </button>
            )}
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 pb-24 md:pb-8">
            {listings.map((hp) => (
              <HomeProductCard
                key={hp.id}
                product={hp}
                onWhatsAppClick={() => handleWhatsAppClick(hp.id)}
              />
            ))}
          </div>
        )}
      </div>

      {/* ================= Mobile floating CTA ================= */}
      {user && (
        <button
          type="button"
          onClick={() => setShowForm(!showForm)}
          className="md:hidden fixed bottom-24 left-1/2 -translate-x-1/2 z-[900] bg-primary text-white px-6 py-3 rounded-full shadow-[0_4px_24px_rgba(46,104,83,0.35)] flex items-center gap-2 font-medium focus-visible:ring-2 focus-visible:ring-primary/40"
          aria-label={showForm ? "סגור טופס פרסום מוצר" : "פרסמי מוצר חדש"}
        >
          {showForm ? <X size={18} weight="bold" /> : <Plus size={18} weight="bold" />}
          {showForm ? "סגרי" : "פרסמי מוצר"}
        </button>
      )}
    </div>
  );
}
