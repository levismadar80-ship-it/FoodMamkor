"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import api from "@/lib/api";
import { useAuth } from "@/lib/auth-context";

const STATUS_LABELS = {
  open: { label: "פתוחה", cls: "bg-blue-50 text-blue-700 border-blue-200" },
  funded: { label: "ממומנת 🎉", cls: "bg-[#EAF3DE] text-primary border-primary/20" },
  cancelled: { label: "בוטלה", cls: "bg-gray-100 text-gray-500 border-gray-200" },
  fulfilled: { label: "הושלמה ✅", cls: "bg-light text-primary border-primary/30" },
};

function NewGroupBuyForm({ producerCity, onCreated }) {
  const [form, setForm] = useState({
    title: "",
    description: "",
    product_name: "",
    unit: "",
    price_per_unit_regular: "",
    price_per_unit_group: "",
    min_participants: "",
    max_participants: "",
    deadline: "",
    city: producerCity || "",
  });
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  const set = (field) => (e) => setForm({ ...form, [field]: e.target.value });

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError("");
    setSubmitting(true);
    try {
      await api.post("/group-buys", {
        ...form,
        price_per_unit_regular: Number(form.price_per_unit_regular),
        price_per_unit_group: Number(form.price_per_unit_group),
        min_participants: Number(form.min_participants),
        max_participants: form.max_participants ? Number(form.max_participants) : undefined,
        deadline: new Date(form.deadline).toISOString(),
      });
      onCreated();
    } catch (err) {
      setError(err.response?.data?.detail || "משהו השתבש, נסי שוב");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4 bg-white rounded-[16px] border border-border p-6">
      <h2 className="font-headline text-lg font-bold text-site-text">קבוצת רכש חדשה</h2>

      <div className="grid sm:grid-cols-2 gap-4">
        <div className="sm:col-span-2">
          <label className="block text-sm font-medium mb-1">כותרת *</label>
          <input
            value={form.title}
            onChange={set("title")}
            required
            className="w-full border border-border rounded-[10px] px-3 py-2 text-right"
            dir="rtl"
          />
        </div>

        <div className="sm:col-span-2">
          <label className="block text-sm font-medium mb-1">תיאור</label>
          <textarea
            value={form.description}
            onChange={set("description")}
            rows={2}
            className="w-full border border-border rounded-[10px] px-3 py-2 text-right resize-none"
            dir="rtl"
          />
        </div>

        <div>
          <label className="block text-sm font-medium mb-1">שם המוצר *</label>
          <input
            value={form.product_name}
            onChange={set("product_name")}
            required
            className="w-full border border-border rounded-[10px] px-3 py-2 text-right"
            dir="rtl"
          />
        </div>
        <div>
          <label className="block text-sm font-medium mb-1">יחידה</label>
          <input
            value={form.unit}
            onChange={set("unit")}
            placeholder='ק"ג, ליטר, יחידה'
            className="w-full border border-border rounded-[10px] px-3 py-2 text-right"
            dir="rtl"
          />
        </div>

        <div>
          <label className="block text-sm font-medium mb-1">מחיר רגיל (₪) *</label>
          <input
            type="number"
            min={1}
            step={0.01}
            value={form.price_per_unit_regular}
            onChange={set("price_per_unit_regular")}
            required
            className="w-full border border-border rounded-[10px] px-3 py-2"
            dir="ltr"
          />
        </div>
        <div>
          <label className="block text-sm font-medium mb-1">מחיר קבוצתי (₪) *</label>
          <input
            type="number"
            min={1}
            step={0.01}
            value={form.price_per_unit_group}
            onChange={set("price_per_unit_group")}
            required
            className="w-full border border-border rounded-[10px] px-3 py-2"
            dir="ltr"
          />
        </div>

        <div>
          <label className="block text-sm font-medium mb-1">מינימום משתתפות *</label>
          <input
            type="number"
            min={2}
            value={form.min_participants}
            onChange={set("min_participants")}
            required
            className="w-full border border-border rounded-[10px] px-3 py-2"
            dir="ltr"
          />
        </div>
        <div>
          <label className="block text-sm font-medium mb-1">מקסימום משתתפות</label>
          <input
            type="number"
            min={2}
            value={form.max_participants}
            onChange={set("max_participants")}
            className="w-full border border-border rounded-[10px] px-3 py-2"
            dir="ltr"
          />
        </div>

        <div>
          <label className="block text-sm font-medium mb-1">מועד אחרון *</label>
          <input
            type="datetime-local"
            value={form.deadline}
            onChange={set("deadline")}
            required
            className="w-full border border-border rounded-[10px] px-3 py-2"
            dir="ltr"
          />
        </div>
        <div>
          <label className="block text-sm font-medium mb-1">עיר</label>
          <input
            value={form.city}
            onChange={set("city")}
            className="w-full border border-border rounded-[10px] px-3 py-2 text-right"
            dir="rtl"
          />
        </div>
      </div>

      {error && <p className="text-red-500 text-sm">{error}</p>}
      <button
        type="submit"
        disabled={submitting}
        className="bg-primary text-white px-6 py-2.5 rounded-[10px] hover:bg-primary-dark transition font-medium disabled:opacity-50"
      >
        {submitting ? "יוצרת..." : "צרי קבוצת רכש"}
      </button>
    </form>
  );
}

