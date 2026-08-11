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
 * History:  MEH-1405 (extraction); MEH-1404 (AddressSearch + lat/lng, moved here);
 *           MEH-1809 (client-side required/range validation, inline per field
 *           via ui/Input + focus to the first invalid one — the top banner now
 *           carries server/network errors only).
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
  // MEH-2013: "קטגוריה *" is marked required and the server enforces it
  // (schemas.py EventCreate.category, min_length=1) — but pre-filling "אחר"
  // meant the gate was satisfied by a catch-all nobody chose. Same class as
  // ExperienceForm's location_type: "home".
  category: "",
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
    // MEH-2013: no "אחר" fallback here either — an existing event with no
    // category has to be given one, not silently stamped catch-all on save.
    category: initial.category ?? "",
    price: initial.price ?? 0,
    max_participants: initial.max_participants ?? "",
    registration_url: initial.registration_url ?? "",
  };
}

// MEH-1809: the fields the browser used to police via native `required` / `min`
// attributes. The form is `noValidate` now, so these checks replace them — all
// evaluated together, each landing on its own field. Order = DOM order, which is
// what makes "focus the first invalid field" mean the topmost one.
// MEH-2013: city + category join in DOM order (both sit between the date and
// price inputs), so "first invalid" still means topmost.
const EVENT_FIELD_ORDER = [
  "title",
  "event_date",
  "city",
  "category",
  "price",
  "max_participants",
  "registration_url",
];

// `type="url"` rejects "abc" and "www.example.com" but ACCEPTS "javascript:…"
// and "data:…" — measured in Chromium, not assumed. This mirrors that exactly,
// so the boundary is restored and nothing more: registration_url reaches an
// href (EventDetailClient.jsx:157) with no backend validation of any kind
// (schemas.py:2937), and closing the scheme hole is a security fix that needs
// its own ticket rather than a quiet ride-along here.
function isNativeValidUrl(value) {
  try {
    new URL(value);
    return true;
  } catch {
    return false;
  }
}

const isWholeNumber = (value) => Number.isInteger(Number(value));

function validateEventForm(f, t) {
  const errors = {};
  if (!f.title.trim()) errors.title = t("error_title_required");
  if (!f.event_date) errors.event_date = t("error_date_required");
  // MEH-2013: both are labelled `*`. `city` was enforced nowhere; `category`
  // WAS enforced server-side, but the form is noValidate so the native
  // `required` on the <select> is dead — the only failure path was a raw 422
  // with no message beside the field.
  if (!f.city.trim()) errors.city = t("error_city_required");
  if (!f.category) errors.category = t("error_category_required");
  if (f.price !== "") {
    if (Number(f.price) < 0) errors.price = t("error_price_negative");
    // EventCreate.price is `int` — a fractional value 422s with an opaque
    // banner, which is what the browser's implicit step=1 used to prevent.
    else if (!isWholeNumber(f.price)) errors.price = t("error_whole_number");
  }
  if (f.max_participants !== "") {
    if (Number(f.max_participants) < 1) errors.max_participants = t("error_max_participants_min");
    else if (!isWholeNumber(f.max_participants)) errors.max_participants = t("error_whole_number");
  }
  if (f.registration_url.trim() !== "" && !isNativeValidUrl(f.registration_url.trim())) {
    errors.registration_url = t("error_invalid_url");
  }
  return errors;
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
  const [fieldErrors, setFieldErrors] = useState({});
  const [unverified, setUnverified] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [uploading, setUploading] = useState(false);

  const isEdit = mode === "edit";
  const update = (field) => (e) => {
    const { value } = e.target;
    setForm((f) => ({ ...f, [field]: value }));
    // A field the owner is fixing stops shouting at them (GOV.UK).
    setFieldErrors((errs) => (errs[field] ? { ...errs, [field]: undefined } : errs));
  };

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

    const errors = validateEventForm(form, t);
    if (Object.keys(errors).length > 0) {
      setFieldErrors(errors);
      const firstInvalid = EVENT_FIELD_ORDER.find((field) => errors[field]);
      const el = document.getElementById(firstInvalid);
      el?.focus();
      el?.scrollIntoView?.({ behavior: "smooth", block: "center" });
      return;
    }
    setFieldErrors({});
    setSubmitting(true);
    try {
      const payload = {
        ...form,
        // MEH-2013: required on both sides now — validateEventForm has already
        // rejected an empty/whitespace value by the time we get here.
        city: form.city.trim(),
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

      <form onSubmit={handleSubmit} noValidate className="space-y-5">
        <Input
          id="title"
          type="text"
          label={t("field_title_label")}
          required
          value={form.title}
          onChange={update("title")}
          placeholder={t("field_title_placeholder")}
          error={fieldErrors.title}
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
            error={fieldErrors.event_date}
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
            onChange={(val) => {
              setForm((f) => ({ ...f, city: val }));
              // MEH-2013: CitySearch reports a value, not an event, so it does
              // not go through `update()` — clear its error the same way.
              setFieldErrors((errs) => (errs.city ? { ...errs, city: undefined } : errs));
            }}
            placeholder={t("field_city_placeholder")}
          />
          {/* MEH-2013: CitySearch has no error prop, so the message renders
              beside it here. The input cannot reference it via
              aria-describedby without changing CitySearch — noted in the PR. */}
          {fieldErrors.city && (
            <span id="city-error" className="text-xs text-error mt-1 block">
              {fieldErrors.city}
            </span>
          )}
        </div>

        <Field id="category" label={t("field_category_label")} required error={fieldErrors.category}>
          <select
            id="category"
            value={form.category}
            onChange={update("category")}
            className="input-base"
            required
            aria-invalid={fieldErrors.category ? true : undefined}
            aria-describedby={fieldErrors.category ? "category-error" : undefined}
          >
            {/* MEH-2013: a disabled placeholder is what gives the select an
                "unchosen" state at all. Without it the first real option is
                displayed and submitting looks like a deliberate choice of it —
                which is how "אחר" used to be picked for everyone. */}
            <option value="" disabled>
              {t("field_category_placeholder")}
            </option>
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
            error={fieldErrors.price}
          />
          <Input
            id="max_participants"
            type="number"
            min="1"
            label={t("field_max_participants_label_full")}
            value={form.max_participants}
            onChange={update("max_participants")}
            placeholder={t("field_max_participants_hint")}
            error={fieldErrors.max_participants}
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-text mb-1">{t("image_label")}</label>
          {form.image_url ? (
            <div className="flex items-center gap-3">
              {/* raw img: upload preview. `form.image_url` is whatever POST /upload returned —
                  a Cloudinary secure_url OR the local /placeholder-image.png fallback
                  (upload.py:115). Mixed provenance, authenticated form chrome, 96px. */}
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
          error={fieldErrors.registration_url}
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

// MEH-2013: `error` mirrors ui/Input's error slot so a Field-hosted control
// (the category <select>) can carry an inline message instead of the raw 422
// that noValidate left as the only failure path. The asterisk mechanism above
// is untouched on purpose — MEH-2015 owns consolidating it.
function Field({ id, label, required, error, children }) {
  return (
    <div>
      <label htmlFor={id} className="block text-sm font-medium text-text mb-1">
        {label} {required && <span className="text-red-500">*</span>}
      </label>
      {children}
      {error && (
        <span id={id ? `${id}-error` : undefined} className="text-xs text-error mt-1 block">
          {error}
        </span>
      )}
    </div>
  );
}
