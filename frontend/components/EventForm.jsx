// @ts-check
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
 *           carries server/network errors only);
 *           MEH-2932 (pick one of the business's SAVED locations instead of
 *           retyping it — see the saved-locations block below);
 *           MEH-3751 (create mode opens with «יש לכם מודעה על האירוע?»,
 *           FormFillBox: a pasted post fills the fields as a draft, nothing is
 *           saved until the owner presses publish; every field carries a «?»,
 *           FieldHelpLabel, whose text is events.form.help.<key>, the keys of
 *           backend/app/data/form_maps/event.json);
 *           MEH-3873 (`adminProducerId`: the same form, saved by an admin for
 *           that business through /admin/producers/{id}/events and
 *           /admin/events/{id}, with a required «בית העסק אישר» box whose
 *           value goes out as `owner_consent: true`).
 */

import { useEffect, useState } from "react";
import { Link } from "@/i18n/navigation";
import { useTranslations } from "next-intl";
import { X } from "@phosphor-icons/react";
import api from "@/lib/api";
import { detailToMessage, isUnverifiedEmailError } from "@/lib/errors";
import { showToast } from "@/lib/toast";
import CitySearch from "@/components/CitySearch";
import AddressSearch from "@/components/AddressSearch";
import Input from "@/components/ui/Input";
import UnverifiedEmailNotice from "@/components/UnverifiedEmailNotice";
import CollectionNotice from "@/components/CollectionNotice";
import { EVENT_CATEGORIES as CATEGORY_KEYS } from "@/lib/event-categories";
import Button from "@/components/ui/Button";
import RegistrationMethodField from "@/components/RegistrationMethodField";
import InlineMessage from "@/components/ui/InlineMessage";
import FieldHelpLabel from "@/components/FieldHelpLabel";
import FormFillBox from "@/components/FormFillBox";
import Checkbox from "@/components/ui/Checkbox"; // MEH-3873
import { applyEventDraft, eventDraftKeys } from "@/lib/event-draft";

