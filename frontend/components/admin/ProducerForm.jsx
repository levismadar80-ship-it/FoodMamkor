"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Cow, Leaf, Seal } from "@phosphor-icons/react";
import api from "@/lib/api";

const KOSHER_OPTIONS = ["", "כשר", "כשר למהדרין", "לא כשר"];

const EMPTY = {
  name: "",
  contact_name: "",
  phone: "",
  instagram: "",
  website: "",
  whatsapp_group: "",
  // MEH-17
  primary_contact_method: "whatsapp",
  contact_email: "",
  city: "",
  lat: "",
  lng: "",
  slug: "",
  description: "",
  short_description: "",
  top_product_name: "",
  price_range: "",
  category_ids: [],
  has_delivery: false,
  pickup_points: false,
  delivery_area_cities: "",
  kosher: "",
  grass_fed: false,
  organic_certified: false,
  is_verified: true,
  // MEH-18
  is_recommended: false,
  admin_notes: "",
  images: [],
};

export default function ProducerForm({ initial = null, producerId = null }) {
  const router = useRouter();
  const [form, setForm] = useState(EMPTY);
  const [categories, setCategories] = useState([]);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    api.get("/categories").then((r) => setCategories(r.data));
  }, []);

  useEffect(() => {
    if (initial) {
      setForm({
        ...EMPTY,
        ...initial,
        lat: initial.lat ?? "",
        lng: initial.lng ?? "",
        slug: initial.slug ?? "",
        category_ids: initial.categories?.map((c) => c.id) ?? [],
        delivery_area_cities:
          initial.delivery_areas?.map((d) => d.city).join(", ") ?? "",
        images: initial.images ?? [],
        kosher: initial.kosher ?? "",
        contact_name: initial.contact_name ?? "",
        whatsapp_group: initial.whatsapp_group ?? "",
        // MEH-17
        primary_contact_method: initial.primary_contact_method ?? "whatsapp",
        contact_email: initial.contact_email ?? "",
        short_description: initial.short_description ?? "",
        top_product_name: initial.top_product_name ?? "",
        price_range: initial.price_range ?? initial.starting_price_label ?? "",
        admin_notes: initial.admin_notes ?? "",
      });
    }
  }, [initial]);

  const update = (k, v) => setForm((f) => ({ ...f, [k]: v }));

  const toggleCategory = (id) => {
    setForm((f) => {
      const exists = f.category_ids.includes(id);
      return {
        ...f,
        category_ids: exists
          ? f.category_ids.filter((x) => x !== id)
          : [...f.category_ids, id],
      };
    });
  };

  const handleImageUpload = async (e) => {
    const files = Array.from(e.target.files || []);
    if (!files.length) return;
    setUploading(true);
    try {
      const uploaded = [];
      for (const file of files) {
        const fd = new FormData();
        fd.append("file", file);
        const r = await api.post("/upload/image", fd, {
          headers: { "Content-Type": "multipart/form-data" },
        });
        uploaded.push(r.data.url);
      }
      setForm((f) => ({ ...f, images: [...(f.images || []), ...uploaded] }));
    } catch (err) {
      setError(err.response?.data?.detail || "שגיאה בהעלאת תמונה");
    } finally {
      setUploading(false);
    }
  };

  const removeImage = (url) => {
    setForm((f) => ({ ...f, images: f.images.filter((u) => u !== url) }));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError("");
    setSaving(true);

    const payload = {
      ...form,
      lat: form.lat === "" ? null : parseFloat(form.lat),
      lng: form.lng === "" ? null : parseFloat(form.lng),
      // MEH-17 — Pydantic's EmailStr rejects empty strings; null is fine.
      contact_email: form.contact_email?.trim() || null,
      delivery_area_cities: form.delivery_area_cities
        .split(",")
        .map((c) => c.trim())
        .filter(Boolean),
    };

    try {
      if (producerId) {
        await api.put(`/admin/producers/${producerId}`, payload);
      } else {
        await api.post("/admin/producers", payload);
      }
      router.push("/admin?tab=producers");
    } catch (err) {
      setError(err.response?.data?.detail || "שגיאה בשמירה");
    } finally {
      setSaving(false);
    }
  };

  const Section = ({ title, children }) => (
    <div className="bg-white rounded-[12px] border border-border p-6">
      <h2 className="font-semibold text-lg mb-4 text-primary">{title}</h2>
      {children}
    </div>
  );

  const Field = ({ label, children, full = false }) => (
    <label className={`block ${full ? "md:col-span-2" : ""}`}>
      <span className="block text-sm text-text-secondary mb-1">{label}</span>
      {children}
    </label>
  );

  const inputClass =
    "w-full border border-border rounded-[12px] px-3 py-2 focus:outline-none focus:border-primary bg-white";

  return (
    <form onSubmit={handleSubmit} className="space-y-6 max-w-4xl">
      {error && (
        <div className="bg-red-50 border border-red-200 text-red-700 rounded-[12px] p-3 text-sm">
          {error}
        </div>
      )}

      <Section title="פרטי בסיס">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <Field label="שם העסק *">
            <input
              required
              value={form.name}
              onChange={(e) => update("name", e.target.value)}
              className={inputClass}
            />
          </Field>
          <Field label="איש קשר">
            <input
              value={form.contact_name}
              onChange={(e) => update("contact_name", e.target.value)}
              className={inputClass}
            />
          </Field>
          <Field label="טלפון / ווטסאפ">
            <input
              value={form.phone}
              onChange={(e) => update("phone", e.target.value)}
              className={inputClass}
              placeholder="050-1234567"
            />
          </Field>
          <Field label="אינסטגרם">
            <input
              value={form.instagram}
              onChange={(e) => update("instagram", e.target.value)}
              className={inputClass}
              placeholder="@username"
            />
          </Field>
          <Field label="אתר">
            <input
              value={form.website}
              onChange={(e) => update("website", e.target.value)}
              className={inputClass}
              placeholder="https://..."
            />
          </Field>
          <Field label="קישור לקבוצת ווטסאפ">
            <input
              value={form.whatsapp_group}
              onChange={(e) => update("whatsapp_group", e.target.value)}
              className={inputClass}
              placeholder="https://chat.whatsapp.com/..."
            />
          </Field>
          {/* MEH-17 — primary contact method + business email. */}
          <Field label="אמצעי קשר ראשי">
            <select
              value={form.primary_contact_method}
              onChange={(e) => update("primary_contact_method", e.target.value)}
              className={inputClass}
            >
              <option value="whatsapp">WhatsApp</option>
              <option value="phone">טלפון</option>
              <option value="website">אתר</option>
              <option value="email">אימייל</option>
            </select>
          </Field>
          <Field label="אימייל ליצירת קשר">
            <input
              type="email"
              value={form.contact_email}
              onChange={(e) => update("contact_email", e.target.value)}
              className={inputClass}
              placeholder="business@example.com"
              dir="ltr"
            />
          </Field>
          <Field label="עיר / אזור">
            <input
              value={form.city}
              onChange={(e) => update("city", e.target.value)}
              className={inputClass}
            />
          </Field>
          <Field label="Slug (URL)">
            <input
              value={form.slug}
              onChange={(e) => update("slug", e.target.value)}
              className={inputClass}
              placeholder="auto-generated"
            />
          </Field>
          <Field label="Latitude">
            <input
              type="number"
              step="any"
              value={form.lat}
              onChange={(e) => update("lat", e.target.value)}
              className={inputClass}
            />
          </Field>
          <Field label="Longitude">
            <input
              type="number"
              step="any"
              value={form.lng}
              onChange={(e) => update("lng", e.target.value)}
              className={inputClass}
            />
          </Field>
        </div>
      </Section>

      <Section title="קטגוריות ותגיות">
        <div className="grid grid-cols-2 md:grid-cols-3 gap-2 mb-4">
          {categories.map((c) => (
            <label
              key={c.id}
              className="flex items-center gap-2 text-sm cursor-pointer"
            >
              <input
                type="checkbox"
                checked={form.category_ids.includes(c.id)}
                onChange={() => toggleCategory(c.id)}
                className="w-4 h-4 accent-primary"
              />
              <span>
                {c.emoji} {c.name}
              </span>
            </label>
          ))}
        </div>
        <div className="grid grid-cols-2 md:grid-cols-3 gap-3 pt-4 border-t border-border">
          <label className="flex items-center gap-2 text-sm cursor-pointer">
            <input
              type="checkbox"
              checked={form.organic_certified}
              onChange={(e) => update("organic_certified", e.target.checked)}
              className="w-4 h-4 accent-primary"
            />
            <Leaf size={16} weight="duotone" className="inline align-[-2px] text-primary" aria-hidden="true" /> אורגני מוסמך
          </label>
          <label className="flex items-center gap-2 text-sm cursor-pointer">
            <input
              type="checkbox"
              checked={form.grass_fed}
              onChange={(e) => update("grass_fed", e.target.checked)}
              className="w-4 h-4 accent-primary"
            />
            <Cow size={16} weight="duotone" className="inline align-[-2px] text-primary" aria-hidden="true" /> גראס פד
          </label>
          <label className="flex items-center gap-2 text-sm cursor-pointer">
            <input
              type="checkbox"
              checked={form.is_verified}
              onChange={(e) => update("is_verified", e.target.checked)}
              className="w-4 h-4 accent-primary"
            />
            <Seal size={16} weight="fill" className="inline align-[-2px] text-primary" aria-hidden="true" /> מאומת
          </label>
          <label className="flex items-center gap-2 text-sm cursor-pointer">
            <input
              type="checkbox"
              checked={!!form.is_recommended}
              onChange={(e) => update("is_recommended", e.target.checked)}
              className="w-4 h-4 accent-accent"
            />
            ⭐ מומלץ (תגית עורכת)
          </label>
          <Field label="כשרות">
            <select
              value={form.kosher}
              onChange={(e) => update("kosher", e.target.value)}
              className={inputClass}
            >
              {KOSHER_OPTIONS.map((k) => (
                <option key={k} value={k}>
                  {k || "—"}
                </option>
              ))}
            </select>
          </Field>
        </div>
      </Section>

      <Section title="משלוחים ואיסוף">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <label className="flex items-center gap-2 text-sm cursor-pointer">
            <input
              type="checkbox"
              checked={form.has_delivery}
              onChange={(e) => update("has_delivery", e.target.checked)}
              className="w-4 h-4 accent-primary"
            />
            🚚 יש משלוחים
          </label>
          <label className="flex items-center gap-2 text-sm cursor-pointer">
            <input
              type="checkbox"
              checked={form.pickup_points}
              onChange={(e) => update("pickup_points", e.target.checked)}
              className="w-4 h-4 accent-primary"
            />
            📦 נקודות איסוף ברחבי הארץ
          </label>
          <Field label="ערי משלוח (מופרדות בפסיק)" full>
            <input
              value={form.delivery_area_cities}
              onChange={(e) => update("delivery_area_cities", e.target.value)}
              className={inputClass}
              placeholder="תל אביב, חיפה, ירושלים"
            />
          </Field>
        </div>
      </Section>

      <Section title="תיאור ומחיר">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <Field label="תיאור קצר (לכרטיסייה)" full>
            <input
              value={form.short_description}
              onChange={(e) => update("short_description", e.target.value)}
              className={inputClass}
            />
          </Field>
          <Field label="תיאור מלא" full>
            <textarea
              value={form.description}
              onChange={(e) => update("description", e.target.value)}
              className={`${inputClass} h-28 resize-none`}
            />
          </Field>
          <Field label="מוצר עיקרי">
            <input
              value={form.top_product_name}
              onChange={(e) => update("top_product_name", e.target.value)}
              className={inputClass}
              placeholder="בשר בקר grass-fed"
            />
          </Field>
          <Field label="מחיר התחלתי">
            <input
              value={form.price_range}
              onChange={(e) => update("price_range", e.target.value)}
              className={inputClass}
              placeholder="מ-₪65/ק״ג"
            />
          </Field>
        </div>
      </Section>

      <Section title="תמונות">
        <input
          type="file"
          accept="image/*"
          multiple
          onChange={handleImageUpload}
          disabled={uploading}
          className="text-sm"
        />
        {uploading && <p className="text-sm text-text-secondary mt-2">מעלה...</p>}
        {form.images?.length > 0 && (
          <div className="grid grid-cols-3 md:grid-cols-5 gap-3 mt-4">
            {form.images.map((url) => (
              <div key={url} className="relative group">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={url}
                  alt=""
                  className="w-full h-24 object-cover rounded-[8px] border border-border"
                />
                <button
                  type="button"
                  onClick={() => removeImage(url)}
                  className="absolute top-1 right-1 bg-red-500 text-white rounded-full w-6 h-6 text-xs opacity-0 group-hover:opacity-100 transition"
                >
                  ✕
                </button>
              </div>
            ))}
          </div>
        )}
      </Section>

      <Section title="הערות פנימיות (לא גלוי למשתמשים)">
        <textarea
          value={form.admin_notes}
          onChange={(e) => update("admin_notes", e.target.value)}
          className={`${inputClass} h-20 resize-none`}
        />
      </Section>

      <div className="flex gap-3">
        <button
          type="submit"
          disabled={saving}
          className="bg-primary text-white px-8 py-3 rounded-[12px] hover:bg-primary-light transition font-medium disabled:opacity-50"
        >
          {saving ? "שומר..." : producerId ? "שמור שינויים" : "צור עסק"}
        </button>
        <button
          type="button"
          onClick={() => router.push("/admin?tab=producers")}
          className="bg-white border border-border px-8 py-3 rounded-[12px] hover:bg-background transition"
        >
          ביטול
        </button>
      </div>
    </form>
  );
}
