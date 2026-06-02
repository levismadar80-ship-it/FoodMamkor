"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { useTranslations } from "next-intl";
import api from "@/lib/api";
import { showToast } from "@/lib/toast";
import { useAuth } from "@/lib/auth-context";
import Breadcrumb from "@/components/Breadcrumb";
import CitySearch from "@/components/CitySearch";

/**
 * Create-form for a community experience (workshop / food tour /
 * nutrition class). Mirrors the moderation UX of HomeProductForm.jsx:
 *
 *   - As the user types, debounced POST /experiences/validate gives
 *     a live verdict (APPROVED / FLAGGED / REJECTED) with reason +
 *     suggestion.
 *   - FLAGGED shows a yellow hint but doesn't block submit.
 *   - REJECTED shows a red block and disables submit entirely.
 *   - Server-side REJECTED on POST is mirrored into the same UI.
 *
 * Submit persists the row as status='pending' — admin approves it
 * from /admin/experiences before it shows up in the public list.
 */

// API filter values are Hebrew strings (server enum). Localize labels via t().
const CATEGORY_KEYS = [
  { value: "בישול", labelKey: "cooking" },
  { value: "תזונה", labelKey: "nutrition" },
  { value: "סיור אוכל", labelKey: "food_tour" },
  { value: "חקלאות", labelKey: "agriculture" },
  { value: "טעימות", labelKey: "tasting" },
  { value: "סדנה", labelKey: "workshop" },
  { value: "אחר", labelKey: "other" },
];

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
  price_per_person: "",
  max_participants: "",
  requirements: "",
  is_recurring: false,
  recurring_schedule: "",
};

