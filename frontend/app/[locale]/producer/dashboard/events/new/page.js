"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { useTranslations } from "next-intl";
import api from "@/lib/api";
import { useAuth } from "@/lib/auth-context";
import CitySearch from "@/components/CitySearch";

// API filter values are Hebrew strings (server-side enum). Keep keys
// as the wire format; localize labels via t() at render time.
const CATEGORIES = ["סדנה", "סיור", "שוק", "קטיף", "טעימות", "אחר"];

export default function NewEventPage() {
  const router = useRouter();
  const t = useTranslations("sweep_tail.event_new");
  const { user, loading: authLoading } = useAuth();
  const [form, setForm] = useState({
    title: "",
    description: "",
    event_date: "",
    event_time: "",
    location: "",
    city: "",
    image_url: "",
    category: "סדנה",
    price: 0,
    max_participants: "",
    registration_url: "",
  });
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  if (!authLoading && (!user || user.role !== "producer")) {
    if (typeof window !== "undefined") router.push("/login");
    return null;
  }

  const update = (field) => (e) => setForm({ ...form, [field]: e.target.value });

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError("");
    setSubmitting(true);
    try {
      const payload = {
        ...form,
        price: Number(form.price) || 0,
        max_participants: form.max_participants ? Number(form.max_participants) : null,
        event_time: form.event_time || null,
        registration_url: form.registration_url || null,
      };
      const r = await api.post("/events", payload);
      router.push(`/events/${r.data.id}`);
    } catch (err) {
      setError(err.response?.data?.detail || t("error_generic"));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="max-w-2xl mx-auto px-4 py-12">
      <nav className="text-sm text-fg-muted mb-4">
        <Link href="/producer/dashboard" className="hover:text-primary">{t("crumb_dashboard")}</Link>
        <span className="mx-2">›</span>
        <span className="text-text">{t("crumb_current")}</span>
      </nav>

      <h1 className="font-headline text-4xl font-bold text-text mb-2">{t("heading")}</h1>
      <p className="text-fg-muted mb-8">{t("subtitle")}</p>

      {error && (
        <div className="bg-red-50 border border-red-200 text-red-700 rounded-[8px] p-3 mb-4 text-sm" role="alert">
          {error}
        </div>
      )}

      <p className="text-sm text-fg-muted bg-green-50 rounded-[10px] px-4 py-3 mb-6 leading-relaxed">
        {t("info_paragraph")}
      </p>

      <form onSubmit={handleSubmit} className="space-y-5">
        <Field id="title" label={t("field_title_label")} required>
          <input
            id="title"
            type="text"
            required
            value={form.title}
            onChange={update("title")}
            className="input-base"
            placeholder={t("field_title_placeholder")}
          />
        </Field>

        <Field id="description" label={t("field_description_label")}>
          <textarea
            id="description"
            rows={4}
            value={form.description}
            onChange={update("description")}
            className="input-base resize-none"
            placeholder={t("field_description_full_placeholder")}
          />
        </Field>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
          <Field id="event_date" label={t("field_date_label")} required>
            <input
              id="event_date"
              type="date"
              required
              value={form.event_date}
              onChange={update("event_date")}
              className="input-base"
            />
          </Field>
          <Field id="event_time" label={t("field_time_label")}>
            <input
              id="event_time"
              type="time"
              value={form.event_time}
              onChange={update("event_time")}
              className="input-base"
            />
          </Field>
        </div>

        <Field id="location" label={t("field_location_label")}>
          <input
            id="location"
            type="text"
            value={form.location}
            onChange={update("location")}
            className="input-base"
            placeholder={t("field_location_simple_placeholder")}
          />
        </Field>

        <div>
          <label htmlFor="city" className="block text-sm font-medium text-text mb-1">{t("field_city_label")}</label>
          <CitySearch
            id="city"
            label={t("field_city_label")}
            value={form.city}
            onChange={(val) => setForm({ ...form, city: val })}
            placeholder={t("field_city_placeholder")}
          />
        </div>

        <Field id="category" label={t("field_category_label")} required>
          <select
            id="category"
            value={form.category}
            onChange={update("category")}
            className="input-base"
            required
          >
            {CATEGORIES.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
        </Field>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
          <Field id="price" label={t("field_price_label_full")}>
            <input
              id="price"
              type="number"
              min="0"
              value={form.price}
              onChange={update("price")}
              className="input-base"
            />
          </Field>
          <Field id="max_participants" label={t("field_max_participants_label_full")}>
            <input
              id="max_participants"
              type="number"
              min="1"
              value={form.max_participants}
              onChange={update("max_participants")}
              className="input-base"
              placeholder={t("field_max_participants_hint")}
            />
          </Field>
        </div>

        <Field id="image_url" label={t("field_image_label")}>
          <input
            id="image_url"
            type="url"
            value={form.image_url}
            onChange={update("image_url")}
            className="input-base"
            placeholder={t("field_image_placeholder")}
            dir="ltr"
          />
        </Field>

        <Field id="registration_url" label={t("field_registration_url_label")}>
          <input
            id="registration_url"
            type="url"
            value={form.registration_url}
            onChange={update("registration_url")}
            className="input-base"
            placeholder={t("field_registration_url_placeholder")}
            dir="ltr"
          />
        </Field>

        <div className="flex gap-3 pt-4">
          <button
            type="submit"
            disabled={submitting}
            className="bg-primary text-white px-6 py-3 rounded-[8px] hover:bg-primary-dark transition font-medium disabled:opacity-60"
          >
            {submitting ? t("submit_publishing") : t("submit")}
          </button>
          <Link
            href="/producer/dashboard"
            className="border border-border text-text px-6 py-3 rounded-[8px] hover:bg-green-50 transition"
          >
            {t("cancel")}
          </Link>
        </div>
      </form>

      <style jsx>{`
        .input-base {
          width: 100%;
          background: white;
          border: 1px solid #e8e0d0;
          border-radius: 8px;
          padding: 12px 16px;
          outline: none;
          transition: border-color 0.2s;
        }
        .input-base:focus {
          border-color: #2e6853;
          box-shadow: 0 0 0 3px rgba(46, 104, 83, 0.15);
        }
      `}</style>
    </div>
  );
}

function Field({ id, label, required, children }) {
  return (
    <div>
      <label htmlFor={id} className="block text-sm font-medium text-text mb-1">
        {label} {required && <span className="text-red-500">*</span>}
      </label>
      {children}
    </div>
  );
}
