"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import api from "@/lib/api";
import { useAuth } from "@/lib/auth-context";
import ProducerCard from "@/components/ProducerCard";
import HomeProductCard from "@/components/HomeProductCard";

const PAGE_SIZE = 8;

const HERO_IMAGE = "https://images.unsplash.com/photo-1542838132-92c53300491e?w=1600";

const CATEGORY_CARDS = [
  { key: "meat", emoji: "🥩", name: "בשר, עוף ודגים", match: ["בשר", "עוף", "דגים"], image: "https://images.unsplash.com/photo-1607623814075-e51df1bdc82f?w=600" },
  { key: "veg", emoji: "🥬", name: "ירקות, פירות ומשקים", match: ["ירקות", "פירות", "משקה"], image: "https://images.unsplash.com/photo-1540420773420-3366772f4999?w=600" },
  { key: "dairy", emoji: "🥛", name: "חלב וגבינות", match: ["חלב", "גבינה", "גבינות"], image: "https://images.unsplash.com/photo-1486297678162-eb2a19b0a432?w=600" },
  { key: "bread", emoji: "🍞", name: "לחמים ואפייה", match: ["לחם", "אפייה", "מאפים"], image: "https://images.unsplash.com/photo-1509440159596-0249088772ff?w=600" },
  { key: "oil", emoji: "🫒", name: "שמנים ודבש", match: ["שמן", "דבש"], image: "https://images.unsplash.com/photo-1474979266404-7eaacbcd87c5?w=600" },
  { key: "care", emoji: "🧴", name: "טיפוח וסבונים", match: ["טיפוח", "סבון", "קוסמטיקה"], image: "https://images.unsplash.com/photo-1608248597279-f99d160bfcbc?w=600" },
];

function matchCategoryId(cards, categories) {
  // Build mapping from card.key → matching category id (if exists in DB)
  return cards.map((card) => {
    const found = categories.find((c) =>
      card.match.some((m) => c.name && c.name.includes(m))
    );
    return { ...card, categoryId: found ? found.id : null };
  });
}

