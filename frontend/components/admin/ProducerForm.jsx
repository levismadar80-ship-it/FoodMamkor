"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Cow, Leaf, Seal } from "@phosphor-icons/react";
import { useTranslations } from "next-intl";
import api from "@/lib/api";
import CitiesAutocomplete from "@/components/CitiesAutocomplete";
import InfoTooltip from "@/components/InfoTooltip";
import {
  hasLicenseFormatWarning,
  requiresProducerLicense,
} from "@/lib/license-required-categories";

// Kosher options keyed for translation; value is the persisted string sent to API.
const KOSHER_OPTIONS = [
  { value: "",                labelKey: "none" },
  { value: "כשר",             labelKey: "kosher" },
  { value: "כשר למהדרין",     labelKey: "mehadrin" },
  { value: "לא כשר",          labelKey: "not_kosher" },
];

/**
 * MEH-530: license-number input with the same required/optional branching
 * the public register form uses. Defined at module scope (rather than
 * inside ProducerForm) so it doesn't get recreated on every render.
 *
 * Required path → renders directly with "(חובה)" suffix.
 * Optional path → collapsed behind a "יש לי רישיון יצרן ↓" toggle.
 *
 * Format check is inline + non-blocking — backend deliberately doesn't
 * enforce the regex (manual-approval flow per MEH-530 spec).
 */
function ProducerLicenseField({ form, categories, update, inputClass }) {
  const t = useTranslations("admin.producer_form.license");
  const [optionalExpanded, setOptionalExpanded] = useState(false);
  const required = requiresProducerLicense(categories, form.category_ids);
  const warning = hasLicenseFormatWarning(form.producer_license_number);

  // Auto-expand the optional path if a value is already present (edit flow)
  // so the admin sees what's persisted rather than a blank toggle.
  const showField = required || optionalExpanded || !!form.producer_license_number;

  if (!showField) {
    return (
      <div className="pt-4 border-t border-border mt-4">
        <button
          type="button"
          onClick={() => setOptionalExpanded(true)}
          className="text-xs text-primary underline hover:text-primary-light"
        >
          {t("optional_toggle")}
        </button>
      </div>
    );
  }

  return (
    <div className="pt-4 border-t border-border mt-4">
      <label
        htmlFor="admin-producer-license"
        className="block text-sm text-text-secondary mb-1"
      >
        {t("label")}{required ? t("required_suffix") : ""}
      </label>
      {required && (
        <p className="text-xs text-site-muted mb-2">
          {t("required_note")}
        </p>
      )}
      <input
        id="admin-producer-license"
        value={form.producer_license_number}
        onChange={(e) => update("producer_license_number", e.target.value)}
        maxLength={20}
        inputMode="numeric"
        className={inputClass}
        dir="ltr"
      />
      {warning && (
        <p className="text-xs text-amber-600 mt-1">
          {t("format_warning")}
        </p>
      )}
    </div>
  );
}

const EMPTY = {
  name: "",
  contact_name: "",
  opening_hours: "",
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
  // MEH-293: dietary flags (gluten_free / vegan / lactose_free) moved to per-product.
  is_verified: true,
  // MEH-18
  is_recommended: false,
  // MEH-530: admin form persists raw value; backend enforces conditional-
  // required guard on category-license pairing.
  producer_license_number: "",
  admin_notes: "",
  images: [],
  // MEH-213 — location mode
  has_physical_location: true,
  offers_delivery: false,
  delivery_nationwide: false,
  delivery_cities: [],
  // MEH-291 — unified 4-state availability. Backend dual-writes to legacy
  // availability_status during the 7-day overlap; Phase 4 drops the legacy.
  availability_state: "accepting_orders",
  vacation_until: "",
};

