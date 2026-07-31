"use client";

/**
 * Module:   ExperienceForm
 * Purpose:  Shared create/edit form for community experiences. Owns form state,
 *           the debounced live-moderation check, and submit (POST /experiences
 *           on create, PUT /experiences/{id} on edit). Extracted from
 *           experiences/new/NewExperienceClient.jsx for MEH-1405 so the manage
 *           edit page reuses the exact fields + validation.
 * Touches:  POST /experiences/validate (live verdict), POST|PUT /experiences.
 * Does NOT: own page chrome (breadcrumb/heading) or post-success navigation —
 *           the consuming page passes onSuccess and renders the surrounding UI.
 * Related:  experiences/new/NewExperienceClient.jsx (create wrapper),
 *           producer/dashboard/experiences/[id]/edit/page.js (edit wrapper).
 * History:  MEH-1405 (extraction); MEH-1404 (AddressSearch + lat/lng, moved here);
 *           MEH-1809 (all required/range checks evaluated together and rendered
 *           inline per field + focus to the first invalid one — replaced the
 *           one-at-a-time `return setServerError(...)` chain; the banner now
 *           carries server/moderation errors only).
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import api from "@/lib/api";
import { isUnverifiedEmailError } from "@/lib/errors";
import { Warning, Lightbulb, XCircle } from "@phosphor-icons/react";
import CitySearch from "@/components/CitySearch";
import AddressSearch from "@/components/AddressSearch";
import Input from "@/components/ui/Input";
import UnverifiedEmailNotice from "@/components/UnverifiedEmailNotice";
import { EXPERIENCE_CATEGORIES } from "@/lib/event-categories";

const CATEGORY_KEYS = EXPERIENCE_CATEGORIES.map((c) => ({ value: c.key, labelKey: c.labelKey }));

const LOCATION_TYPE_KEYS = [
  { value: "home", labelKey: "location_home" },
  { value: "public", labelKey: "location_public" },
];

const EMPTY = {
  title: "",
  description: "",
  image_url: "",
  category: "",
  event_date: "",
  event_time: "",
  duration_minutes: "",
  location_type: "home",
  city: "",
  address: "",
  lat: null,
  lng: null,
  price_per_person: "",
  max_participants: "",
  requirements: "",
  is_recurring: false,
  recurring_schedule: "",
};

function seed(initial) {
  if (!initial) return EMPTY;
  const str = (v) => (v == null ? "" : String(v));
  return {
    title: initial.title ?? "",
    description: initial.description ?? "",
    image_url: initial.image_url ?? "",
    category: initial.category ?? "",
    event_date: initial.event_date ?? "",
    event_time: initial.event_time ? String(initial.event_time).slice(0, 5) : "",
    duration_minutes: str(initial.duration_minutes),
    location_type: initial.location_type ?? "home",
    city: initial.city ?? "",
    address: initial.address ?? "",
    lat: initial.lat ?? null,
    lng: initial.lng ?? null,
    price_per_person: str(initial.price_per_person),
    max_participants: str(initial.max_participants),
    requirements: initial.requirements ?? "",
    is_recurring: Boolean(initial.is_recurring),
    recurring_schedule: initial.recurring_schedule ?? "",
  };
}

// MEH-1809: every required/range rule in one place. The three length/date
// checks were already here as sequential early-returns; the duration/price/
// participant bounds were enforced only by native `min`/`max` attributes, which
// the form's new `noValidate` turns off — so they move here unchanged rather
// than disappearing. Order = DOM order, so "first invalid" means topmost.
const EXPERIENCE_FIELD_ORDER = [
  "title",
  "description",
  "event_date",
  "duration_minutes",
  "price_per_person",
  "max_participants",
];

const EXPERIENCE_FIELD_ID = {
  title: "experience-title",
  description: "experience-description",
  event_date: "experience-date",
  duration_minutes: "experience-duration",
  price_per_person: "experience-price",
  max_participants: "experience-max-participants",
};

function validateExperienceForm(f, t) {
  const errors = {};
  if (f.title.trim().length < 4) errors.title = t("error_title_short");
  if (f.description.trim().length < 20) errors.description = t("error_description_short");
  if (!f.event_date) errors.event_date = t("error_date_required");
  if (f.duration_minutes !== "") {
    const d = Number(f.duration_minutes);
    if (d < 15 || d > 1440) errors.duration_minutes = t("error_duration_range");
  }
  if (f.price_per_person !== "" && Number(f.price_per_person) < 0) {
    errors.price_per_person = t("error_price_negative");
  }
  if (f.max_participants !== "" && Number(f.max_participants) < 1) {
    errors.max_participants = t("error_max_participants_min");
  }
  return errors;
}

/**
 * @param {"create"|"edit"} mode
 * @param {object|null} initial  experience (ExperienceDetailOut) to prefill
 * @param {(data:object)=>void} onSuccess  called with the created/updated row
 * @param {string} cancelHref
 */
