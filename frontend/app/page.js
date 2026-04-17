"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import api from "@/lib/api";
import { useAuth } from "@/lib/auth-context";
import { useToast } from "@/components/ui/Toast";
import EmptyState from "@/components/ui/EmptyState";
import ProducerCard from "@/components/ProducerCard";
import HomeProductCard from "@/components/HomeProductCard";

const PAGE_SIZE = 8;

export default function HomePage() {
  const { user } = useAuth();
  const toast = useToast();
  const [producers, setProducers] = useState([]);
  const [homeProducts, setHomeProducts] = useState([]);
  const [categories, setCategories] = useState([]);
  const [filters, setFilters] = useState({ category: "", delivery_city: "", has_delivery: false });
  const [showHomeForm, setShowHomeForm] = useState(false);
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE);

  useEffect(() => {
    api.get("/categories").then((r) => setCategories(r.data));
    loadProducers();
    api.get("/home-products").then((r) => setHomeProducts(r.data));
  }, []);

  const loadProducers = (params = {}) => {
    api.get("/producers", { params }).then((r) => {
      setProducers(r.data);
      setVisibleCount(PAGE_SIZE);
    });
  };

  const handleFilter = () => {
    const params = {};
    if (filters.category) params.category = filters.category;
    if (filters.delivery_city) params.delivery_city = filters.delivery_city;
    if (filters.has_delivery) params.has_delivery = true;
    loadProducers(params);
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
      toast("שגיאה ביצירת המוצר", "error");
    }
  };

  const visibleProducers = producers.slice(0, visibleCount);
  const hasMore = visibleCount < producers.length;

  return (
    <div>
      {/* Hero Section */}
      <section className="bg-primary text-white py-16 md:py-24">
        <div className="max-w-4xl mx-auto px-4 text-center">
          <h1 className="text-4xl md:text-5xl font-bold mb-4">
            אוכל אמיתי, ישר מהמקור אליך
          </h1>
          <p className="text-lg text-white/80 mb-8">
            גלו בתי עסק מקומיים, אורגניים ובריאים באזור שלכם
          </p>

          {/* Filters */}
          <div className="bg-white rounded-[12px] p-4 flex flex-col md:flex-row gap-3 max-w-2xl mx-auto">
            <select
              value={filters.category}
              onChange={(e) => setFilters({ ...filters, category: e.target.value })}
              className="flex-1 border rounded-[12px] px-3 py-2 text-text-primary"
            >
              <option value="">כל הקטגוריות</option>
              {categories.map((cat) => (
                <option key={cat.id} value={cat.id}>
                  {cat.emoji} {cat.name}
                </option>
              ))}
            </select>
            <input
              type="text"
              placeholder="עיר משלוח..."
              value={filters.delivery_city}
              onChange={(e) => setFilters({ ...filters, delivery_city: e.target.value })}
              className="flex-1 border rounded-[12px] px-3 py-2 text-text-primary"
            />
            <label className="flex items-center gap-2 text-text-primary text-sm whitespace-nowrap cursor-pointer">
              <input
                type="checkbox"
                checked={filters.has_delivery}
                onChange={(e) => setFilters({ ...filters, has_delivery: e.target.checked })}
                className="w-4 h-4 accent-primary"
              />
              יש משלוחים
            </label>
            <button
              onClick={handleFilter}
              className="bg-secondary text-white px-6 py-2 rounded-[12px] hover:bg-secondary-light transition font-medium"
            >
              חפש
            </button>
          </div>
        </div>
      </section>

      {/* How It Works */}
      <section className="max-w-7xl mx-auto px-4 pt-12 pb-4">
        <h2 className="text-2xl font-bold text-center mb-8">איך זה עובד?</h2>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {[
            { icon: "🔍", title: "מצא", text: "חפשו בתי עסק קרובים אליכם דרך המפה או הסינון" },
            { icon: "📞", title: "צור קשר", text: "דברו ישירות עם בית העסק בווטסאפ או בטלפון" },
            { icon: "🛒", title: "קנה", text: "קבלו אוכל אמיתי, טרי, ישר מהמקור — בלי מתווכים" },
          ].map((step, i) => (
            <div
              key={i}
              className="bg-white rounded-[12px] p-6 text-center border border-border"
            >
              <div className="text-4xl mb-3" aria-hidden>{step.icon}</div>
              <h3 className="font-bold text-lg mb-2 text-primary">{step.title}</h3>
              <p className="text-text-secondary text-sm leading-relaxed">{step.text}</p>
            </div>
          ))}
        </div>
      </section>

      {/* Horizontal Category Scroll */}
      {categories.length > 0 && (
        <section className="max-w-7xl mx-auto px-4 pt-8 pb-2">
          <div className="flex gap-3 overflow-x-auto pb-2 scrollbar-hide" style={{ scrollbarWidth: "none", msOverflowStyle: "none", WebkitOverflowScrolling: "touch" }}>
            <button
              onClick={() => { setFilters({ ...filters, category: "" }); handleFilter(); }}
              className={`shrink-0 px-4 py-2 rounded-full text-sm font-medium transition ${
                !filters.category ? "bg-primary text-white" : "bg-white text-text-secondary hover:bg-accent"
              }`}
            >
              הכל
            </button>
            {categories.map((cat) => (
              <button
                key={cat.id}
                onClick={() => {
                  const newCat = filters.category === String(cat.id) ? "" : String(cat.id);
                  setFilters({ ...filters, category: newCat });
                  const params = {};
                  if (newCat) params.category = newCat;
                  if (filters.delivery_city) params.delivery_city = filters.delivery_city;
                  if (filters.has_delivery) params.has_delivery = true;
                  loadProducers(params);
                }}
                className={`shrink-0 px-4 py-2 rounded-full text-sm font-medium transition ${
                  filters.category === String(cat.id) ? "bg-primary text-white" : "bg-white text-text-secondary hover:bg-accent"
                }`}
              >
                {cat.emoji} {cat.name}
              </button>
            ))}
          </div>
        </section>
      )}

      {/* Producers Grid */}
      <section className="max-w-7xl mx-auto px-4 py-12">
        <div className="flex items-center justify-between mb-8">
          <h2 className="text-2xl font-bold">בתי עסק מומלצים</h2>
          <Link href="/map" className="text-primary hover:underline flex items-center gap-1">
            הצג במפה 🗺️
          </Link>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
          {visibleProducers.map((p) => (
            <ProducerCard key={p.id} producer={p} />
          ))}
        </div>
        {producers.length === 0 && (
          <EmptyState
            emoji="🌱"
            title="לא מצאנו בתי עסק"
            description="נסו לשנות את הסינון או לחפש באזור אחר"
            ctaLabel="הצג את כולם"
            ctaOnClick={() => loadProducers()}
          />
        )}
        {hasMore && (
          <div className="text-center mt-8">
            <button
              onClick={() => setVisibleCount((c) => c + PAGE_SIZE)}
              className="bg-white text-primary border-2 border-primary px-8 py-3 rounded-[12px] hover:bg-accent transition font-medium"
            >
              הצג עוד
            </button>
          </div>
        )}
      </section>

      {/* מהמטבח של השכן */}
      <section className="max-w-7xl mx-auto px-4 py-12 border-t border-gray-200">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-2xl font-bold">🏠 מהמטבח של השכן</h2>
          {user && (
            <button
              onClick={() => setShowHomeForm(!showHomeForm)}
              className="bg-secondary text-white px-4 py-2 rounded-[12px] hover:bg-secondary-light transition text-sm"
            >
              פרסם מוצר ביתי
            </button>
          )}
        </div>

        <div className="bg-yellow-50 border border-yellow-200 rounded-[12px] p-3 mb-6 text-sm text-yellow-800">
          ⚠️ האחריות על המוצר היא של המוכר בלבד. מהמקור אינה מאמתת מוצרים בסקציה זו.
        </div>

        {/* Create form */}
        {showHomeForm && (
          <div className="bg-white rounded-[12px] p-6 mb-6 border">
            <h3 className="font-semibold mb-4">פרסום מוצר ביתי</h3>
            <form onSubmit={handleCreateHomeProduct} className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <input name="title" placeholder="כותרת *" required className="border rounded-[12px] px-3 py-2" />
              <input name="price" type="number" step="0.01" placeholder="מחיר (₪)" className="border rounded-[12px] px-3 py-2" />
              <input name="quantity" placeholder="כמות" className="border rounded-[12px] px-3 py-2" />
              <input name="neighborhood" placeholder="שכונה" className="border rounded-[12px] px-3 py-2" />
              <input name="city" placeholder="עיר" className="border rounded-[12px] px-3 py-2" />
              <input name="phone" placeholder="טלפון (ל-WhatsApp)" className="border rounded-[12px] px-3 py-2" />
              <textarea name="description" placeholder="תיאור" className="border rounded-[12px] px-3 py-2 md:col-span-2 resize-none h-20" />
              <div className="md:col-span-2 flex gap-3">
                <button type="submit" className="bg-primary text-white px-6 py-2 rounded-[12px] hover:bg-primary-light transition">
                  פרסם
                </button>
                <button type="button" onClick={() => setShowHomeForm(false)} className="text-text-secondary">
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
          <EmptyState
            emoji="🏠"
            title="אין עדיין מוצרים ביתיים"
            description={user ? "היה הראשון לפרסם מוצר מהמטבח שלך" : "התחבר כדי לפרסם מוצר ביתי"}
            ctaLabel={user ? "פרסם מוצר ביתי" : "התחבר"}
            ctaHref={user ? undefined : "/login"}
            ctaOnClick={user ? () => setShowHomeForm(true) : undefined}
          />
        )}
      </section>
    </div>
  );
}
