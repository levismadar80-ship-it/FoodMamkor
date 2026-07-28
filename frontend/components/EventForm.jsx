"use client";

/**
 * Module:   EventForm
 * Purpose:  Shared create/edit form for producer events. Owns the form state,
 *           image upload, and submit (POST /events on create, PUT /events/{id}
 *           on edit). Extracted from events/new/page.js for MEH-1405 so the new
 *           manage/edit page can reuse the exact fields + validation.
 * Touches:  POST /upload/image (cover), POST|PUT /events.
 * Does NOT: own page chrome (breadcrumb, heading, the pending-approval screen) —
 *           the consuming page renders those and passes onSuccess/onCancel.
 * Related:  app/[locale]/producer/dashboard/events/new/page.js (create wrapper),
 *           events/[id]/edit/page.js (edit wrapper), components/AddressSearch.jsx.
 * History:  MEH-1405 (extraction); MEH-1404 (AddressSearch + lat/lng, moved here).
 */

import { useState } from "react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { X } from "@phosphor-icons/react";
import api from "@/lib/api";
import { detailToMessage, isUnverifiedEmailError } from "@/lib/errors";
import { showToast } from "@/lib/toast";
import CitySearch from "@/components/CitySearch";
import AddressSearch from "@/components/AddressSearch";
import Input from "@/components/ui/Input";
import UnverifiedEmailNotice from "@/components/UnverifiedEmailNotice";
import { EVENT_CATEGORIES as CATEGORY_KEYS } from "@/lib/event-categories";

const DEFAULTS = {
  title: "",
  description: "",
  event_date: "",
  event_time: "",
  location: "",
  lat: null,
  lng: null,
  city: "",
  image_url: "",
  category: "אחר",
  price: 0,
  max_participants: "",
  registration_url: "",
};

function seed(initial) {
  if (!initial) return DEFAULTS;
  return {
    title: initial.title ?? "",
    description: initial.description ?? "",
    event_date: initial.event_date ?? "",
    // EventOut.event_time is "HH:MM:SS"; the <input type=time> wants "HH:MM".
    event_time: initial.event_time ? String(initial.event_time).slice(0, 5) : "",
    location: initial.location ?? "",
    lat: initial.lat ?? null,
    lng: initial.lng ?? null,
    city: initial.city ?? "",
    image_url: initial.image_url ?? "",
    category: initial.category ?? "אחר",
    price: initial.price ?? 0,
    max_participants: initial.max_participants ?? "",
    registration_url: initial.registration_url ?? "",
  };
}

/**
 * @param {"create"|"edit"} mode
 * @param {object|null} initial  event (EventOut) to prefill in edit mode
 * @param {(data:object)=>void} onSuccess  called with the created/updated event
 * @param {string} cancelHref  where the cancel link points
 */