const DEFAULTS = {
  title: "",
  description: "",
  event_date: "",
  event_time: "",
  end_time: "", // MEH-2469
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
  // MEH-2766: «איך נרשמים?» — a new event defaults to the on-site form.
  registration_method: "site_form",
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
    end_time: initial.end_time ? String(initial.end_time).slice(0, 5) : "", // MEH-2469
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
    registration_method: initial.registration_method ?? "site_form",
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
  "end_time",
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

function validateEventForm(f, t, tReg) {
  /** @type {Record<string, string>} */
  const errors = {};
  if (!f.title.trim()) errors.title = t("error_title_required");
  if (!f.event_date) errors.event_date = t("error_date_required");
  // MEH-2013: both are labelled `*`. `city` was enforced nowhere; `category`
  // WAS enforced server-side, but the form is noValidate so the native
  // `required` on the <select> is dead — the only failure path was a raw 422
  // with no message beside the field.
  // MEH-2469: same rule as the server (schemas.py event_end_time_problem):
  // an end time needs a start time and must be after it. "HH:MM" strings
  // compare correctly as text.
  if (f.end_time && (!f.event_time || f.end_time <= f.event_time)) {
    errors.end_time = t("error_end_time_after_start");
  }
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
  // MEH-2766: the URL is asked for (and sent) only when the owner picked the
  // external link; the server rejects external_url without one.
  if (f.registration_method === "external_url") {
    const url = f.registration_url.trim();
    if (!url) errors.registration_url = tReg("external_needs_url");
    else if (!isNativeValidUrl(url)) errors.registration_url = t("error_invalid_url");
  }
  return errors;
}

/**
 * @param {object} props
 * @param {"create"|"edit"} [props.mode]
 * @param {object|null} [props.initial]  event (EventOut) to prefill in edit mode
 * @param {(data:object)=>void} props.onSuccess  called with the created/updated event
 * @param {string} [props.cancelHref]  where the cancel link points
 * @param {boolean} [props.emailUnverified]  MEH-2918: show the verify notice up front
 * @param {string|null} [props.adminProducerId]  MEH-3873: an admin writes for this business
 * @param {() => void} [props.onCancel]  MEH-3873: cancel in place instead of the cancel link
 */
// MEH-2918: emailUnverified (from the page's useAuth) shows the verify notice
// up front; a 403 still shows it (and re-mounts it focused) when the prop is stale.
export default function EventForm({ mode = "create", initial = null, onSuccess, cancelHref = "/producer/dashboard", emailUnverified = false, adminProducerId = null, onCancel = undefined }) {
  const t = useTranslations("sweep_tail.event_new");
  const tReg = useTranslations("registration.form");
  const tCat = useTranslations("events.categories");
  const tForm = useTranslations("events.form"); // MEH-3751
  const help = (key) => tForm(`help.${key}`);
  // MEH-1981: notice-at-collection (copy approved verbatim 02/09, rule 22).
  const tNotice = useTranslations("privacy.collection_notice");
  const tPrivacyLink = useTranslations("auth.register.consumer.terms");
  const tAdmin = useTranslations("admin.business_events"); // MEH-3873
  // MEH-3873: the admin's confirmation that the business agreed, every save.
  const [ownerConsent, setOwnerConsent] = useState(false);

  // MEH-2932: the business's own selling points, so an event at one of them is
  // a choice rather than a retype. Read-only here — the rows are owned by the
  // dashboard's LocationsEditor, and this form never writes them.
  //
  // Deliberately fail-OPEN and silent: the picker is an addition to a form that
  // worked without it, so a failed read (or a business with none saved) leaves
  // exactly the fields that were always there. An error banner here would be
  // about a convenience the seller never asked for.
  const [savedLocations, setSavedLocations] = useState([]);
  // "" = nothing chosen (the seller chooses; the form does not choose for her),
  // a row id = that saved point, "other" = she is typing an address herself.
  const [locationChoice, setLocationChoice] = useState("");

  useEffect(() => {
    let cancelled = false;
    api
      .get(adminProducerId ? `/admin/producers/${adminProducerId}/locations` : "/producers/me/locations")
      .then((r) => {
        if (!cancelled) setSavedLocations(Array.isArray(r.data) ? r.data : []);
      })
      .catch(() => {
        if (!cancelled) setSavedLocations([]);
      });
    return () => {
      cancelled = true;
    };
  }, [adminProducerId]);

  // label · address · city, skipping whatever the row does not carry. Built
  // from the row rather than from a copy string, so a business that named her
  // point «הדוכן בשוק» sees that name and not a generic "location 2".
  const describeLocation = (loc) =>
    [loc.label, loc.address, loc.city].filter((part) => part && part.trim()).join(" · ");

  const chooseSavedLocation = (loc) => {
    setLocationChoice(loc.id);
    setForm((f) => ({
      ...f,
      location: loc.address || loc.label || f.location,
      city: loc.city || f.city,
      // Cleared, not kept: a point with no pin must not inherit the previous
      // point's coordinates and put the event somewhere it is not.
      lat: loc.lat ?? null,
      lng: loc.lng ?? null,
    }));
    setFieldErrors((errs) => (errs.city ? { ...errs, city: undefined } : errs));
  };

  // Typing over a filled address means it is no longer that saved point. Moving
  // the radio keeps the control honest; leaving it checked would claim an
  // address the fields no longer hold.
  const markAddressEdited = () => {
    setLocationChoice((choice) => (choice && choice !== "other" ? "other" : choice));
  };
  const [form, setForm] = useState(() => seed(initial));
  const [error, setError] = useState("");
  const [fieldErrors, setFieldErrors] = useState(/** @type {Record<string, string>} */ ({}));
  const [unverifiedHits, setUnverifiedHits] = useState(0); // MEH-2918: 403 count, re-mounts the notice
  const [submitting, setSubmitting] = useState(false);
  const [uploading, setUploading] = useState(false);

  const isEdit = mode === "edit";
  // MEH-3751: a draft replaces what it fills; a drafted address is no longer
  // a saved point, and a filled field stops showing its old error.
  const onDraft = (draft) => {
    const filled = eventDraftKeys(draft);
    setForm((f) => applyEventDraft(f, draft));
    if (filled.includes("location") || filled.includes("city")) markAddressEdited();
    setFieldErrors((errs) => {
      const next = { ...errs };
      for (const key of filled) delete next[key];
      return next;
    });
  };
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
    setUnverifiedHits(0);

    const errors = validateEventForm(form, t, tReg);
    if (adminProducerId && !ownerConsent) errors.owner_consent = tAdmin("consent_required");
    if (Object.keys(errors).length > 0) {
      setFieldErrors(errors);
      const firstInvalid = [...EVENT_FIELD_ORDER, "owner_consent"].find((field) => errors[field]);
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
        end_time: form.end_time || null, // MEH-2469
        registration_url:
          form.registration_method === "external_url" ? form.registration_url.trim() || null : null,
      };
      const r = adminProducerId
        ? isEdit
          ? await api.put(`/admin/events/${initial.id}`, { ...payload, owner_consent: true })
          : await api.post(`/admin/producers/${adminProducerId}/events`, { ...payload, owner_consent: true })
        : isEdit
          ? await api.put(`/events/${initial.id}`, payload)
          : await api.post("/events", payload);
      // MEH-3213: awaited, so the button stays disabled while the page decides
      // where to land (events/new may still be asking for the business status).
      await onSuccess?.(r.data);
    } catch (err) {
      if (isUnverifiedEmailError(err)) {
        setUnverifiedHits((h) => h + 1);
      } else {
        setError(detailToMessage(err.response?.data?.detail) || t("error_generic"));
      }
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <>
      {(unverifiedHits > 0 || emailUnverified) && <UnverifiedEmailNotice key={unverifiedHits} live={unverifiedHits > 0} focusOnMount={unverifiedHits > 0} className="mb-4" />}
      {error && (
        <InlineMessage as="div" variant="box" className="rounded-sm p-3 mb-4">
          {error}
        </InlineMessage>
      )}

      {/* MEH-3873: the paste-to-fill box reads /producers/me (owner only). */}
      {!isEdit && !adminProducerId && (
        <div className="mb-5">
          <FormFillBox form="event" title={tForm("fill.title")} intro={tForm("fill.intro")} onDraft={onDraft} />
        </div>
      )}

      <form onSubmit={handleSubmit} noValidate className="space-y-5">
        <FieldHelpLabel htmlFor="title" label={t("field_title_label")} help={help("title")} required testId="event-help-title" />
        <Input
          id="title"
          type="text"
          required
          value={form.title}
          onChange={update("title")}
          placeholder={t("field_title_placeholder")}
          error={fieldErrors.title}
        />

        <Field id="description" label={t("field_description_label")} help={help("description")}>
          <textarea
            id="description"
            rows={4}
            value={form.description}
            onChange={update("description")}
            className="input-base resize-none"
            placeholder={t("field_description_full_placeholder")}
          />
        </Field>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
          <div>
            <FieldHelpLabel htmlFor="event_date" label={t("field_date_label")} help={help("event_date")} required testId="event-help-event_date" />
            <Input
              id="event_date"
              type="date"
              required
              value={form.event_date}
              onChange={update("event_date")}
              error={fieldErrors.event_date}
            />
          </div>
          <div>
            <FieldHelpLabel htmlFor="event_time" label={t("field_time_label")} help={help("event_time")} testId="event-help-event_time" />
            <Input id="event_time" type="time" value={form.event_time} onChange={update("event_time")} />
          </div>
          {/* MEH-2469: optional end time — shown as «09:30–15:00». */}
          <div>
            <FieldHelpLabel htmlFor="end_time" label={t("field_end_time_label")} help={help("end_time")} testId="event-help-end_time" />
            <Input
              id="end_time"
              type="time"
              value={form.end_time}
              onChange={update("end_time")}
              error={fieldErrors.end_time}
            />
          </div>
        </div>

        {/* MEH-2932: only when there is something to choose. A business with no
            saved points sees the form exactly as it was — no empty picker, no
            «כתובת אחרת» with nothing to be other than (CLAUDE.md, 5-state rule:
            the 0-item cell is its own state, not a degenerate list). */}
        {savedLocations.length > 0 && (
          <fieldset className="space-y-2" data-testid="event-saved-locations">
            <legend className="block text-sm font-medium text-text mb-1 text-start">
              {t("saved_location_legend")}
            </legend>
            {savedLocations.map((loc) => (
              <label
                key={loc.id}
                htmlFor={`saved-location-${loc.id}`}
                className="flex items-center gap-3 min-h-touch cursor-pointer"
              >
                <input
                  type="radio"
                  id={`saved-location-${loc.id}`}
                  name="saved-location"
                  data-testid={`event-saved-location-${loc.id}`}
                  checked={locationChoice === loc.id}
                  onChange={() => chooseSavedLocation(loc)}
                  className="w-5 h-5 accent-primary shrink-0"
                />
                <span className="text-sm text-text">{describeLocation(loc)}</span>
              </label>
            ))}
            <label
              htmlFor="saved-location-other"
              className="flex items-center gap-3 min-h-touch cursor-pointer"
            >
              <input
                type="radio"
                id="saved-location-other"
                name="saved-location"
                data-testid="event-saved-location-other"
                checked={locationChoice === "other"}
                // Chosen, not cleared: she may already have typed something,
                // and "I'll write my own" is no reason to throw it away.
                onChange={() => setLocationChoice("other")}
                className="w-5 h-5 accent-primary shrink-0"
              />
              <span className="text-sm text-text">{t("saved_location_other")}</span>
            </label>
          </fieldset>
        )}

        <div>
          <FieldHelpLabel htmlFor="location" label={t("field_location_label")} help={help("location")} testId="event-help-location" />
          {/* MEH-1404: AddressSearch fills location text (onChange) + lat/lng
              (onSelect). Free-text still allowed — coords stay null unless a
              suggestion is picked. MEH-1405: the visible <label htmlFor> above is
              the sole label (no `label` prop → no duplicate sr-only association). */}
          <AddressSearch
            id="location"
            value={form.location}
            onChange={(val) => {
              markAddressEdited(); // MEH-2932
              setForm((f) => ({ ...f, location: val }));
            }}
            onSelect={(picked) => {
              markAddressEdited(); // MEH-2932
              setForm((f) => ({
                ...f,
                location: picked.street || picked.displayName || f.location,
                lat: picked.lat ?? null,
                lng: picked.lng ?? null,
              }));
            }}
            placeholder={t("field_location_simple_placeholder")}
          />
        </div>

        <div>
          <FieldHelpLabel htmlFor="city" label={t("field_city_label")} help={help("city")} required testId="event-help-city" />
          <CitySearch
            id="city"
            required
            label={t("field_city_label")}
            value={form.city}
            onChange={(val) => {
              markAddressEdited(); // MEH-2932
              setForm((f) => ({ ...f, city: val }));
              // MEH-2013: CitySearch reports a value, not an event, so it does
              // not go through `update()` — clear its error the same way.
              setFieldErrors((errs) => (errs.city ? { ...errs, city: undefined } : errs));
            }}
            placeholder={t("field_city_placeholder")}
            aria-describedby={fieldErrors.city ? "city-error" : undefined}
            aria-invalid={fieldErrors.city ? true : undefined}
          />
          {/* MEH-2013: CitySearch has no error prop, so the message renders
              beside it here. MEH-2022 closed the half this comment used to
              flag: the input now references it via aria-describedby above. */}
          {fieldErrors.city && (
            <span id="city-error" className="text-xs text-error mt-1 block">
              {fieldErrors.city}
            </span>
          )}
        </div>

        <Field id="category" label={t("field_category_label")} help={help("category")} required error={fieldErrors.category}>
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
          <div>
            <FieldHelpLabel htmlFor="price" label={t("field_price_label_full")} help={help("price")} testId="event-help-price" />
            <Input id="price" type="number" min="0" value={form.price} onChange={update("price")} error={fieldErrors.price} />
          </div>
          <div>
            <FieldHelpLabel
              htmlFor="max_participants"
              label={t("field_max_participants_label_full")}
              help={help("max_participants")}
              testId="event-help-max_participants"
            />
            <Input
              id="max_participants"
              type="number"
              min="1"
              value={form.max_participants}
              onChange={update("max_participants")}
              placeholder={t("field_max_participants_hint")}
              error={fieldErrors.max_participants}
            />
          </div>
        </div>

        <div>
          <FieldHelpLabel label={t("image_label")} help={help("image_url")} testId="event-help-image_url" />
          {/* MEH-2546: why upload — rows show the event photo first, and only
              fall back to the owner's photo or a category tile without one. */}
          {!form.image_url && (
            <p className="text-xs text-fg-muted mb-2" data-testid="event-image-why">
              {t("image_why")}
            </p>
          )}
          {form.image_url ? (
            <div className="flex items-center gap-3">
              {/* raw img: upload preview. `form.image_url` is whatever POST /upload returned —
                  a Cloudinary secure_url OR the local /placeholder-image.png fallback
                  (upload.py:115). Mixed provenance, authenticated form chrome, 96px. */}
              {/* MEH-2031: NOT alt="" (decorative). A successful upload has no
                  live region, so this preview appearing IS the success state —
                  with an empty alt a screen-reader user is told nothing at all
                  and has to infer it from a remove button materialising nearby.
                  The field label is reused rather than inventing copy, so there
                  is no new key and the en twin already exists.
                  REUSES: components/ExperienceForm.jsx:465-476 (MEH-2012). */}
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={form.image_url}
                alt={t("image_label")}
                className="w-24 h-24 object-cover rounded-sm border border-border"
              />
              <button
                type="button"
                onClick={() => setForm((f) => ({ ...f, image_url: "" }))}
                aria-label={t("image_remove_aria")}
                className="inline-flex items-center gap-1 text-sm text-danger-600 hover:underline"
              >
                <X size={14} weight="bold" aria-hidden="true" />
                {t("image_remove")}
              </button>
            </div>
          ) : (
            /* MEH-2031: `sr-only`, NOT `hidden`. `hidden` is display:none, which
               removes the input from the tab order — and the wrapping <label> is
               not natively focusable, so the whole upload control was unreachable
               by keyboard (WCAG 2.1.1, Level A). sr-only keeps the input focusable
               while invisible, and `focus-within` on the wrapper renders the ring
               the sighted keyboard user needs. Same idiom as AddressSearch.jsx:196
               and CitiesAutocomplete.jsx:206, and the form this file's widget was
               copied to. Four more `hidden` file inputs remain (ProductsSection
               :811/:829, RecipeForm:290, dashboard/edit/cards.jsx:382) — inventory
               on MEH-2031, deliberately out of this diff.
               REUSES: components/ExperienceForm.jsx:499-514 (MEH-2012). */
            <label className="flex flex-col items-center justify-center text-center text-sm text-fg-muted border border-dashed border-border rounded-sm px-4 py-6 cursor-pointer hover:bg-green-50 transition focus-within:border-primary focus-within:ring-2 focus-within:ring-primary">
              <input
                type="file"
                accept="image/*"
                className="sr-only"
                disabled={uploading}
                onChange={handleImageUpload}
              />
              {uploading ? <span>{t("image_uploading")}</span> : <span>{t("image_upload_hint")}</span>}
            </label>
          )}
        </div>

        <RegistrationMethodField
          value={form.registration_method}
          onChange={(m) => {
            setForm((f) => ({ ...f, registration_method: m }));
            setFieldErrors((errs) => (errs.registration_url ? { ...errs, registration_url: undefined } : errs));
          }}
          url={form.registration_url}
          onUrlChange={(v) => update("registration_url")({ target: { value: v } })}
          urlError={fieldErrors.registration_url}
        />

        <CollectionNotice
          message={tNotice("event")}
          linkLabel={tPrivacyLink("privacy_link")}
          testId="event-collection-notice"
        />

        {adminProducerId && (
          <div>
            <Checkbox
              id="owner_consent"
              checked={ownerConsent}
              onChange={(e) => {
                setOwnerConsent(e.target.checked);
                setFieldErrors((errs) => (errs.owner_consent ? { ...errs, owner_consent: undefined } : errs));
              }}
              aria-describedby={fieldErrors.owner_consent ? "owner_consent-error" : undefined}
              data-testid="event-owner-consent"
            >
              {tAdmin("consent_label")}
            </Checkbox>
            {fieldErrors.owner_consent && (
              <span id="owner_consent-error" className="text-xs text-error mt-1 block">
                {fieldErrors.owner_consent}
              </span>
            )}
          </div>
        )}

        <div className="flex gap-3 pt-4">
          <Button
            type="submit"
            disabled={submitting || uploading}
            variant="primary" size="lg"
          >
            {submitting ? (isEdit ? t("saving") : t("submit_publishing")) : isEdit ? t("save") : t("submit")}
          </Button>
          {onCancel ? (
            <Button type="button" variant="outlined" size="lg" onClick={onCancel}>
              {t("cancel")}
            </Button>
          ) : (
            <Link
              href={cancelHref}
              className="border border-border text-text px-6 py-3 rounded-sm hover:bg-green-50 transition"
            >
              {t("cancel")}
            </Link>
          )}
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
// that noValidate left as the only failure path. MEH-3751: the label is
// FieldHelpLabel (label + «?»), which keeps the aria-hidden asterisk of MEH-2015.
/** @param {{ id: string, label: string, help: string, required?: boolean, error?: import("react").ReactNode, children?: import("react").ReactNode }} props */
function Field({ id, label, help, required, error, children }) {
  return (
    <div>
      <FieldHelpLabel htmlFor={id} label={label} help={help} required={required} testId={`event-help-${id}`} />
      {children}
      {error && (
        <span id={`${id}-error`} className="text-xs text-error mt-1 block">
          {error}
        </span>
      )}
    </div>
  );
}