export default function ProducerForm({ initial = null, producerId = null }) {
  const t = useTranslations("admin.producer_form");
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
        // MEH-530: admin GET /admin/producers/{id} returns ProducerAdminOut
        // which exposes the raw producer_license_number; null becomes "".
        producer_license_number: initial.producer_license_number ?? "",
        contact_name: initial.contact_name ?? "",
        whatsapp_group: initial.whatsapp_group ?? "",
        // MEH-17
        primary_contact_method: initial.primary_contact_method ?? "whatsapp",
        contact_email: initial.contact_email ?? "",
        short_description: initial.short_description ?? "",
        top_product_name: initial.top_product_name ?? "",
        price_range: initial.price_range ?? initial.starting_price_label ?? "",
        admin_notes: initial.admin_notes ?? "",
        opening_hours: initial.opening_hours ?? "",
        // MEH-213 — location mode
        has_physical_location: initial.has_physical_location ?? true,
        offers_delivery: initial.offers_delivery ?? false,
        delivery_nationwide: initial.delivery_nationwide ?? false,
        delivery_cities: initial.delivery_cities ?? [],
        // MEH-291 — unified 4-state availability (with legacy fallback during overlap).
        availability_state:
          initial.availability_state ??
          (initial.availability_status === "vacation"
            ? "on_vacation"
            : initial.availability_status === "full"
              ? "full_this_week"
              : initial.is_available_today
                ? "available_today"
                : "accepting_orders"),
        vacation_until: initial.vacation_until ?? "",
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
      setError(err.response?.data?.detail || t("errors.upload_image"));
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
      // MEH-291 — clear vacation_until when not on vacation
      vacation_until: form.availability_state === "on_vacation" && form.vacation_until ? form.vacation_until : null,
    };

    try {
      if (producerId) {
        await api.put(`/admin/producers/${producerId}`, payload);
      } else {
        await api.post("/admin/producers", payload);
      }
      router.push("/admin?tab=producers");
    } catch (err) {
      setError(err.response?.data?.detail || t("errors.save"));
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

      <Section title={t("sections.basics")}>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <Field label={t("fields.name")}>
            <input
              required
              value={form.name}
              onChange={(e) => update("name", e.target.value)}
              className={inputClass}
            />
          </Field>
          <Field label={t("fields.contact_name")}>
            <input
              value={form.contact_name}
              onChange={(e) => update("contact_name", e.target.value)}
              className={inputClass}
            />
          </Field>
          <Field label={t("fields.phone")}>
            <input
              value={form.phone}
              onChange={(e) => update("phone", e.target.value)}
              className={inputClass}
              placeholder="050-1234567"
            />
          </Field>
          <Field label={t("fields.instagram")}>
            <input
              value={form.instagram}
              onChange={(e) => update("instagram", e.target.value)}
              className={inputClass}
              placeholder="@username"
            />
          </Field>
          <Field label={t("fields.website")}>
            <input
              value={form.website}
              onChange={(e) => update("website", e.target.value)}
              className={inputClass}
              placeholder="https://..."
            />
          </Field>
          <Field label={t("fields.whatsapp_group")}>
            <input
              value={form.whatsapp_group}
              onChange={(e) => update("whatsapp_group", e.target.value)}
              className={inputClass}
              placeholder="https://chat.whatsapp.com/..."
            />
          </Field>
          {/* MEH-17 — primary contact method + business email. */}
          <Field label={t("fields.primary_contact_method")}>
            <select
              value={form.primary_contact_method}
              onChange={(e) => update("primary_contact_method", e.target.value)}
              className={inputClass}
            >
              <option value="whatsapp">WhatsApp</option>
              <option value="phone">{t("contact_methods.phone")}</option>
              <option value="website">{t("contact_methods.website")}</option>
              <option value="email">{t("contact_methods.email")}</option>
            </select>
          </Field>
          <Field label={t("fields.contact_email")}>
            <input
              type="email"
              value={form.contact_email}
              onChange={(e) => update("contact_email", e.target.value)}
              className={inputClass}
              placeholder="business@example.com"
              dir="ltr"
            />
          </Field>
          <Field label={t("fields.city")}>
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

      <Section title={t("sections.categories_tags")}>
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
            <Leaf size={16} weight="duotone" className="inline align-[-2px] text-primary" aria-hidden="true" /> {t("tags.organic")}
          </label>
          <label className="flex items-center gap-2 text-sm cursor-pointer">
            <input
              type="checkbox"
              checked={form.grass_fed}
              onChange={(e) => update("grass_fed", e.target.checked)}
              className="w-4 h-4 accent-primary"
            />
            <Cow size={16} weight="duotone" className="inline align-[-2px] text-primary" aria-hidden="true" /> {t("tags.grass_fed")}
          </label>
          {/* MEH-293: dietary checkboxes (gluten_free / vegan / lactose_free) moved to per-product. */}
          <label className="flex items-center gap-2 text-sm cursor-pointer">
            <input
              type="checkbox"
              checked={form.is_verified}
              onChange={(e) => update("is_verified", e.target.checked)}
              className="w-4 h-4 accent-primary"
            />
            <Seal size={16} weight="fill" className="inline align-[-2px] text-primary" aria-hidden="true" /> {t("tags.verified")}
          </label>
          <label className="flex items-center gap-2 text-sm cursor-pointer">
            <input
              type="checkbox"
              checked={!!form.is_recommended}
              onChange={(e) => update("is_recommended", e.target.checked)}
              className="w-4 h-4 accent-accent"
            />
            {t("tags.recommended")}
          </label>
          <Field label={t("fields.kosher")}>
            <select
              value={form.kosher}
              onChange={(e) => update("kosher", e.target.value)}
              className={inputClass}
            >
              {KOSHER_OPTIONS.map((k) => (
                <option key={k.value} value={k.value}>
                  {t(`kosher_options.${k.labelKey}`)}
                </option>
              ))}
            </select>
          </Field>
        </div>

        {/* MEH-530: producer-license field — required when any selected
            category needs it, optional+collapsed otherwise. Format warning
            is inline + non-blocking (manual-approval flow per spec). */}
        <ProducerLicenseField
          form={form}
          categories={categories}
          update={update}
          inputClass={inputClass}
        />
      </Section>

      {/* MEH-213 — location type */}
      <Section title={t("sections.business_type")}>
        <div className="space-y-3">
          <label className="flex items-center gap-2 text-sm cursor-pointer">
            <input
              type="checkbox"
              checked={form.has_physical_location}
              onChange={(e) => update("has_physical_location", e.target.checked)}
              className="w-4 h-4 accent-primary"
            />
            {t("business_type.physical")}
          </label>
          <label className="flex items-center gap-2 text-sm cursor-pointer">
            <input
              type="checkbox"
              checked={form.offers_delivery}
              onChange={(e) => update("offers_delivery", e.target.checked)}
              className="w-4 h-4 accent-primary"
            />
            {t("business_type.delivery")}
          </label>
          {!form.has_physical_location && !form.offers_delivery && (
            <p className="text-xs text-red-600">{t("business_type.must_select_one")}</p>
          )}
          {form.offers_delivery && (
            <div className="ms-6 space-y-3 border-s-2 border-border ps-4 pt-1">
              <label className="flex items-center gap-2 text-sm cursor-pointer">
                <input
                  type="checkbox"
                  checked={form.delivery_nationwide}
                  onChange={(e) => {
                    update("delivery_nationwide", e.target.checked);
                    if (e.target.checked) update("delivery_cities", []);
                  }}
                  className="w-4 h-4 accent-primary"
                />
                {t("business_type.nationwide")}
              </label>
              {!form.delivery_nationwide && (
                <div>
                  <span className="block text-sm text-text-secondary mb-1">{t("fields.delivery_cities")}</span>
                  <CitiesAutocomplete
                    value={form.delivery_cities}
                    onChange={(cities) => update("delivery_cities", cities)}
                  />
                  {form.delivery_cities.length === 0 && (
                    <p className="text-xs text-red-600 mt-1">{t("business_type.must_select_city")}</p>
                  )}
                </div>
              )}
            </div>
          )}
        </div>
      </Section>

      <Section title={t("sections.delivery")}>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <label className="flex items-center gap-2 text-sm cursor-pointer">
            <input
              type="checkbox"
              checked={form.has_delivery}
              onChange={(e) => update("has_delivery", e.target.checked)}
              className="w-4 h-4 accent-primary"
            />
            {t("delivery.has_delivery")}
          </label>
          <label className="flex items-center gap-2 text-sm cursor-pointer">
            <input
              type="checkbox"
              checked={form.pickup_points}
              onChange={(e) => update("pickup_points", e.target.checked)}
              className="w-4 h-4 accent-primary"
            />
            {t("delivery.pickup_points")}
          </label>
          <Field label={t("fields.delivery_area_cities")} full>
            <input
              value={form.delivery_area_cities}
              onChange={(e) => update("delivery_area_cities", e.target.value)}
              className={inputClass}
              placeholder={t("placeholders.delivery_area_cities")}
            />
          </Field>
        </div>
      </Section>

      <Section title={t("sections.description_and_price")}>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <Field label={t("fields.short_description")} full>
            <input
              value={form.short_description}
              onChange={(e) => update("short_description", e.target.value)}
              className={inputClass}
            />
          </Field>
          <Field label={t("fields.description")} full>
            <textarea
              value={form.description}
              onChange={(e) => update("description", e.target.value)}
              className={`${inputClass} h-28 resize-none`}
            />
          </Field>
          <Field label={t("fields.top_product_name")}>
            <input
              value={form.top_product_name}
              onChange={(e) => update("top_product_name", e.target.value)}
              className={inputClass}
              placeholder={t("placeholders.top_product_name")}
            />
          </Field>
          <Field label={t("fields.price_range")}>
            <input
              value={form.price_range}
              onChange={(e) => update("price_range", e.target.value)}
              className={inputClass}
              placeholder={t("placeholders.price_range")}
            />
          </Field>
        </div>
      </Section>

      <Section title={t("sections.images")}>
        <input
          type="file"
          accept="image/*"
          multiple
          onChange={handleImageUpload}
          disabled={uploading}
          className="text-sm"
        />
        {uploading && <p className="text-sm text-text-secondary mt-2">{t("images.uploading")}</p>}
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
                  className="absolute top-1 start-1 bg-red-500 text-white rounded-full w-6 h-6 text-xs opacity-0 group-hover:opacity-100 transition"
                >
                  ✕
                </button>
              </div>
            ))}
          </div>
        )}
      </Section>

      <Section title={t("sections.hours")}>
        <Field label={t("fields.hours_label")} full>
          <input
            value={form.opening_hours}
            onChange={(e) => update("opening_hours", e.target.value)}
            className={inputClass}
            placeholder="Sun-Thu 09:00-18:00, Fri 09:00-14:00"
            dir="ltr"
          />
        </Field>
      </Section>

      <Section title={<>{t("sections.availability")} <InfoTooltip content={t("availability_tooltip.content")} label={t("availability_tooltip.label")} position="bottom" /></>}>
        <div className="flex flex-wrap gap-2 mb-3">
          {[
            { value: "accepting_orders", labelKey: "accepting_orders" },
            { value: "available_today",  labelKey: "available_today" },
            { value: "full_this_week",   labelKey: "full_this_week" },
            { value: "on_vacation",      labelKey: "on_vacation" },
          ].map(({ value, labelKey }) => (
            <button
              key={value}
              type="button"
              onClick={() => update("availability_state", value)}
              className={`px-4 py-1.5 rounded-full text-sm border transition ${
                form.availability_state === value
                  ? "bg-primary text-white border-primary"
                  : "border-border text-site-text hover:border-primary"
              }`}
            >
              {t(`availability_states.${labelKey}`)}
            </button>
          ))}
        </div>
        {form.availability_state === "on_vacation" && (
          <Field label={t("fields.vacation_until")}>
            <input
              type="date"
              value={form.vacation_until}
              min={new Date().toISOString().slice(0, 10)}
              onChange={(e) => update("vacation_until", e.target.value)}
              className={inputClass}
              dir="ltr"
            />
          </Field>
        )}
      </Section>

      <Section title={t("sections.internal_notes")}>
        <textarea
          value={form.admin_notes}
          onChange={(e) => update("admin_notes", e.target.value)}
          className={`${inputClass} h-20 resize-none`}
        />
      </Section>

      <div className="flex gap-3">
        <button
          type="submit"
          disabled={
            saving ||
            (!form.has_physical_location && !form.offers_delivery) ||
            (form.offers_delivery && !form.delivery_nationwide && form.delivery_cities.length === 0)
          }
          className="bg-primary text-white px-8 py-3 rounded-[12px] hover:bg-primary-light transition font-medium disabled:opacity-50"
        >
          {saving ? t("submit.saving") : producerId ? t("submit.save_changes") : t("submit.create")}
        </button>
        <button
          type="button"
          onClick={() => router.push("/admin?tab=producers")}
          className="bg-white border border-border px-8 py-3 rounded-[12px] hover:bg-background transition"
        >
          {t("submit.cancel")}
        </button>
      </div>
    </form>
  );
}