export default function ProducerGroupBuysPage() {
  const router = useRouter();
  const { user, loading: authLoading } = useAuth();
  const [items, setItems] = useState(null);
  const [showForm, setShowForm] = useState(false);
  const [producerCity, setProducerCity] = useState("");

  useEffect(() => {
    if (authLoading) return;
    if (!user || user.role !== "producer") {
      router.push("/login");
      return;
    }
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user, authLoading]);

  const load = async () => {
    try {
      const [gbRes, dashRes] = await Promise.all([
        api.get("/group-buys", { params: { status: "open" } }),
        api.get("/producers/me/dashboard"),
      ]);
      // Filter to only this producer's group buys
      const producerId = dashRes.data?.producer?.id;
      setProducerCity(dashRes.data?.producer?.city || "");
      const mine = gbRes.data.filter((gb) => gb.producer_id === producerId);
      // Also fetch funded/cancelled
      const [fundedRes, cancelledRes, fulfilledRes] = await Promise.all([
        api.get("/group-buys", { params: { status: "funded" } }),
        api.get("/group-buys", { params: { status: "cancelled" } }),
        api.get("/group-buys", { params: { status: "fulfilled" } }),
      ]);
      const allMine = [
        ...mine,
        ...fundedRes.data.filter((gb) => gb.producer_id === producerId),
        ...cancelledRes.data.filter((gb) => gb.producer_id === producerId),
        ...fulfilledRes.data.filter((gb) => gb.producer_id === producerId),
      ];
      allMine.sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
      setItems(allMine);
    } catch {
      setItems([]);
    }
  };

  if (authLoading || !user) return null;

  return (
    <div className="max-w-3xl mx-auto px-4 py-10">
      <div className="flex items-center justify-between mb-6">
        <div>
          <Link href="/producer/dashboard" className="text-sm text-primary hover:underline">
            ← לוח הבקרה
          </Link>
          <h1 className="font-headline text-2xl font-bold text-site-text mt-1">
            קבוצות הרכש שלי
          </h1>
        </div>
        <button
          onClick={() => setShowForm((v) => !v)}
          className="bg-primary text-white px-4 py-2 rounded-[10px] text-sm font-medium hover:bg-primary-dark transition"
        >
          {showForm ? "סגרי" : "+ קבוצת רכש חדשה"}
        </button>
      </div>

      {showForm && (
        <div className="mb-8">
          <NewGroupBuyForm
            producerCity={producerCity}
            onCreated={() => {
              setShowForm(false);
              load();
            }}
          />
        </div>
      )}

      {items === null ? (
        <div className="text-center py-16 text-site-muted">טוענת...</div>
      ) : items.length === 0 ? (
        <div className="text-center py-16 text-site-muted">
          <p className="text-4xl mb-3">🛒</p>
          <p>עדיין אין קבוצות רכש</p>
          <p className="text-sm mt-1">לחצי על &ldquo;+ קבוצת רכש חדשה&rdquo; כדי להתחיל</p>
        </div>
      ) : (
        <div className="space-y-4">
          {items.map((gb) => {
            const s = STATUS_LABELS[gb.status] || { label: gb.status, cls: "bg-gray-100 text-gray-600 border-gray-200" };
            const pct = Math.min(100, Math.round((gb.commits_count / gb.min_participants) * 100));
            return (
              <div key={gb.id} className="bg-white rounded-[14px] border border-border p-5">
                <div className="flex items-start justify-between gap-3 mb-3">
                  <div>
                    <h2 className="font-semibold text-site-text">{gb.title}</h2>
                    <p className="text-xs text-site-muted mt-0.5">{gb.product_name}</p>
                  </div>
                  <span className={`text-xs border px-2 py-0.5 rounded-full whitespace-nowrap ${s.cls}`}>
                    {s.label}
                  </span>
                </div>

                <div className="flex items-center gap-4 text-sm mb-3">
                  <span className="font-bold text-primary">₪{Number(gb.price_per_unit_group).toFixed(0)}</span>
                  <span className="text-site-muted line-through">₪{Number(gb.price_per_unit_regular).toFixed(0)}</span>
                </div>

                <div className="mb-2">
                  <div className="flex justify-between text-xs text-site-muted mb-1">
                    <span>{gb.commits_count} / {gb.min_participants} משתתפות</span>
                    <span>{pct}%</span>
                  </div>
                  <div className="w-full bg-border rounded-full h-2 overflow-hidden">
                    <div
                      className={`h-2 rounded-full ${gb.status === "funded" || gb.status === "fulfilled" ? "bg-primary" : "bg-primary/40"}`}
                      style={{ width: `${pct}%` }}
                    />
                  </div>
                </div>

                <div className="flex items-center justify-between text-xs text-site-muted">
                  <span>
                    מועד אחרון: {new Date(gb.deadline).toLocaleDateString("he-IL")}
                  </span>
                  <Link
                    href={`/group-buys/${gb.id}`}
                    className="text-primary hover:underline"
                  >
                    צפי בדף הציבורי ←
                  </Link>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