export default function EventForm({ mode = "create", initial = null, onSuccess, cancelHref = "/producer/dashboard" }) {
  const t = useTranslations("sweep_tail.event_new");
  const tCat = useTranslations("events.categories");
  const [form, setForm] = useState(() => seed(initial));
  const [error, setError] = useState("");
  const [unverified, setUnverified] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [uploading, setUploading] = useState(false);

  const isEdit = mode === "edit";
  const update = (field) => (e) => setForm({ ...form, [field]: e.target.value });

  // MEH-988: click-to-upload replaces the raw Cloudinary-URL input.
  const handleImageUpload = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    try {
      const formData = new FormData();
      formData.append("file", file);
      const res = await api.post("/upload/image", formData);
      setForm((f) => ({ ...f, image_url: res.data.url }));
    } catch (err) {
      showToast.error(detailToMessage(err.response?.data?.detail) || t("image_upload_error"));
    } finally {
      setUploading(false);
      e.target.value = "";
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError("");
    setUnverified(false);
    setSubmitting(true);
    try {
      const payload = {
        ...form,
        price: Number(form.price) || 0,
        max_participants: form.max_participants ? Number(form.max_participants) : null,
        event_time: form.event_time || null,
        registration_url: form.registration_url || null,
      };
      const r = isEdit
        ? await api.put(`/events/${initial.id}`, payload)
        : await api.post("/events", payload);
      onSuccess?.(r.data);
    } catch (err) {
      if (isUnverifiedEmailError(err)) {
        setUnverified(true);
      } else {
        setError(detailToMessage(err.response?.data?.detail) || t("error_generic"));
      }
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <>
      {unverified && <UnverifiedEmailNotice className="mb-4" />}
      {error && (
        <div className="bg-red-50 border border-red-200 text-red-700 rounded-[8px] p-3 mb-4 text-sm" role="alert">
          {error}
        </div>
      )}

      <form onSubmit={handleSubmit} className="space-y-5">
        <Input
          id="title"
          type="text"
          label={t("field_title_label")}
          required
          value={form.title}
          onChange={update("title")}
          placeholder={t("field_title_placeholder")}
        />

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
          <Input
            id="event_date"
            type="date"
            label={t("field_date_label")}
            required
            value={form.event_date}
            onChange={update("event_date")}
          />
          <Input
            id="event_time"
            type="time"
            label={t("field_time_label")}
            value={form.event_time}
            onChange={update("event_time")}
          />
        </div>

        <div>
          <label htmlFor="location" className="block text-sm font-medium text-text mb-1">
            {t("field_location_label")}
          </label>
          {/* MEH-1404: AddressSearch fills location text (onChange) + lat/lng
              (onSelect). Free-text still allowed — coords stay null unless a
              suggestion is picked. MEH-1405: the visible <label htmlFor> above is
              the sole label (no `label` prop → no duplicate sr-only association). */}
          <AddressSearch
            id="location"
            value={form.location}
            onChange={(val) => setForm((f) => ({ ...f, location: val }))}
            onSelect={(picked) =>
              setForm((f) => ({
                ...f,
                location: picked.street || picked.displayName || f.location,
                lat: picked.lat ?? null,
                lng: picked.lng ?? null,
              }))
            }
            placeholder={t("field_location_simple_placeholder")}
          />
        </div>

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
            {CATEGORY_KEYS.map((c) => (
              <option key={c.key} value={c.key}>
                {tCat(c.labelKey)}
              </option>
            ))}
          </select>
        </Field>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
          <Input
            id="price"
            type="number"
            min="0"
            label={t("field_price_label_full")}
            value={form.price}
            onChange={update("price")}
          />
          <Input
            id="max_participants"
            type="number"
            min="1"
            label={t("field_max_participants_label_full")}
            value={form.max_participants}
            onChange={update("max_participants")}
            placeholder={t("field_max_participants_hint")}
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-text mb-1">{t("image_label")}</label>
          {form.image_url ? (
            <div className="flex items-center gap-3">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={form.image_url}
                alt=""
                className="w-24 h-24 object-cover rounded-[8px] border border-border"
              />
              <button
                type="button"
                onClick={() => setForm((f) => ({ ...f, image_url: "" }))}
                aria-label={t("image_remove_aria")}
                className="inline-flex items-center gap-1 text-sm text-red-600 hover:underline"
              >
                <X size={14} weight="bold" aria-hidden="true" />
                {t("image_remove")}
              </button>
            </div>
          ) : (
            <label className="flex flex-col items-center justify-center text-center text-sm text-fg-muted border border-dashed border-border rounded-[8px] px-4 py-6 cursor-pointer hover:bg-green-50 transition">
              <input
                type="file"
                accept="image/*"
                className="hidden"
                disabled={uploading}
                onChange={handleImageUpload}
              />
              {uploading ? <span>{t("image_uploading")}</span> : <span>{t("image_upload_hint")}</span>}
            </label>
          )}
        </div>

        <Input
          id="registration_url"
          type="url"
          label={t("field_registration_url_label")}
          value={form.registration_url}
          onChange={update("registration_url")}
          placeholder={t("field_registration_url_placeholder")}
          dir="ltr"
        />

        <div className="flex gap-3 pt-4">
          <button
            type="submit"
            disabled={submitting || uploading}
            className="bg-primary text-white px-6 py-3 rounded-[8px] hover:bg-primary-dark transition font-medium disabled:opacity-60"
          >
            {submitting ? (isEdit ? t("saving") : t("submit_publishing")) : isEdit ? t("save") : t("submit")}
          </button>
          <Link
            href={cancelHref}
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
          border: 1px solid #e5dfd3;
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
    </>
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