export default function ExperienceForm({ mode = "create", initial = null, onSuccess, cancelHref = "/experiences" }) {
  const t = useTranslations("experiences.new");
  const tCat = useTranslations("experiences.categories");
  const [form, setForm] = useState(() => seed(initial));
  const [verdict, setVerdict] = useState(null); // { status, reason, suggestion }
  const [checking, setChecking] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [serverError, setServerError] = useState("");
  const [fieldErrors, setFieldErrors] = useState({});
  const [unverified, setUnverified] = useState(false);
  const debounceRef = useRef(null);
  const isEdit = mode === "edit";

  const setField = (name) => (e) => {
    const value = e?.target?.type === "checkbox" ? e.target.checked : e?.target?.value;
    setForm((f) => ({ ...f, [name]: value }));
    // A field being corrected stops shouting at the owner (GOV.UK).
    setFieldErrors((errs) => (errs[name] ? { ...errs, [name]: undefined } : errs));
  };

  const setCityField = useCallback((value) => {
    setForm((f) => ({ ...f, city: value }));
  }, []);

  // Debounced real-time moderation check (create + edit both re-validate).
  const checkContent = useMemo(
    () => (payload) => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
      debounceRef.current = setTimeout(async () => {
        if (!payload.title || payload.title.length < 4) {
          setVerdict(null);
          return;
        }
        setChecking(true);
        try {
          const r = await api.post("/experiences/validate", payload);
          setVerdict(r.data);
        } catch {
          setVerdict(null);
        } finally {
          setChecking(false);
        }
      }, 1500);
    },
    []
  );

  useEffect(() => {
    checkContent({
      title: form.title,
      description: form.description,
      category: form.category || undefined,
      city: form.city || undefined,
      location_type: form.location_type,
      price_per_person: form.price_per_person ? Number(form.price_per_person) : undefined,
      max_participants: form.max_participants ? Number(form.max_participants) : undefined,
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    form.title,
    form.description,
    form.category,
    form.city,
    form.location_type,
    form.price_per_person,
    form.max_participants,
  ]);

  const submit = async (e) => {
    e.preventDefault();
    setServerError("");
    setUnverified(false);

    const errors = validateExperienceForm(form, t);
    if (Object.keys(errors).length > 0) {
      setFieldErrors(errors);
      const firstInvalid = EXPERIENCE_FIELD_ORDER.find((field) => errors[field]);
      const el = document.getElementById(EXPERIENCE_FIELD_ID[firstInvalid]);
      el?.focus();
      el?.scrollIntoView?.({ behavior: "smooth", block: "center" });
      return;
    }
    setFieldErrors({});

    // Not a field error: the moderation verdict belongs to the whole submission
    // and already has its own block above, so it stays in the banner.
    if (verdict?.status === "REJECTED") return setServerError(verdict.reason || t("rejected_fallback"));

    const payload = {
      title: form.title.trim(),
      description: form.description.trim(),
      image_url: form.image_url.trim() || null,
      category: form.category || null,
      event_date: form.event_date,
      event_time: form.event_time || null,
      duration_minutes: form.duration_minutes ? Number(form.duration_minutes) : null,
      location_type: form.location_type,
      city: form.city || null,
      address: form.address || null,
      lat: form.lat ?? null,
      lng: form.lng ?? null,
      price_per_person: form.price_per_person ? Number(form.price_per_person) : null,
      max_participants: form.max_participants ? Number(form.max_participants) : null,
      requirements: form.requirements || null,
      is_recurring: form.is_recurring,
      recurring_schedule: form.is_recurring ? form.recurring_schedule || null : null,
    };

    setSubmitting(true);
    try {
      const r = isEdit
        ? await api.put(`/experiences/${initial.id}`, payload)
        : await api.post("/experiences", payload);
      onSuccess?.(r.data);
    } catch (err) {
      const detail = err.response?.data?.detail;
      if (isUnverifiedEmailError(err)) setUnverified(true);
      else if (detail && typeof detail === "object" && detail.reason) setServerError(detail.reason);
      else if (typeof detail === "string") setServerError(detail);
      else setServerError(t("error_generic"));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <form onSubmit={submit} noValidate className="bg-background border border-border rounded-[16px] p-6 space-y-5">
      {unverified && <UnverifiedEmailNotice />}
      {serverError && (
        <div className="bg-red-50 border border-red-200 text-red-700 rounded-[12px] p-3 text-sm">{serverError}</div>
      )}

      <Input
        id="experience-title"
        label={t("field_title")}
        type="text"
        value={form.title}
        onChange={setField("title")}
        placeholder={t("field_title_placeholder")}
        required
        error={fieldErrors.title}
      />

      <Field id="experience-description" label={t("field_description")} error={fieldErrors.description}>
        <textarea
          id="experience-description"
          value={form.description}
          onChange={setField("description")}
          rows={5}
          placeholder={t("field_description_placeholder")}
          className={`w-full border rounded-[12px] px-3 py-2 bg-white ${
            fieldErrors.description ? "border-error" : "border-border"
          }`}
          required
          aria-invalid={fieldErrors.description ? true : undefined}
          aria-describedby={fieldErrors.description ? "experience-description-error" : undefined}
        />
      </Field>

      {/* Live moderation feedback */}
      {checking && <p className="text-xs text-fg-muted">{t("checking_content")}</p>}
      {verdict?.status === "FLAGGED" && (
        <div className="bg-yellow-50 border border-yellow-300 text-yellow-800 rounded-[12px] p-3 text-sm">
          <Warning size={16} weight="fill" className="inline align-[-2px]" aria-hidden="true" /> {verdict.reason}
          {verdict.suggestion && (
            <p className="text-xs text-yellow-700 mt-1">
              <Lightbulb size={14} weight="fill" className="inline align-[-2px]" aria-hidden="true" /> {verdict.suggestion}
            </p>
          )}
        </div>
      )}
      {verdict?.status === "REJECTED" && (
        <div className="bg-red-50 border border-red-300 text-red-800 rounded-[12px] p-3 text-sm">
          <XCircle size={16} weight="fill" className="inline align-[-2px]" aria-hidden="true" /> {verdict.reason || t("rejected_fallback")}
        </div>
      )}

      <Field label={t("field_category")}>
        <select
          value={form.category}
          onChange={setField("category")}
          className="w-full border border-border rounded-[12px] px-3 py-2 bg-white"
        >
          <option value="">{t("category_none")}</option>
          {CATEGORY_KEYS.map((c) => (
            <option key={c.value} value={c.value}>
              {tCat(c.labelKey)}
            </option>
          ))}
        </select>
      </Field>

      <Input
        label={t("field_image")}
        type="url"
        dir="ltr"
        value={form.image_url}
        onChange={setField("image_url")}
        // MEH-1617: value moved to experiences.new.field_image_placeholder,
        // matching the field_title_placeholder naming already in that namespace.
        placeholder={t("field_image_placeholder")}
      />

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Input
          id="experience-date"
          label={t("field_date")}
          type="date"
          value={form.event_date}
          onChange={setField("event_date")}
          required
          error={fieldErrors.event_date}
        />
        <Input label={t("field_time")} type="time" value={form.event_time} onChange={setField("event_time")} />
      </div>

      <Input
        id="experience-duration"
        label={t("field_duration")}
        type="number"
        min="15"
        max="1440"
        value={form.duration_minutes}
        onChange={setField("duration_minutes")}
        placeholder={t("field_duration_placeholder")}
        error={fieldErrors.duration_minutes}
      />

      <Field label={t("field_location_type")}>
        <div className="flex flex-wrap gap-2">
          {LOCATION_TYPE_KEYS.map((lt) => (
            <button
              key={lt.value}
              type="button"
              onClick={() => setForm((f) => ({ ...f, location_type: lt.value }))}
              className={`px-4 py-2 rounded-full text-sm transition ${
                form.location_type === lt.value
                  ? "bg-primary text-white"
                  : "bg-white text-text border border-border hover:bg-green-50"
              }`}
            >
              {t(lt.labelKey)}
            </button>
          ))}
        </div>
      </Field>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Field label={t("field_city")}>
          <CitySearch id="experience-city" value={form.city} onChange={setCityField} placeholder={t("field_city_placeholder")} />
        </Field>
        <div>
          <label htmlFor="experience-address" className="block text-sm font-medium text-text mb-1">
            {t("field_address")}
          </label>
          {/* MEH-1404: AddressSearch fills address text (onChange) + lat/lng
              (onSelect). MEH-1405: single associated <label htmlFor> above (no
              `label` prop → no duplicate sr-only label). */}
          <AddressSearch
            id="experience-address"
            value={form.address}
            onChange={(val) => setForm((f) => ({ ...f, address: val }))}
            onSelect={(picked) =>
              setForm((f) => ({
                ...f,
                address: picked.street || picked.displayName || f.address,
                lat: picked.lat ?? null,
                lng: picked.lng ?? null,
              }))
            }
            placeholder={t("field_address_placeholder")}
          />
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Input
          id="experience-price"
          label={t("field_price")}
          type="number"
          min="0"
          step="1"
          value={form.price_per_person}
          onChange={setField("price_per_person")}
          placeholder={t("field_price_placeholder")}
          error={fieldErrors.price_per_person}
        />
        <Input
          id="experience-max-participants"
          label={t("field_max_participants")}
          type="number"
          min="1"
          value={form.max_participants}
          onChange={setField("max_participants")}
          placeholder={t("field_max_participants_placeholder")}
          error={fieldErrors.max_participants}
        />
      </div>

      <Field label={t("field_requirements")}>
        <textarea
          value={form.requirements}
          onChange={setField("requirements")}
          rows={3}
          placeholder={t("field_requirements_placeholder")}
          className="w-full border border-border rounded-[12px] px-3 py-2 bg-white"
        />
      </Field>

      <div>
        <label className="flex items-center gap-2 cursor-pointer">
          <input type="checkbox" checked={form.is_recurring} onChange={setField("is_recurring")} className="w-4 h-4" />
          <span className="text-sm">{t("is_recurring")}</span>
        </label>
        {form.is_recurring && (
          <div className="mt-2">
            <Input
              type="text"
              value={form.recurring_schedule}
              onChange={setField("recurring_schedule")}
              placeholder={t("recurring_placeholder")}
              className="text-sm"
            />
          </div>
        )}
      </div>

      <div className="flex items-center justify-between pt-4 border-t border-border">
        <Link href={cancelHref} className="text-sm text-fg-muted hover:text-primary">
          {t("cancel")}
        </Link>
        <button
          type="submit"
          disabled={submitting || verdict?.status === "REJECTED"}
          className="bg-primary text-white px-6 py-3 rounded-[8px] font-medium hover:bg-primary-dark transition disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {submitting
            ? t("submitting")
            : verdict?.status === "REJECTED"
              ? t("cannot_publish")
              : isEdit
                ? t("save_cta")
                : t("submit_cta")}
        </button>
      </div>
    </form>
  );
}

// MEH-1809: `id` associates the label with its control and `error` renders the
// message under it, matching ui/Input's error slot (text-xs text-error). Both
// are optional, so the callers that pass neither render exactly as before —
// this is the textarea/select path that ui/Input, an <input>-only primitive,
// cannot cover.
function Field({ id, label, error, children }) {
  return (
    <div>
      <label htmlFor={id} className="block text-sm font-medium text-text mb-1">
        {label}
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