export default function NewExperienceClient() {
  const t = useTranslations("experiences.new");
  const tCat = useTranslations("experiences.categories");
  const router = useRouter();
  const { user, loading: authLoading } = useAuth();
  const [form, setForm] = useState(EMPTY);
  const [verdict, setVerdict] = useState(null); // { status, reason, suggestion }
  const [checking, setChecking] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [serverError, setServerError] = useState("");
  const debounceRef = useRef(null);

  // Gate: must be logged in to submit
  useEffect(() => {
    if (!authLoading && !user) {
      router.push("/login?next=/experiences/new");
    }
  }, [user, authLoading, router]);

  const setField = (name) => (e) => {
    const value =
      e?.target?.type === "checkbox" ? e.target.checked : e?.target?.value;
    setForm((f) => ({ ...f, [name]: value }));
  };

  const setCityField = useCallback((value) => {
    setForm((f) => ({ ...f, city: value }));
  }, []);

  // Debounced real-time moderation check
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
          // Fail-open — silence and move on
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
      price_per_person: form.price_per_person
        ? Number(form.price_per_person)
        : undefined,
      max_participants: form.max_participants
        ? Number(form.max_participants)
        : undefined,
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

    if (form.title.trim().length < 4) {
      setServerError(t("error_title_short"));
      return;
    }
    if (form.description.trim().length < 20) {
      setServerError(t("error_description_short"));
      return;
    }
    if (!form.event_date) {
      setServerError(t("error_date_required"));
      return;
    }
    if (verdict?.status === "REJECTED") {
      setServerError(verdict.reason || t("rejected_fallback"));
      return;
    }

    const payload = {
      title: form.title.trim(),
      description: form.description.trim(),
      image_url: form.image_url.trim() || null,
      category: form.category || null,
      event_date: form.event_date,
      event_time: form.event_time || null,
      duration_minutes: form.duration_minutes
        ? Number(form.duration_minutes)
        : null,
      location_type: form.location_type,
      city: form.city || null,
      address: form.address || null,
      price_per_person: form.price_per_person
        ? Number(form.price_per_person)
        : null,
      max_participants: form.max_participants
        ? Number(form.max_participants)
        : null,
      requirements: form.requirements || null,
      is_recurring: form.is_recurring,
      recurring_schedule: form.is_recurring
        ? form.recurring_schedule || null
        : null,
    };

    setSubmitting(true);
    try {
      const r = await api.post("/experiences", payload);
      showToast(t("toast_submitted"));
      router.push(`/experiences/${r.data.id}?pending=1`);
    } catch (err) {
      const detail = err.response?.data?.detail;
      if (detail && typeof detail === "object" && detail.reason) {
        setServerError(detail.reason);
      } else if (typeof detail === "string") {
        setServerError(detail);
      } else {
        setServerError(t("error_generic"));
      }
    } finally {
      setSubmitting(false);
    }
  };

  if (authLoading || !user) {
    return (
      <div className="max-w-3xl mx-auto px-4 py-16 text-fg-muted">
        {t("auth_loading")}
      </div>
    );
  }

  return (
    <div className="max-w-3xl mx-auto px-4 py-8">
      <Breadcrumb
        items={[
          { href: "/", label: t("breadcrumb_home") },
          { href: "/experiences", label: t("breadcrumb_experiences") },
          { label: t("breadcrumb_submit") },
        ]}
        className="mb-4"
      />

      <h1 className="font-headline-lg text-3xl md:text-4xl font-bold text-text mb-2">
        {t("title")}
      </h1>
      <p className="text-fg-muted mb-8">
        {t("subtitle")}
      </p>

      <form
        onSubmit={submit}
        className="bg-background border border-border rounded-[16px] p-6 space-y-5"
      >
        {serverError && (
          <div className="bg-red-50 border border-red-200 text-red-700 rounded-[12px] p-3 text-sm">
            {serverError}
          </div>
        )}

        <Field label={t("field_title")}>
          <input
            type="text"
            value={form.title}
            onChange={setField("title")}
            placeholder={t("field_title_placeholder")}
            className="w-full border border-border rounded-[12px] px-3 py-2 bg-white"
            required
          />
        </Field>

        <Field label={t("field_description")}>
          <textarea
            value={form.description}
            onChange={setField("description")}
            rows={5}
            placeholder={t("field_description_placeholder")}
            className="w-full border border-border rounded-[12px] px-3 py-2 bg-white"
            required
          />
        </Field>

        {/* Live moderation feedback */}
        {checking && (
          <p className="text-xs text-fg-muted">{t("checking_content")}</p>
        )}
        {verdict?.status === "FLAGGED" && (
          <div className="bg-yellow-50 border border-yellow-300 text-yellow-800 rounded-[12px] p-3 text-sm">
            ⚠️ {verdict.reason}
            {verdict.suggestion && (
              <p className="text-xs text-yellow-700 mt-1">
                💡 {verdict.suggestion}
              </p>
            )}
          </div>
        )}
        {verdict?.status === "REJECTED" && (
          <div className="bg-red-50 border border-red-300 text-red-800 rounded-[12px] p-3 text-sm">
            ❌ {verdict.reason || t("rejected_fallback")}
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

        <Field label={t("field_image")}>
          <input
            type="url"
            dir="ltr"
            value={form.image_url}
            onChange={setField("image_url")}
            placeholder="https://res.cloudinary.com/..."
            className="w-full border border-border rounded-[12px] px-3 py-2 bg-white"
          />
        </Field>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <Field label={t("field_date")}>
            <input
              type="date"
              value={form.event_date}
              onChange={setField("event_date")}
              className="w-full border border-border rounded-[12px] px-3 py-2 bg-white"
              required
            />
          </Field>
          <Field label={t("field_time")}>
            <input
              type="time"
              value={form.event_time}
              onChange={setField("event_time")}
              className="w-full border border-border rounded-[12px] px-3 py-2 bg-white"
            />
          </Field>
        </div>

        <Field label={t("field_duration")}>
          <input
            type="number"
            min="15"
            max="1440"
            value={form.duration_minutes}
            onChange={setField("duration_minutes")}
            placeholder={t("field_duration_placeholder")}
            className="w-full border border-border rounded-[12px] px-3 py-2 bg-white"
          />
        </Field>

        <Field label={t("field_location_type")}>
          <div className="flex flex-wrap gap-2">
            {LOCATION_TYPE_KEYS.map((lt) => (
              <button
                key={lt.value}
                type="button"
                onClick={() =>
                  setForm((f) => ({ ...f, location_type: lt.value }))
                }
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
            <CitySearch
              id="new-experience-city"
              value={form.city}
              onChange={setCityField}
              placeholder={t("field_city_placeholder")}
            />
          </Field>
          <Field label={t("field_address")}>
            <input
              type="text"
              value={form.address}
              onChange={setField("address")}
              placeholder={t("field_address_placeholder")}
              className="w-full border border-border rounded-[12px] px-3 py-2 bg-white"
            />
          </Field>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <Field label={t("field_price")}>
            <input
              type="number"
              min="0"
              step="1"
              value={form.price_per_person}
              onChange={setField("price_per_person")}
              placeholder={t("field_price_placeholder")}
              className="w-full border border-border rounded-[12px] px-3 py-2 bg-white"
            />
          </Field>
          <Field label={t("field_max_participants")}>
            <input
              type="number"
              min="1"
              value={form.max_participants}
              onChange={setField("max_participants")}
              placeholder={t("field_max_participants_placeholder")}
              className="w-full border border-border rounded-[12px] px-3 py-2 bg-white"
            />
          </Field>
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
            <input
              type="checkbox"
              checked={form.is_recurring}
              onChange={setField("is_recurring")}
              className="w-4 h-4"
            />
            <span className="text-sm">{t("is_recurring")}</span>
          </label>
          {form.is_recurring && (
            <input
              type="text"
              value={form.recurring_schedule}
              onChange={setField("recurring_schedule")}
              placeholder={t("recurring_placeholder")}
              className="mt-2 w-full border border-border rounded-[12px] px-3 py-2 bg-white text-sm"
            />
          )}
        </div>

        <div className="flex items-center justify-between pt-4 border-t border-border">
          <Link href="/experiences" className="text-sm text-fg-muted hover:text-primary">
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
              : t("submit_cta")}
          </button>
        </div>
      </form>
    </div>
  );
}

function Field({ label, children }) {
  return (
    <div>
      <label className="block text-sm font-medium text-text mb-1">
        {label}
      </label>
      {children}
    </div>
  );
}
