"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import api from "@/lib/api";
import { useAuth } from "@/lib/auth-context";
import ProducerCard from "@/components/ProducerCard";
import HomeProductCard from "@/components/HomeProductCard";

export default function HomePage() {
  const { user } = useAuth();
  const [producers, setProducers] = useState([]);
  const [homeProducts, setHomeProducts] = useState([]);
  const [categories, setCategories] = useState([]);
  const [filters, setFilters] = useState({ category: "", delivery_city: "" });
  const [showHomeForm, setShowHomeForm] = useState(false);

  useEffect(() => {
    api.get("/categories").then((r) => setCategories(r.data));
    loadProducers();
    api.get("/home-products").then((r) => setHomeProducts(r.data));
  }, []);

  const loadProducers = (params = {}) => {
    api.get("/producers", { params }).then((r) => setProducers(r.data));
  };

  const handleFilter = () => {
    const params = {};
    if (filters.category) params.category = filters.category;
    if (filters.delivery_city) params.delivery_city = filters.delivery_city;
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
      alert("שגיאה ביצירת המוצר");
    }
  };

  return (
    <div>
      {/* Hero Section */}
      <section className="bg-primary text-white py-16 md:py-24">
        <div className="max-w-4xl mx-auto px-4 text-center">
          <h1 className="text-4xl md:text-5xl font-bold mb-4">
            אוכל אמיתי, ישר מהמקור אליך
          </h1>
          <p className="text-lg text-white/80 mb-8">
            גלו יצרנים מקומיים, אורגניים ובריאים באזור שלכם
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
            <button
              onClick={handleFilter}
              className="bg-accent text-white px-6 py-2 rounded-[12px] hover:bg-accent-light transition font-medium"
            >
              חפש
            </button>
          </div>
        </div>
      </section>

      {/* Producers Grid */}
      <section className="max-w-7xl mx-auto px-4 py-12">
        <div className="flex items-center justify-between mb-8">
          <h2 className="text-2xl font-bold">יצרנים מומלצים</h2>
          <Link href="/map" className="text-primary hover:underline flex items-center gap-1">
            הצג במפה 🗺️
          </Link>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {producers.map((p) => (
            <ProducerCard key={p.id} producer={p} />
          ))}
        </div>
        {producers.length === 0 && (
          <p className="text-center text-text-secondary py-12">לא נמצאו יצרנים. נסו לשנות את הסינון.</p>
        )}
      </section>

      {/* מהמטבח של השכן */}
      <section className="max-w-7xl mx-auto px-4 py-12 border-t border-gray-200">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-2xl font-bold">🏠 מהמטבח של השכן</h2>
          {user && (
            <button
              onClick={() => setShowHomeForm(!showHomeForm)}
              className="bg-accent text-white px-4 py-2 rounded-[12px] hover:bg-accent-light transition text-sm"
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
          <p className="text-center text-text-secondary py-8">
            אין עדיין מוצרים ביתיים. {user ? "היה הראשון לפרסם!" : "התחבר כדי לפרסם."}
          </p>
        )}
      </section>
    </div>
  );
}
