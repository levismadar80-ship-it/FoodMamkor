"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { ArrowSquareOut, Cow, Leaf, X } from "@phosphor-icons/react";
import api from "@/lib/api";
import { HEALTH_MINISTRY_FOOD_REGISTRY_URL } from "@/lib/official-registries";
import { useAdminAction } from "@/lib/use-admin-action";
import { showToast } from "@/lib/toast";
import { detailToMessage } from "@/lib/errors";
import { optimizeCloudinary } from "@/lib/cloudinary";
import CitiesAutocomplete from "@/components/CitiesAutocomplete";
import AddressSearch from "@/components/AddressSearch";
import InfoTooltip from "@/components/InfoTooltip";
import Input from "@/components/ui/Input";
import {
  hasLicenseFormatWarning,
  requiresProducerLicense,
} from "@/lib/license-required-categories";

const KOSHER_OPTIONS = ["", "כשר", "כשר למהדרין", "לא כשר"];

// MEH-1297: a producer may hold at most 3 categories; the first-selected is the
// primary (drives categories[0] on the card/map pin). Mirrors the backend cap
// (schemas.MAX_PRODUCER_CATEGORIES) and the register CategorySelector.
const MAX_CATEGORIES = 3;

// MEH-1506: candidates under this review count are shown with a note that the
// public rating line won't render for them (mirrors backend MIN_REVIEWS=20).
// Still selectable — the admin decides.
const GOOGLE_MIN_REVIEWS = 20;

// MEH-475 PR-B: map kosher option value → i18n key (label resolved at render)
const KOSHER_LABEL_KEYS = {
  "": "producers.form.fields.kosher_none",
  "כשר": "producers.form.fields.kosher_kosher",
  "כשר למהדרין": "producers.form.fields.kosher_mehadrin",
  "לא כשר": "producers.form.fields.kosher_not_kosher",
};

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
function ProducerLicenseField({ form, categories, update }) {
  const t = useTranslations("admin");
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
          className="text-xs text-primary underline hover:text-primary-dark"
        >
          {t("producers.form.fields.license_optional_toggle")}
        </button>
      </div>
    );
  }

  return (
    <div className="pt-4 border-t border-border mt-4">
      <label
        htmlFor="admin-producer-license"
        className="block text-sm text-muted mb-1"
      >
        {t("producers.form.fields.license_label")}
        {required ? t("producers.form.fields.license_required_suffix") : ""}
      </label>
      {required && (
        <p className="text-xs text-fg-muted mb-2">
          {t("producers.form.fields.license_required_hint")}
        </p>
      )}
      {/* label-less Input — the htmlFor label + hint above keep their
          layout (Input's own label slot would move the hint below). */}
      <Input
        id="admin-producer-license"
        value={form.producer_license_number}
        onChange={(e) => update("producer_license_number", e.target.value)}
        maxLength={20}
        inputMode="numeric"
        dir="ltr"
      />
      {warning && (
        <p className="text-xs text-amber-600 mt-1">
          {t("producers.form.fields.license_format_warning")}
        </p>
      )}
      {/* MEH-1271: manual cross-check against the Ministry of Health food
          manufacturers registry (by business name / license number). */}
      <a
        href={HEALTH_MINISTRY_FOOD_REGISTRY_URL}
        target="_blank"
        rel="noopener noreferrer"
        className="inline-flex items-center gap-1 text-xs text-primary hover:underline mt-2"
      >
        <ArrowSquareOut size={14} weight="bold" aria-hidden="true" />
        {t("producers.form.fields.license_registry_link")}
      </a>
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
  // MEH-296 3d
  facebook: "",
  external_order_form: "",
  city: "",
  lat: "",
  lng: "",
  slug: "",
  // MEH-1490: admin-only Google Maps Place ID mapping (live-fetch trust line).
  google_place_id: "",
  description: "",
  short_description: "",
  top_product_name: "",
  price_range: "",
  category_ids: [],
  has_delivery: false,
  pickup_points: false,
  kosher: "",
  grass_fed: false,
  organic_certified: false,
  // MEH-1508 ch2: business-level dietary scope (admin cross-check selects).
  // `...initial` overrides these from ProducerAdminOut on edit; defaults here
  // cover the admin-create path.
  vegan_scope: "unknown",
  vegetarian_scope: "unknown",
  gluten_free_facility: "unknown",
  // MEH-293: dietary flags (gluten_free / vegan / lactose_free) moved to per-product.
  // MEH-766 ch3: is_verified removed — verification is the doc-grant flow, not a form toggle.
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
  // MEH-1255: nationwide exclusion list ("לכל הארץ חוץ מ:").
  delivery_excluded_cities: [],
  // MEH-291 — unified 4-state availability. Backend dual-writes to legacy
  // availability_status during the 7-day overlap; Phase 4 drops the legacy.
  availability_state: "accepting_orders",
  vacation_until: "",
};