export default function HomePage() {
  const { user } = useAuth();
  const [producers, setProducers] = useState([]);
  const [homeProducts, setHomeProducts] = useState([]);
  const [categories, setCategories] = useState([]);
  const [filters, setFilters] = useState({ category: "", delivery_city: "", has_delivery: false });
  const [showHomeForm, setShowHomeForm] = useState(false);
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE);
  const [searchQuery, setSearchQuery] = useState("");
  const [stats, setStats] = useState({ producers_count: 0, categories_count: 0 });
  const [producersLoading, setProducersLoading] = useState(true);

  useEffect(() => {
    api.get("/categories").then((r) => setCategories(r.data)).catch(() => {});
    loadProducers();
    api.get("/home-products").then((r) => setHomeProducts(r.data)).catch(() => {});
    api
      .get("/stats")
      .then((r) => setStats(r.data))
      .catch(() => {});
  }, []);

  const loadProducers = (params = {}) => {
    setProducersLoading(true);
    api
      .get("/producers", { params })
      .then((r) => {
        setProducers(r.data);
        setVisibleCount(PAGE_SIZE);
      })
      .finally(() => setProducersLoading(false));
  };

  const handleFilter = () => {
    const params = {};
    if (filters.category) params.category = filters.category;
    if (filters.delivery_city) params.delivery_city = filters.delivery_city;
    if (filters.has_delivery) params.has_delivery = true;
    loadProducers(params);
  };

  const handleSearch = (e) => {
    e.preventDefault();
    if (!searchQuery.trim()) {
      loadProducers();
      return;
    }
    // Pass as city filter for now (simple MVP)
    loadProducers({ delivery_city: searchQuery });
    const grid = document.getElementById("producers-grid");
    if (grid) grid.scrollIntoView({ behavior: "smooth" });
  };

  const handleCategoryCardClick = (card) => {
    if (!card.categoryId) return;
    const newCat = String(card.categoryId);
    setFilters({ ...filters, category: newCat });
    loadProducers({ category: newCat });
    const grid = document.getElementById("producers-grid");
    if (grid) grid.scrollIntoView({ behavior: "smooth" });
  };

  const handleWhatsAppClick = async (productId) => {
    if (!user) return;
    try {
      await api.post(`/home-products/${productId}/whatsapp-click`);
    } catch {
      // ignore
    }
  };

  const handleCreateHomeProduct = async (e) => {
    e.preventDefault();
    const form = new FormData(e.target);
    const data = {
      title: form.get("title"),
      description: form.get("description"),
      quantity: form.get("quantity"),
      price: form.get("price") || null,
      neighborhood: form.get("neighborhood"),
      city: form.get("city"),
      phone: form.get("phone"),
    };
    try {
      await api.post("/home-products", data);
      setShowHomeForm(false);
      const r = await api.get("/home-products");
      setHomeProducts(r.data);
    } catch {
      alert("שגיאה ביצירת המוצר");
    }
  };

  const visibleProducers = producers.slice(0, visibleCount);
  const hasMore = visibleCount < producers.length;
  const categoryCards = matchCategoryId(CATEGORY_CARDS, categories);
  const statsProducersCount = stats.producers_count || producers.length;
  const statsCategoriesCount = stats.categories_count || categories.length || 6;

  return (
    <div>
      {/* =========================
          HERO
          ========================= */}
      <section
        className="relative hero-parallax min-h-[90vh] md:min-h-screen flex items-center justify-center"
        style={{ backgroundImage: `url(${HERO_IMAGE})` }}
      >
        {/* Gradient overlay from bottom */}
        <div
          className="absolute inset-0"
          style={{
            background:
              "linear-gradient(180deg, rgba(46,74,46,0.25) 0%, rgba(46,74,46,0.55) 100%)",
          }}
        />
        <div className="relative z-10 max-w-4xl mx-auto px-4 text-center text-white">
          <h1
            className="font-serif font-bold mb-5 leading-tight"
            style={{ fontSize: "clamp(2.25rem, 6vw, 4rem)" }}
          >
            אוכל אמיתי, ישר מהמקור אליך
          </h1>
          <p
            className="mb-10 font-sans"
            style={{
              fontSize: "clamp(1rem, 1.6vw, 1.125rem)",
              color: "#EAF3DE",
              fontVariant: "small-caps",
              letterSpacing: "0.04em",
            }}
          >
            מוצרים מאומתים מיצרנים ישראליים
          </p>

          {/* Search bar */}
          <form
            onSubmit={handleSearch}
            className="max-w-2xl mx-auto bg-white rounded-[16px] shadow-lg flex items-center gap-2 p-2 pr-4"
          >
            <svg
              className="w-5 h-5 text-site-text/60 shrink-0"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-4.35-4.35M17 10a7 7 0 11-14 0 7 7 0 0114 0z" />
            </svg>
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="חפשי ירקות טריים, בשר grass-fed..."
              className="flex-1 bg-transparent outline-none text-site-text placeholder:text-site-text/50 py-2"
            />
            <button
              type="submit"
              className="bg-primary text-white px-5 py-2 rounded-[12px] hover:bg-primary-light transition font-medium whitespace-nowrap"
            >
              חיפוש
            </button>
          </form>
        </div>

        {/* Scroll arrow */}
        <div className="absolute bottom-8 left-1/2 -translate-x-1/2 text-white/80 animate-bounce">
          <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 14l-7 7m0 0l-7-7m7 7V3" />
          </svg>
        </div>
      </section>

      {/* =========================
          SOCIAL PROOF BAR
          ========================= */}
      <section className="bg-primary text-white py-5">
        <div className="max-w-5xl mx-auto px-4 text-center font-sans text-sm md:text-base tracking-wide">
          <span className="font-semibold">{statsProducersCount}</span> יצרנים מאומתים
          <span className="mx-3 opacity-60">·</span>
          <span className="font-semibold">{statsCategoriesCount}</span> קטגוריות
          <span className="mx-3 opacity-60">·</span>
          מכל רחבי הארץ
        </div>
      </section>

      {/* =========================
          CATEGORY GRID
          ========================= */}
      <section className="max-w-7xl mx-auto px-4 py-16">
        <div className="text-center mb-10">
          <h2 className="font-serif text-3xl md:text-4xl font-bold text-site-text mb-2">
            גלי לפי קטגוריה
          </h2>
          <p className="text-site-text/70 text-base">ישר מהיצרן — בלי מתווכים</p>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {categoryCards.map((card) => (
            <button
              key={card.key}
              onClick={() => handleCategoryCardClick(card)}
              className="relative h-[280px] rounded-[16px] overflow-hidden group cursor-pointer text-right"
              style={{
                backgroundImage: `url(${card.image})`,
                backgroundSize: "cover",
                backgroundPosition: "center",
              }}
            >
              <div
                className="absolute inset-0 transition-all duration-500 group-hover:opacity-70"
                style={{ backgroundColor: "#2e6853", opacity: 0.65 }}
              />
              <div className="relative z-10 h-full w-full flex items-center justify-center transition-transform duration-500 group-hover:scale-[1.03]">
                <div className="text-center text-white px-4">
                  <div className="text-5xl mb-3" aria-hidden>{card.emoji}</div>
                  <h3 className="font-serif text-2xl md:text-3xl font-bold">
                    {card.name}
                  </h3>
                </div>
              </div>
            </button>
          ))}
        </div>
      </section>

      {/* =========================
          PRODUCERS GRID
          ========================= */}
      <section id="producers-grid" className="max-w-7xl mx-auto px-4 pb-16">
        <div className="flex items-center justify-between mb-8">
          <h2 className="font-serif text-3xl font-bold text-site-text">בתי עסק מומלצים</h2>
          <Link href="/map" className="text-primary hover:underline flex items-center gap-1">
            הצג במפה 🗺️
          </Link>
        </div>

        {/* Quick city filter */}
        {filters.category && (
          <div className="mb-6 flex items-center gap-2">
            <span className="text-sm text-site-text/70">מציג:</span>
            {categories.find((c) => String(c.id) === filters.category) && (
              <span className="bg-light text-primary px-3 py-1 rounded-full text-sm">
                {categories.find((c) => String(c.id) === filters.category).emoji}{" "}
                {categories.find((c) => String(c.id) === filters.category).name}
              </span>
            )}
            <button
              onClick={() => {
                setFilters({ ...filters, category: "" });
                loadProducers();
              }}
              className="text-sm text-primary hover:underline"
            >
              נקה סינון
            </button>
          </div>
        )}

        {producersLoading ? (
          <p className="text-center text-site-text/60 py-12">טוענת עסקים טריים...</p>
        ) : (
          <>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
              {visibleProducers.map((p) => (
                <ProducerCard key={p.id} producer={p} />
              ))}
            </div>
            {producers.length === 0 && (
              <p className="text-center text-site-text/60 py-12">
                לא מצאנו עסקים באזור הזה — עדיין 🌱
              </p>
            )}
            {hasMore && (
              <div className="text-center mt-8">
                <button
                  onClick={() => setVisibleCount((c) => c + PAGE_SIZE)}
                  className="bg-white text-primary border-2 border-primary px-8 py-3 rounded-[16px] hover:bg-light transition font-medium"
                >
                  הצג עוד
                </button>
              </div>
            )}
          </>
        )}
      </section>

      {/* =========================
          מהמטבח של השכן
          ========================= */}
      <section className="max-w-7xl mx-auto px-4 py-16 border-t border-border">
        <div className="flex items-center justify-between mb-4">
          <h2 className="font-serif text-3xl font-bold text-site-text">🏠 מהמטבח של השכן</h2>
          {user && (
            <button
              onClick={() => setShowHomeForm(!showHomeForm)}
              className="bg-secondary text-white px-4 py-2 rounded-[16px] hover:bg-secondary-light transition text-sm"
            >
              פרסם מוצר ביתי
            </button>
          )}
        </div>

        <div className="bg-yellow-50 border border-yellow-200 rounded-[16px] p-3 mb-6 text-sm text-yellow-800">
          ⚠️ האחריות על המוצר היא של המוכר בלבד. מהמקור אינה מאמתת מוצרים בסקציה זו.
        </div>

        {/* Create form */}
        {showHomeForm && (
          <div className="bg-white rounded-[16px] p-6 mb-6 border border-border">
            <h3 className="font-semibold mb-4">פרסום מוצר ביתי</h3>
            <form onSubmit={handleCreateHomeProduct} className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <input name="title" placeholder="כותרת *" required className="border border-border rounded-[12px] px-3 py-2 bg-white" />
              <input name="price" type="number" step="0.01" placeholder="מחיר (₪)" className="border border-border rounded-[12px] px-3 py-2 bg-white" />
              <input name="quantity" placeholder="כמות" className="border border-border rounded-[12px] px-3 py-2 bg-white" />
              <input name="neighborhood" placeholder="שכונה" className="border border-border rounded-[12px] px-3 py-2 bg-white" />
              <input name="city" placeholder="עיר" className="border border-border rounded-[12px] px-3 py-2 bg-white" />
              <input name="phone" placeholder="טלפון (ל-WhatsApp)" className="border border-border rounded-[12px] px-3 py-2 bg-white" />
              <textarea name="description" placeholder="תיאור" className="border border-border rounded-[12px] px-3 py-2 md:col-span-2 resize-none h-20 bg-white" />
              <div className="md:col-span-2 flex gap-3">
                <button type="submit" className="bg-primary text-white px-6 py-2 rounded-[16px] hover:bg-primary-light transition">
                  פרסם
                </button>
                <button type="button" onClick={() => setShowHomeForm(false)} className="text-site-text/60">
                  ביטול
                </button>
              </div>
            </form>
          </div>
        )}

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {homeProducts.map((hp) => (
            <HomeProductCard
              key={hp.id}
              product={hp}
              onWhatsAppClick={() => handleWhatsAppClick(hp.id)}
            />
          ))}
        </div>
        {homeProducts.length === 0 && (
          <p className="text-center text-site-text/60 py-8">
            אין עדיין מוצרים ביתיים. {user ? "היה הראשון לפרסם!" : "התחבר כדי לפרסם."}
          </p>
        )}
      </section>
    </div>
  );
}