// Focus-retention fix: Section + Field live at MODULE scope. Defining them
// inside ProducerForm recreated their component identity on every render, so
// React remounted the whole subtree and dropped input focus mid-typing.
function Section({ title, children }) {
  return (
    <div className="bg-white rounded-[12px] border border-border p-6">
      <h2 className="font-semibold text-lg mb-4 text-primary">{title}</h2>
      {children}
    </div>
  );
}

function Field({ label, children, full = false }) {
  return (
    <label className={`block ${full ? "md:col-span-2" : ""}`}>
      <span className="block text-sm text-muted mb-1">{label}</span>
      {children}
    </label>
  );
}

export default function ProducerForm({ initial = null, producerId = null }) {
  const t = useTranslations("admin");
  // MEH-1242 PR2: reuse the owner LocationCard's Hebrew copy for the admin
  // address search — no new i18n keys (see dashboard.producer.location).
  const tLoc = useTranslations("dashboard.producer.location");
  // MEH-1508 ch2: the admin cross-check selects reuse the owner form's locked
  // dietary-scope copy (§6.5) — one SoT, no admin-specific strings.
  const tDiet = useTranslations("dashboard.producer.dietaryScope");
  const kosherLabel = (value) => t(KOSHER_LABEL_KEYS[value] ?? "producers.form.fields.kosher_none");
  const router = useRouter();
  const { run, isBusy } = useAdminAction();
  const [form, setForm] = useState(EMPTY);
  const [categories, setCategories] = useState([]);
  // MEH-1242 PR2: free-text address backing the AddressSearch combobox.
  const [addressText, setAddressText] = useState("");
  // MEH-1506: admin-only Google Place lookup — search by the producer's own
  // name+city, admin PICKS a candidate to fill google_place_id. NO auto-select:
  // even a single candidate is a click. Nothing here is persisted except the
  // chosen place_id (ToS §3.2.3(b) — count is display-only).
  const [placeCandidates, setPlaceCandidates] = useState(null);
  const [placeSearching, setPlaceSearching] = useState(false);
  const [placeSearchState, setPlaceSearchState] = useState(null); // null | "empty" | "error"

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
        // MEH-1490: pre-fill the mapping so an unrelated admin save can't wipe it.
        google_place_id: initial.google_place_id ?? "",
        category_ids: initial.categories?.map((c) => c.id) ?? [],
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
        // MEH-296 3d
        facebook: initial.facebook ?? "",
        external_order_form: initial.external_order_form ?? "",
        short_description: initial.short_description ?? "",
        top_product_name: initial.top_product_name ?? "",
        price_range: initial.price_range ?? initial.starting_price_label ?? "",
        admin_notes: initial.admin_notes ?? "",
        opening_hours: initial.opening_hours ?? "",
        // MEH-213 — location mode
        has_physical_location: initial.has_physical_location ?? true,
        offers_delivery: initial.offers_delivery ?? false,
        delivery_nationwide: initial.delivery_nationwide ?? false,
        // MEH-903 A: the single cities input is populated from the delivery_areas
        // relation (the store), not the legacy delivery_cities column.
        delivery_cities: initial.delivery_areas?.map((d) => d.city).filter(Boolean) ?? [],
        // MEH-1255: nationwide exclusion list.
        delivery_excluded_cities: initial.delivery_excluded_cities ?? [],
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

  // MEH-1242 PR2: Nominatim address pick → fill lat/lng/city. Never clobber an
  // existing city when the result lacks one. REUSES edit/cards.jsx LocationCard.
  const handleAddressSelect = (picked) => {
    setForm((f) => ({
      ...f,
      lat: picked.lat ?? f.lat,
      lng: picked.lng ?? f.lng,
      city: picked.city || f.city,
    }));
  };

  // MEH-1506: run Places Text Search for this producer (name+city, server-side)
  // and show up to 3 candidates. 204 / empty → "no results"; reject → "error".
  // Only available in edit mode — the endpoint reads name+city from the DB row.
  const handleGooglePlaceSearch = async () => {
    if (!producerId || placeSearching) return;
    setPlaceSearching(true);
    setPlaceCandidates(null);
    setPlaceSearchState(null);
    try {
      const r = await api.get(`/admin/producers/${producerId}/google-place-candidates`);
      const candidates = r.data?.candidates;
      if (r.status === 204 || !candidates?.length) {
        setPlaceSearchState("empty");
      } else {
        setPlaceCandidates(candidates);
      }
    } catch {
      setPlaceSearchState("error");
    } finally {
      setPlaceSearching(false);
    }
  };

  // MEH-1506: admin clicks a candidate → fill google_place_id, clear the list.
  const pickPlaceCandidate = (placeId) => {
    update("google_place_id", placeId);
    setPlaceCandidates(null);
    setPlaceSearchState(null);
  };

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

  const handleImageUpload = (e) => {
    const files = Array.from(e.target.files || []);
    if (!files.length) return;
    // MEH-228 pattern: image upload routes through useAdminAction — per-key
    // in-flight lock + central error toast (no more swallowed failures).
    run(
      "producer-images",
      async () => {
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
      },
      (err) =>
        showToast.error(
          detailToMessage(err.response?.data?.detail) ||
            t("producers.form.errors.image_upload"),
        ),
    );
  };

  const removeImage = (url) => {
    setForm((f) => ({ ...f, images: f.images.filter((u) => u !== url) }));
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    // Explicit field list (no {...form} spread): the legacy delivery_cities
    // column is never sent — delivery_area_cities is the sole cities channel
    // (MEH-903). Save routes through useAdminAction (MEH-228): per-key
    // in-flight lock + central error toast (no swallowed failures).
    const payload = {
      name: form.name,
      contact_name: form.contact_name,
      opening_hours: form.opening_hours,
      phone: form.phone,
      instagram: form.instagram,
      website: form.website,
      whatsapp_group: form.whatsapp_group,
      primary_contact_method: form.primary_contact_method,
      // MEH-17 — Pydantic's EmailStr rejects empty strings; null is fine.
      contact_email: form.contact_email?.trim() || null,
      facebook: form.facebook,
      external_order_form: form.external_order_form,
      city: form.city,
      lat: form.lat === "" ? null : parseFloat(form.lat),
      lng: form.lng === "" ? null : parseFloat(form.lng),
      slug: form.slug,
      // MEH-1490: admin-only Google Place ID mapping. Blank → null (clears the
      // mapping). The value round-trips (pre-filled from ProducerDetailOut) so
      // an unrelated save never wipes an existing mapping.
      google_place_id: form.google_place_id?.trim() || null,
      description: form.description,
      short_description: form.short_description,
      top_product_name: form.top_product_name,
      price_range: form.price_range,
      category_ids: form.category_ids,
      has_delivery: form.has_delivery,
      pickup_points: form.pickup_points,
      kosher: form.kosher,
      grass_fed: form.grass_fed,
      organic_certified: form.organic_certified,
      // MEH-1508 ch2: admin sets/cross-checks the declared dietary scope.
      vegan_scope: form.vegan_scope,
      vegetarian_scope: form.vegetarian_scope,
      gluten_free_facility: form.gluten_free_facility,
      is_recommended: form.is_recommended,
      producer_license_number: form.producer_license_number,
      admin_notes: form.admin_notes,
      images: form.images,
      // MEH-213 — location mode
      has_physical_location: form.has_physical_location,
      offers_delivery: form.offers_delivery,
      delivery_nationwide: form.delivery_nationwide,
      // MEH-903 A: delivery_area_cities → delivery_areas table (single SoT);
      // the legacy delivery_cities column is intentionally omitted.
      delivery_area_cities: form.delivery_cities,
      // MEH-1255: exclusion list only meaningful in nationwide mode; the
      // toggle already clears it otherwise, and the backend guard enforces it.
      delivery_excluded_cities: form.delivery_nationwide
        ? form.delivery_excluded_cities
        : [],
      // MEH-291 — unified availability; clear vacation_until when not on vacation.
      availability_state: form.availability_state,
      vacation_until:
        form.availability_state === "on_vacation" && form.vacation_until
          ? form.vacation_until
          : null,
    };

    run(
      "producer-save",
      async () => {
        if (producerId) {
          await api.put(`/admin/producers/${producerId}`, payload);
        } else {
          await api.post("/admin/producers", payload);
        }
        router.push("/admin?tab=producers");
      },
      (err) =>
        showToast.error(
          detailToMessage(err.response?.data?.detail) ||
            t("producers.form.errors.save"),
        ),
    );
  };

  // MEH-1128 Wave C: single-line inputs migrated to ui/Input — this recipe
  // now feeds ONLY the selects + textareas (no primitive for them until the
  // epic's later waves). Delete when those migrate.
  const inputClass =
    "w-full border border-border rounded-[12px] px-3 py-2 focus:outline-none focus:border-primary bg-white";

  return (
    <form onSubmit={handleSubmit} className="space-y-6 max-w-4xl">
      <Section title={t("producers.form.sections.basic")}>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {/* MEH-1128 Wave C: single-line fields via ui/Input (labels move to
              the primitive's htmlFor slot). Field stays for the selects. */}
          <Input
            label={t("producers.form.fields.name")}
            required
            value={form.name}
            onChange={(e) => update("name", e.target.value)}
          />
          <Input
            label={t("producers.form.fields.contact_name")}
            value={form.contact_name}
            onChange={(e) => update("contact_name", e.target.value)}
          />
          <Input
            type="tel"
            label={t("producers.form.fields.phone")}
            value={form.phone}
            onChange={(e) => update("phone", e.target.value)}
            placeholder={t("producers.form.fields.phone_placeholder")}
          />
          <Input
            label={t("producers.form.fields.instagram")}
            value={form.instagram}
            onChange={(e) => update("instagram", e.target.value)}
            placeholder={t("producers.form.fields.instagram_placeholder")}
          />
          <Input
            label={t("producers.form.fields.website")}
            value={form.website}
            onChange={(e) => update("website", e.target.value)}
            placeholder={t("producers.form.fields.website_placeholder")}
          />
          <Input
            label={t("producers.form.fields.whatsapp_group")}
            value={form.whatsapp_group}
            onChange={(e) => update("whatsapp_group", e.target.value)}
            placeholder={t("producers.form.fields.whatsapp_group_placeholder")}
          />
          {/* MEH-17 — primary contact method + business email. */}
          <Field label={t("producers.form.fields.primary_contact")}>
            <select
              value={form.primary_contact_method}
              onChange={(e) => update("primary_contact_method", e.target.value)}
              className={inputClass}
            >
              <option value="whatsapp">{t("producers.form.fields.primary_contact_whatsapp")}</option>
              <option value="phone">{t("producers.form.fields.primary_contact_phone")}</option>
              <option value="website">{t("producers.form.fields.primary_contact_website")}</option>
              <option value="email">{t("producers.form.fields.primary_contact_email")}</option>
              <option value="instagram">{t("producers.form.fields.primary_contact_instagram")}</option>
              <option value="facebook">{t("producers.form.fields.primary_contact_facebook")}</option>
              <option value="external_order">{t("producers.form.fields.primary_contact_external_order")}</option>
            </select>
          </Field>
          <Input
            type="email"
            label={t("producers.form.fields.contact_email")}
            value={form.contact_email}
            onChange={(e) => update("contact_email", e.target.value)}
            placeholder={t("producers.form.fields.contact_email_placeholder")}
            dir="ltr"
          />
          {/* MEH-296 3d — new contact channels */}
          <Input
            label={t("producers.form.fields.facebook")}
            value={form.facebook}
            onChange={(e) => update("facebook", e.target.value)}
            placeholder={t("producers.form.fields.facebook_placeholder")}
            dir="ltr"
          />
          <Input
            label={t("producers.form.fields.external_order_form")}
            value={form.external_order_form}
            onChange={(e) => update("external_order_form", e.target.value)}
            placeholder={t("producers.form.fields.external_order_form_placeholder")}
            dir="ltr"
          />
          <Input
            label={t("producers.form.fields.city")}
            value={form.city}
            onChange={(e) => update("city", e.target.value)}
          />
          <Input
            label={t("producers.form.fields.slug")}
            value={form.slug}
            onChange={(e) => update("slug", e.target.value)}
            placeholder={t("producers.form.fields.slug_placeholder")}
          />
          {/* MEH-1490: admin-only Google Place ID mapping. The public trust
              line shows only when this is set AND the live Google profile has
              ≥20 reviews. place_id only — never a Maps URL (validated server-side).
              MEH-1506: "חפשי בגוגל" runs Places Text Search (name+city) and the
              admin PICKS a candidate to fill this field — no auto-select. */}
          <div className="md:col-span-2 space-y-2">
            <Input
              label={t("producers.form.fields.google_place_id")}
              value={form.google_place_id}
              onChange={(e) => update("google_place_id", e.target.value)}
              placeholder={t("producers.form.fields.google_place_id_placeholder")}
              helperText={t("producers.form.fields.google_place_id_hint")}
            />
            {producerId && (
              <div>
                <button
                  type="button"
                  onClick={handleGooglePlaceSearch}
                  disabled={placeSearching}
                  className="rounded-lg border border-border px-3 py-1.5 text-sm text-text hover:bg-background-alt disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
                >
                  {placeSearching
                    ? t("producers.form.fields.google_place_searching")
                    : t("producers.form.fields.google_place_search")}
                </button>
                <p className="mt-1 text-xs text-muted">
                  {t("producers.form.fields.google_place_search_hint")}
                </p>
                {placeSearchState === "empty" && (
                  <p className="mt-2 text-sm text-muted" role="status">
                    {t("producers.form.fields.google_place_no_results")}
                  </p>
                )}
                {placeSearchState === "error" && (
                  <p className="mt-2 text-sm text-error" role="alert">
                    {t("producers.form.fields.google_place_error")}
                  </p>
                )}
                {placeCandidates?.length > 0 && (
                  <ul className="mt-2 space-y-1.5">
                    {placeCandidates.map((c) => {
                      const lowReviews = c.user_rating_count < GOOGLE_MIN_REVIEWS;
                      return (
                        <li key={c.place_id}>
                          <button
                            type="button"
                            onClick={() => pickPlaceCandidate(c.place_id)}
                            className="w-full rounded-lg border border-border p-2.5 text-start text-sm hover:bg-background-alt focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
                          >
                            <span className="block font-medium text-text">
                              {c.display_name}
                            </span>
                            {c.formatted_address && (
                              <span className="block text-xs text-muted">
                                {c.formatted_address}
                              </span>
                            )}
                            <span className="block text-xs text-muted">
                              {t("producers.form.fields.google_place_reviews", {
                                count: c.user_rating_count,
                              })}
                            </span>
                            {lowReviews && (
                              <span className="mt-0.5 block text-xs text-error">
                                {t("producers.form.fields.google_place_low_reviews")}
                              </span>
                            )}
                          </button>
                        </li>
                      );
                    })}
                  </ul>
                )}
              </div>
            )}
          </div>
          {/* MEH-1242 PR2: raw lat/lng inputs replaced by AddressSearch
              (Nominatim geocode) — onSelect fills lat/lng/city. Raw coords
              stay editable behind the collapsed manual-edit disclosure below
              (admin escape hatch). REUSES: components/AddressSearch.jsx +
              edit/cards.jsx LocationCard. */}
          <div className="md:col-span-2">
            <label htmlFor="admin-producer-address" className="block text-sm text-muted mb-1">
              {tLoc("heading")}
            </label>
            <AddressSearch
              id="admin-producer-address"
              value={addressText}
              onChange={setAddressText}
              onSelect={handleAddressSelect}
            />
            <p className="text-xs text-muted mt-1">{tLoc("subtitle")}</p>
            {form.lat !== "" && form.lng !== "" && (
              <p className="text-xs text-muted mt-2">
                {tLoc("current_prefix")}{" "}
                <span className="text-text">
                  {form.city ? `${form.city} · ` : ""}
                  <span dir="ltr">{form.lat}, {form.lng}</span>
                </span>
              </p>
            )}
            <details className="mt-3">
              <summary className="text-xs text-primary underline cursor-pointer w-fit">
                {t("common.edit")}
              </summary>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-3">
                <Input
                  type="number"
                  step="any"
                  label={t("producers.form.fields.lat")}
                  value={form.lat}
                  onChange={(e) => update("lat", e.target.value)}
                />
                <Input
                  type="number"
                  step="any"
                  label={t("producers.form.fields.lng")}
                  value={form.lng}
                  onChange={(e) => update("lng", e.target.value)}
                />
              </div>
            </details>
          </div>
        </div>
      </Section>

      <Section title={t("producers.form.sections.categories_tags")}>
        {/* MEH-1297: primary-first + ≤3 cap hint (parity with the register CategorySelector) */}
        <p className="text-[11px] text-fg-muted mb-2">
          {t("producers.form.category_cap_hint")}
        </p>
        <div className="grid grid-cols-2 md:grid-cols-3 gap-2 mb-4">
          {categories.map((c) => {
            // MEH-1297: first-selected = primary; cap blocks new picks at 3.
            const checked = form.category_ids.includes(c.id);
            const isPrimary = form.category_ids[0] === c.id;
            const capDisabled =
              !checked && form.category_ids.length >= MAX_CATEGORIES;
            return (
              <label
                key={c.id}
                className={`flex items-center gap-2 text-sm ${
                  capDisabled ? "cursor-not-allowed opacity-50" : "cursor-pointer"
                }`}
              >
                <input
                  type="checkbox"
                  checked={checked}
                  disabled={capDisabled}
                  onChange={() => toggleCategory(c.id)}
                  className="w-4 h-4 accent-primary"
                />
                <span>{c.name}</span>
                {isPrimary && (
                  <span
                    data-testid="admin-primary-badge"
                    className="inline-flex items-center rounded-full bg-primary/10 px-2 py-0.5 text-[11px] font-medium text-primary"
                  >
                    {t("producers.form.primary_badge")}
                  </span>
                )}
              </label>
            );
          })}
        </div>
        <div className="grid grid-cols-2 md:grid-cols-3 gap-3 pt-4 border-t border-border">
          <label className="flex items-center gap-2 text-sm cursor-pointer">
            <input
              type="checkbox"
              checked={form.organic_certified}
              onChange={(e) => update("organic_certified", e.target.checked)}
              className="w-4 h-4 accent-primary"
            />
            <Leaf size={16} className="inline align-[-2px] text-primary" aria-hidden="true" /> {t("producers.form.fields.organic_certified")}
          </label>
          <label className="flex items-center gap-2 text-sm cursor-pointer">
            <input
              type="checkbox"
              checked={form.grass_fed}
              onChange={(e) => update("grass_fed", e.target.checked)}
              className="w-4 h-4 accent-primary"
            />
            <Cow size={16} className="inline align-[-2px] text-primary" aria-hidden="true" /> {t("producers.form.fields.grass_fed")}
          </label>
          {/* MEH-293: dietary checkboxes (gluten_free / vegan / lactose_free) moved to per-product. */}
          {/* MEH-766 ch3: "verified" checkbox removed — verification is the
              admin doc-grant flow (grant-verified → verified_at), not a free toggle. */}
          <label className="flex items-center gap-2 text-sm cursor-pointer">
            <input
              type="checkbox"
              checked={!!form.is_recommended}
              onChange={(e) => update("is_recommended", e.target.checked)}
              className="w-4 h-4 accent-accent"
            />
            {t("producers.form.fields.recommended")}
          </label>
          <Field label={t("producers.form.fields.kosher")}>
            <select
              value={form.kosher}
              onChange={(e) => update("kosher", e.target.value)}
              className={inputClass}
            >
              {KOSHER_OPTIONS.map((k) => (
                <option key={k} value={k}>
                  {kosherLabel(k)}
                </option>
              ))}
            </select>
          </Field>
          {/* MEH-1508 ch2: business-level dietary scope — admin sees + cross-checks
              the owner's declaration during manual approval. YES/NO → all/some for
              vegan/vegetarian; 3-way facility state for gluten. Lactose omitted
              (§6.3). Copy is the owner form's locked §6.5 strings (tDiet). */}
          <Field label={tDiet("q_vegan")}>
            <select
              value={form.vegan_scope}
              onChange={(e) => update("vegan_scope", e.target.value)}
              className={inputClass}
            >
              <option value="all">{tDiet("opt_yes")}</option>
              <option value="some">{tDiet("opt_no")}</option>
              <option value="unknown">{tDiet("opt_unknown")}</option>
            </select>
          </Field>
          <Field label={tDiet("q_vegetarian")}>
            <select
              value={form.vegetarian_scope}
              onChange={(e) => update("vegetarian_scope", e.target.value)}
              className={inputClass}
            >
              <option value="all">{tDiet("opt_yes")}</option>
              <option value="some">{tDiet("opt_no")}</option>
              <option value="unknown">{tDiet("opt_unknown")}</option>
            </select>
          </Field>
          <Field label={tDiet("q_gluten")}>
            <select
              value={form.gluten_free_facility}
              onChange={(e) => update("gluten_free_facility", e.target.value)}
              className={inputClass}
            >
              <option value="dedicated">{tDiet("gluten_dedicated")}</option>
              <option value="shared">{tDiet("gluten_shared")}</option>
              <option value="unknown">{tDiet("opt_unknown")}</option>
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
        />
      </Section>

      {/* MEH-213 — location type */}
      <Section title={t("producers.form.sections.business_type")}>
        <div className="space-y-3">
          <label className="flex items-center gap-2 text-sm cursor-pointer">
            <input
              type="checkbox"
              checked={form.has_physical_location}
              onChange={(e) => update("has_physical_location", e.target.checked)}
              className="w-4 h-4 accent-primary"
            />
            {t("producers.form.fields.has_physical_location")}
          </label>
          <label className="flex items-center gap-2 text-sm cursor-pointer">
            <input
              type="checkbox"
              checked={form.offers_delivery}
              onChange={(e) => update("offers_delivery", e.target.checked)}
              className="w-4 h-4 accent-primary"
            />
            {t("producers.form.fields.offers_delivery")}
          </label>
          {!form.has_physical_location && !form.offers_delivery && (
            <p className="text-xs text-red-600">{t("producers.form.fields.type_validation")}</p>
          )}
          {form.offers_delivery && (
            <div className="ms-6 space-y-3 border-s-2 border-border ps-4 pt-1">
              <label className="flex items-center gap-2 text-sm cursor-pointer">
                <input
                  type="checkbox"
                  checked={form.delivery_nationwide}
                  onChange={(e) => {
                    update("delivery_nationwide", e.target.checked);
                    // Clear cities entering nationwide; clear exclusions leaving it.
                    if (e.target.checked) update("delivery_cities", []);
                    else update("delivery_excluded_cities", []);
                  }}
                  className="w-4 h-4 accent-primary"
                />
                {t("producers.form.fields.delivery_nationwide")}
              </label>
              {!form.delivery_nationwide && (
                <div>
                  <span className="block text-sm text-muted mb-1">{t("producers.form.fields.delivery_cities_label")}</span>
                  <CitiesAutocomplete
                    value={form.delivery_cities}
                    onChange={(cities) => update("delivery_cities", cities)}
                    showRegionChips
                  />
                  {form.delivery_cities.length === 0 && (
                    <p className="text-xs text-red-600 mt-1">{t("producers.form.fields.delivery_cities_required")}</p>
                  )}
                </div>
              )}
              {/* MEH-1255: nationwide exclusion list — "לכל הארץ חוץ מ:" */}
              {form.delivery_nationwide && (
                <div>
                  <span className="block text-sm text-muted mb-1">{t("producers.form.fields.delivery_excluded_label")}</span>
                  <p className="text-xs text-fg-muted mb-1">{t("producers.form.fields.delivery_excluded_hint")}</p>
                  <CitiesAutocomplete
                    value={form.delivery_excluded_cities}
                    onChange={(cities) => update("delivery_excluded_cities", cities)}
                    showRegionChips
                  />
                </div>
              )}
            </div>
          )}
        </div>
      </Section>

      <Section title={t("producers.form.sections.delivery_pickup")}>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <label className="flex items-center gap-2 text-sm cursor-pointer">
            <input
              type="checkbox"
              checked={form.has_delivery}
              onChange={(e) => update("has_delivery", e.target.checked)}
              className="w-4 h-4 accent-primary"
            />
            {t("producers.form.fields.has_delivery")}
          </label>
          <label className="flex items-center gap-2 text-sm cursor-pointer">
            <input
              type="checkbox"
              checked={form.pickup_points}
              onChange={(e) => update("pickup_points", e.target.checked)}
              className="w-4 h-4 accent-primary"
            />
            {t("producers.form.fields.pickup_points")}
          </label>
          {/* MEH-903 A: the legacy comma-separated delivery_area_cities input was
              removed — cities are now entered once via the CitiesAutocomplete in
              the location-mode block above (single store: delivery_areas). */}
        </div>
      </Section>

      <Section title={t("producers.form.sections.description_price")}>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="md:col-span-2">
            <Input
              label={t("producers.form.fields.short_description")}
              value={form.short_description}
              onChange={(e) => update("short_description", e.target.value)}
            />
          </div>
          <Field label={t("producers.form.fields.description_full")} full>
            <textarea
              value={form.description}
              onChange={(e) => update("description", e.target.value)}
              className={`${inputClass} h-28 resize-none`}
            />
          </Field>
          <Input
            label={t("producers.form.fields.top_product")}
            value={form.top_product_name}
            onChange={(e) => update("top_product_name", e.target.value)}
            placeholder={t("producers.form.fields.top_product_placeholder")}
          />
          <Input
            label={t("producers.form.fields.price_range")}
            value={form.price_range}
            onChange={(e) => update("price_range", e.target.value)}
            placeholder={t("producers.form.fields.price_range_placeholder")}
          />
        </div>
      </Section>

      <Section title={t("producers.form.sections.images")}>
        <input
          type="file"
          accept="image/*"
          multiple
          onChange={handleImageUpload}
          disabled={isBusy("producer-images")}
          className="text-sm"
        />
        {isBusy("producer-images") && <p className="text-sm text-muted mt-2">{t("producers.form.uploading")}</p>}
        {form.images?.length > 0 && (
          <div className="grid grid-cols-3 md:grid-cols-5 gap-3 mt-4">
            {form.images.map((url) => (
              <div key={url} className="relative group">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={optimizeCloudinary(url)}
                  alt=""
                  className="w-full h-24 object-cover rounded-[8px] border border-border"
                />
                <button
                  type="button"
                  onClick={() => removeImage(url)}
                  className="absolute top-1 start-1 bg-red-500 text-white rounded-full w-6 h-6 inline-flex items-center justify-center opacity-0 group-hover:opacity-100 transition"
                  aria-label={t("common.delete")}
                >
                  <X size={14} weight="bold" aria-hidden="true" />
                </button>
              </div>
            ))}
          </div>
        )}
      </Section>

      <Section title={t("producers.form.sections.hours")}>
        <Input
          label={t("producers.form.fields.opening_hours_label")}
          value={form.opening_hours}
          onChange={(e) => update("opening_hours", e.target.value)}
          placeholder={t("producers.form.fields.opening_hours_placeholder")}
          dir="ltr"
        />
      </Section>

      <Section title={<>{t("producers.form.sections.availability")} <InfoTooltip content={t("producers.form.sections.availability_tooltip")} label={t("producers.form.sections.availability_tooltip_label")} position="bottom" /></>}>
        <div className="flex flex-wrap gap-2 mb-3">
          {[
            { value: "accepting_orders", labelKey: "producers.form.fields.avail_accepting" },
            { value: "available_today",  labelKey: "producers.form.fields.avail_today" },
            { value: "full_this_week",   labelKey: "producers.form.fields.avail_full" },
            { value: "on_vacation",      labelKey: "producers.form.fields.avail_vacation" },
          ].map(({ value, labelKey }) => (
            <button
              key={value}
              type="button"
              onClick={() => update("availability_state", value)}
              className={`px-4 py-1.5 rounded-full text-sm border transition ${
                form.availability_state === value
                  ? "bg-primary text-white border-primary"
                  : "border-border text-text hover:border-primary"
              }`}
            >
              {t(labelKey)}
            </button>
          ))}
        </div>
        {form.availability_state === "on_vacation" && (
          <Input
            type="date"
            label={t("producers.form.fields.vacation_until")}
            value={form.vacation_until}
            min={new Date().toISOString().slice(0, 10)}
            onChange={(e) => update("vacation_until", e.target.value)}
            dir="ltr"
          />
        )}
      </Section>

      <Section title={t("producers.form.sections.admin_notes")}>
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
            isBusy("producer-save") ||
            (!form.has_physical_location && !form.offers_delivery) ||
            (form.offers_delivery && !form.delivery_nationwide && form.delivery_cities.length === 0)
          }
          className="bg-primary text-white px-8 py-3 rounded-[12px] hover:bg-primary-dark transition font-medium disabled:opacity-50"
        >
          {isBusy("producer-save") ? t("common.saving") : producerId ? t("producers.form.submit_update") : t("producers.form.submit_create")}
        </button>
        <button
          type="button"
          onClick={() => router.push("/admin?tab=producers")}
          className="bg-white border border-border px-8 py-3 rounded-[12px] hover:bg-background transition"
        >
          {t("common.cancel")}
        </button>
      </div>
    </form>
  );
}
