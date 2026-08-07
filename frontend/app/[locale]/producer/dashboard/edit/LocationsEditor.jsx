/**
 * Module:   LocationsEditor
 * Purpose:  Owner CRUD for producer_locations (branch / pickup / market_stand)
 *           in the dashboard — the write UI for the map's per-location pins.
 *           Mirrors ProductsSection's list/add/edit/delete shape.
 * Touches:  GET/POST/PUT/DELETE /producers/me/locations (owner-scoped, IDOR
 *           403 + single-primary + same-city-label enforced server-side).
 * Does NOT: render a map PICKER, drag a pin, reverse-geocode, or import
 *           locations. Since MEH-1936 it DOES geocode — via AddressSearch, the
 *           same canonical component the register flow uses — but the map it
 *           shows is read-only confirmation, not an input. Map rendering of
 *           these rows on the public surfaces lives in MapComponent (chunk 3).
 * Related:  frontend/lib/schemas.js:LocationInputSchema (Rule-19 safeParse);
 *           backend/app/routers/producer_me.py (CRUD + invariants);
 *           frontend/app/[locale]/register/producer/RegisterProducerClient.jsx
 *           :987-1116 (the flow this editor was aligned to).
 * History:  MEH-1421 (creation, MEH-1388 chunk 4a); MEH-1563 (field-guidance
 *           layer per the MEH-1539 standard — card intro, per-field hints,
 *           example placeholders, lat/lng behind a collapsed disclosure);
 *           MEH-1936 (CitySearch + AddressSearch + MiniMap confirmation —
 *           closes the geocoding gap MEH-1421 deferred).
 */
"use client";

import { useCallback, useEffect, useId, useState } from "react";
import dynamic from "next/dynamic";
import { useTranslations } from "next-intl";
import {
  CheckCircle,
  MapPin,
  Pencil,
  Plus,
  Star,
  Trash,
  X,
} from "@phosphor-icons/react";

import api from "@/lib/api";
import { detailToMessage } from "@/lib/errors";
import { showToast } from "@/lib/toast";
import { LocationInputSchema } from "@/lib/schemas";
import EmptyState from "@/components/ui/EmptyState";
import CitySearch from "@/components/CitySearch";
import AddressSearch from "@/components/AddressSearch";

// Leaflet touches `window` at import time, so the confirmation map is loaded
// client-side only. REUSES: RegisterProducerClient.jsx:24 — same dynamic import
// for the same component in the same confirmation role.
const MiniMap = dynamic(() => import("@/components/MiniMap"), { ssr: false });

// Street-level framing for an "is this the right spot?" check, matching the
// register confirmation. MiniMap's own default (neighbourhood) is for reading a
// business page, not for verifying a pin. MEH-1808 added the prop.
const ADDRESS_CONFIRM_ZOOM = 16;

// AddressSearch's own minimum query length (AddressSearch.jsx:79). Below it no
// lookup has been issued, so nothing has failed yet.
const ADDRESS_QUERY_FLOOR = 3;

const KINDS = ["branch", "pickup", "market_stand"];
const EMPTY_FORM = {
  kind: "branch",
  label: "",
  city: "",
  address: "",
  // MEH-1936 — UI-ONLY. The town the geocoder resolved for the picked point,
  // used to caption the confirmation. Deliberately absent from buildPayload:
  // LocationInputSchema is unchanged and the backend contract carries no such
  // field. REUSES: RegisterProducerClient.jsx `address_city`, same role.
  address_city: "",
  lat: "",
  lng: "",
  opening_hours: "",
  phone: "",
  location_precision: "exact",
  is_primary: false,
};

// Form strings → the typed payload LocationInputSchema validates. Empty text →
// null (optional server fields); lat/lng "" → null, else Number (a NaN trips the
// schema's numeric bound → Hebrew toast).
function buildPayload(form) {
  const num = (v) => (String(v).trim() === "" ? null : Number(v));
  const str = (v) => (v && v.trim() !== "" ? v.trim() : null);
  return {
    kind: form.kind,
    label: str(form.label),
    city: str(form.city),
    address: str(form.address),
    lat: num(form.lat),
    lng: num(form.lng),
    opening_hours: str(form.opening_hours),
    phone: str(form.phone),
    location_precision: form.location_precision,
    is_primary: !!form.is_primary,
  };
}

function toEditForm(loc) {
  return {
    kind: loc.kind || "branch",
    label: loc.label || "",
    city: loc.city || "",
    address: loc.address || "",
    // Not persisted, so an edit starts without it and the confirmation caption
    // falls back to the saved `city` — which is the right caption for a row
    // whose coordinates were entered by hand and never geocoded at all.
    address_city: "",
    lat: loc.lat != null ? String(loc.lat) : "",
    lng: loc.lng != null ? String(loc.lng) : "",
    opening_hours: loc.opening_hours || "",
    phone: loc.phone || "",
    location_precision: loc.location_precision || "exact",
    is_primary: !!loc.is_primary,
  };
}

export default function LocationsEditor() {
  const t = useTranslations("settings.locations");
  const tForm = useTranslations("settings.locations.form");
  const tKind = useTranslations("settings.locations.kind");
  const [locations, setLocations] = useState(null);
  const [loadError, setLoadError] = useState(false);
  const [reloadKey, setReloadKey] = useState(0);
  const [adding, setAdding] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [saving, setSaving] = useState(false);
  const [deletingId, setDeletingId] = useState(null);

  useEffect(() => {
    setLoadError(false);
    api
      .get("/producers/me/locations")
      .then((r) => setLocations(r.data))
      .catch(() => setLoadError(true));
  }, [reloadKey]);

  const reload = useCallback(() => setReloadKey((k) => k + 1), []);

  // Rule 19: safeParse before every write. Returns the validated payload or null
  // (after toasting the first issue) so callers bail cleanly.
  const validate = useCallback((form) => {
    const parsed = LocationInputSchema.safeParse(buildPayload(form));
    if (!parsed.success) {
      showToast.info(parsed.error.issues[0].message);
      return null;
    }
    return parsed.data;
  }, []);

  const handleCreate = useCallback(
    async (form) => {
      const body = validate(form);
      if (!body) return;
      setSaving(true);
      try {
        await api.post("/producers/me/locations", body);
        setAdding(false);
        reload();
      } catch (err) {
        showToast.error(
          detailToMessage(err?.response?.data?.detail) || t("errors.save_failed"),
        );
      } finally {
        setSaving(false);
      }
    },
    [validate, reload, t],
  );

  const handleUpdate = useCallback(
    async (id, form) => {
      const body = validate(form);
      if (!body) return;
      setSaving(true);
      try {
        await api.put(`/producers/me/locations/${id}`, body);
        setEditingId(null);
        reload();
      } catch (err) {
        showToast.error(
          detailToMessage(err?.response?.data?.detail) || t("errors.save_failed"),
        );
      } finally {
        setSaving(false);
      }
    },
    [validate, reload, t],
  );

  const handleSetPrimary = useCallback(
    async (id) => {
      try {
        await api.put(`/producers/me/locations/${id}`, { is_primary: true });
        reload();
      } catch (err) {
        showToast.error(
          detailToMessage(err?.response?.data?.detail) || t("errors.save_failed"),
        );
      }
    },
    [reload, t],
  );

  const handleDelete = useCallback(
    async (id) => {
      setDeletingId(id);
      try {
        await api.delete(`/producers/me/locations/${id}`);
        reload();
      } catch (err) {
        showToast.error(
          detailToMessage(err?.response?.data?.detail) || t("errors.delete_failed"),
        );
      } finally {
        setDeletingId(null);
      }
    },
    [reload, t],
  );

  if (loadError) {
    return (
      <div className="text-sm text-fg-muted">
        {t("load_failed")}{" "}
        <button type="button" onClick={reload} className="text-primary underline">
          {t("load_retry_cta")}
        </button>
      </div>
    );
  }

  if (locations === null) {
    return <div className="h-16 animate-pulse rounded-lg bg-surface-card" />;
  }

  return (
    <div className="space-y-3" data-testid="locations-editor">
      {/* MEH-1563: card-level intro — what a location point is + where it renders.
          Under the MEH-1539 standard a card-level "where" line covers every field
          below it, so it stays visible in all three list states (0 / 1 / many). */}
      <p className="text-xs text-fg-muted" data-testid="locations-intro">
        {t("intro")}
      </p>

      {locations.length === 0 && !adding ? (
        <EmptyState
          icon={MapPin}
          title={t("empty_title")}
          ctaLabel={t("empty_cta")}
          ctaOnClick={() => setAdding(true)}
        />
      ) : null}

      <ul className="space-y-2">
        {locations.map((loc) =>
          editingId === loc.id ? (
            <li key={loc.id}>
              <LocationForm
                heading={t("edit_heading")}
                initial={toEditForm(loc)}
                saving={saving}
                onSubmit={(form) => handleUpdate(loc.id, form)}
                onCancel={() => setEditingId(null)}
              />
            </li>
          ) : (
            <li key={loc.id}>
              <LocationRow
                loc={loc}
                kindLabel={tKind(loc.kind)}
                deleting={deletingId === loc.id}
                onEdit={() => {
                  setAdding(false);
                  setEditingId(loc.id);
                }}
                onDelete={() => handleDelete(loc.id)}
                onSetPrimary={() => handleSetPrimary(loc.id)}
              />
            </li>
          ),
        )}
      </ul>

      {adding ? (
        <LocationForm
          heading={t("add_heading")}
          initial={EMPTY_FORM}
          saving={saving}
          onSubmit={handleCreate}
          onCancel={() => setAdding(false)}
        />
      ) : locations.length > 0 ? (
        <button
          type="button"
          onClick={() => {
            setEditingId(null);
            setAdding(true);
          }}
          className="inline-flex items-center gap-1.5 rounded-full border border-primary/40 px-3 py-1.5 text-sm font-medium text-primary hover:bg-primary/5"
          data-testid="locations-add"
        >
          <Plus size={15} weight="bold" />
          {t("add_cta")}
        </button>
      ) : null}
    </div>
  );
}

function LocationRow({ loc, kindLabel, deleting, onEdit, onDelete, onSetPrimary }) {
  const t = useTranslations("settings.locations");
  return (
    <div className="flex items-center gap-3 rounded-lg border border-border bg-surface p-3">
      <MapPin size={18} weight="fill" className="shrink-0 text-primary" />
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-1.5">
          <span className="truncate font-medium text-text">
            {loc.label || kindLabel}
          </span>
          {loc.is_primary ? (
            <span className="inline-flex items-center gap-0.5 rounded-full bg-primary/10 px-1.5 py-0.5 text-xs text-primary">
              <Star size={11} weight="fill" />
              {t("primary_badge")}
            </span>
          ) : null}
        </div>
        <div className="truncate text-xs text-fg-muted">
          {kindLabel}
          {loc.city ? ` · ${loc.city}` : ""}
        </div>
      </div>
      {!loc.is_primary ? (
        <button
          type="button"
          onClick={onSetPrimary}
          className="shrink-0 text-xs font-medium text-primary hover:underline"
        >
          {t("set_primary_cta")}
        </button>
      ) : null}
      <button
        type="button"
        onClick={onEdit}
        aria-label={t("edit_aria")}
        className="shrink-0 text-fg-muted hover:text-primary"
      >
        <Pencil size={16} />
      </button>
      <button
        type="button"
        onClick={onDelete}
        disabled={deleting}
        aria-label={t("delete_aria")}
        className="shrink-0 text-fg-muted hover:text-error disabled:opacity-50"
      >
        <Trash size={16} />
      </button>
    </div>
  );
}

function LocationForm({ heading, initial, saving, onSubmit, onCancel }) {
  const t = useTranslations("settings.locations");
  const tForm = useTranslations("settings.locations.form");
  const tKind = useTranslations("settings.locations.kind");
  const [form, setForm] = useState(initial);
  // MEH-1563: collapsed for a NEW location (the point of the disclosure — the
  // form must not open on two unexplained numbers), but expanded when the row
  // already carries coordinates, so editing never hides a value the owner
  // previously set. Seeded once via useState so a re-render can't reopen a
  // disclosure the owner just closed. Null-checked rather than String()-cast:
  // String(null) is "null", which is !== "" and would open the disclosure on a
  // NEW location if a caller ever passed null for an unset coordinate. Both of
  // today's callers (EMPTY_FORM, toEditForm) hand over "", so this is a guard
  // on the invariant, not a live bug.
  const [coordsOpen] = useState(
    () =>
      initial.lat != null &&
      initial.lat !== "" &&
      initial.lng != null &&
      initial.lng !== "",
  );
  const set = (field) => (e) =>
    setForm((f) => ({ ...f, [field]: e.target.value }));

  // MEH-1936: ids for the two composed comboboxes. `useId` rather than a
  // literal, because <label htmlFor> must resolve to exactly one input and this
  // form is remounted per row — a hardcoded id would collide the moment a
  // second LocationForm is ever rendered at the same time.
  const fieldId = useId();
  const cityId = `${fieldId}-city`;
  const addressId = `${fieldId}-address`;

  // MEH-1936 — precision is auto-derived from HOW the location was entered, but
  // only until the owner touches the select herself. Without this flag the
  // derivation would silently overwrite a deliberate manual choice on the next
  // keystroke, which is the same class of bug as a form that "helpfully" resets
  // a field the user just set. Seeded false on both create and edit: the
  // derivation fires on owner ACTIONS (pick an address, type a city), never on
  // mount, so an existing row's saved precision is never rewritten by opening
  // the editor.
  const [precisionTouched, setPrecisionTouched] = useState(false);
  const derivePrecision = (f, next) => (precisionTouched ? f.location_precision : next);

  // MEH-1936 / MEH-1808: coordinates are only trustworthy while they belong to
  // the text currently in the address field. Typing over a picked address
  // therefore RETIRES them — carrying them along would put a confident pin on
  // the wrong place, which is strictly worse than having no pin at all.
  const handleAddressChange = (v) =>
    setForm((f) => ({
      ...f,
      address: v,
      lat: "",
      lng: "",
      address_city: "",
    }));

  const handleAddressSelect = (picked) => {
    setForm((f) => ({
      ...f,
      address: picked.street || picked.displayName || f.address,
      lat: picked.lat != null ? String(picked.lat) : f.lat,
      lng: picked.lng != null ? String(picked.lng) : f.lng,
      // Never clobber a city the owner already chose from CitySearch — that
      // value is canonical (MEH-213 bans free-text towns) and the server's
      // same-city-label invariant compares it case-insensitively across the
      // producer's rows. The geocoder's own string only fills a gap.
      // REUSES: components/admin/ProducerForm.jsx:289-296 (handleAddressSelect).
      city: f.city || picked.city || "",
      // The picked point's own town, for the confirmation LABEL only — it is
      // what the pin actually sits in, which is not always what `city` says.
      address_city: picked.city || "",
      location_precision: derivePrecision(f, "exact"),
    }));
  };

  const handleCityChange = (v) =>
    setForm((f) => ({
      ...f,
      city: v,
      // A town with no street address is an area, not a point. Only downgrade
      // while the address field is genuinely empty, so this can never undo the
      // "exact" a successful pick just set.
      location_precision:
        f.address.trim() === "" ? derivePrecision(f, "approximate") : f.location_precision,
    }));

  // Coordinates attached to the text in the field right now — the single
  // condition that separates the three states below.
  const geocoded = String(form.lat).trim() !== "" && String(form.lng).trim() !== "";
  const confirmLabel = [form.address, form.address_city || form.city]
    .filter((s) => s && String(s).trim() !== "")
    .join(", ");
  // Typed an address but we hold no point for it. Covers both "the provider
  // returned nothing" and "she never picked from the list" — from the owner's
  // side those are one problem (no pin), and the remedy is the same.
  //
  // Gated on the query floor rather than on "any text at all": below 3
  // characters AddressSearch has not asked the provider anything
  // (AddressSearch.jsx:79), so a line reading "we couldn't find that address"
  // would be asserting a failed lookup that never ran. Found in review — the
  // first version fired on the very first keystroke.
  const addressUnresolved =
    form.address.trim().length >= ADDRESS_QUERY_FLOOR && !geocoded;

  // MEH-1579: the city/address hint follows the precision selected RIGHT NOW —
  // an `approximate` location renders a pin in the area with no address, so a
  // flat "shown in navigation" line promised a surface the customer never sees
  // (MEH-1539 standard, principle 2). Reads `form.location_precision`, so it
  // re-renders live as the owner switches the select — no save round-trip.
  // REUSES: the per-option `precision_helper` mechanism two fields above.
  const placeHint = tForm(
    form.location_precision === "approximate"
      ? "place_hint_approximate"
      : "place_hint_exact",
  );

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        onSubmit(form);
      }}
      className="space-y-3 rounded-lg border border-primary/30 bg-primary/5 p-3"
      data-testid="location-form"
    >
      <div className="flex items-center justify-between">
        <h4 className="text-sm font-semibold text-text">{heading}</h4>
        <button
          type="button"
          onClick={onCancel}
          aria-label={t("cancel_cta")}
          className="text-fg-muted hover:text-text"
        >
          <X size={16} weight="bold" />
        </button>
      </div>

      {/* MEH-1563: every field carries a hint and/or an example placeholder
          (MEH-1539 standard items 2–3). REUSES: edit/cards.jsx `*_where` /
          `scope_helper` lines — same `text-[11px] text-fg-muted` treatment.
          MEH-1595: single column below `sm`. Two columns gave each input 134px
          at 375px (108px usable) while the example placeholders measure
          125–186px, so four of five were cut mid-example — `למשל: 050-1234567`
          rendered as `של: 050-1234567`, losing the word that marks it as an
          example. The same squeeze wrapped `kind_helper` to 5 lines and
          `precision_helper` to 4. Full width fixes both at once; `sm:` and up
          is unchanged. */}
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
        <Field label={tForm("kind_label")} hint={tForm("kind_helper")}>
          <select
            value={form.kind}
            onChange={set("kind")}
            className="w-full rounded-[10px] border border-border bg-surface px-3 py-2 text-sm"
            data-testid="location-kind"
          >
            {KINDS.map((k) => (
              <option key={k} value={k}>
                {tKind(k)}
              </option>
            ))}
          </select>
        </Field>
        <Field label={tForm("precision_label")} hint={tForm("precision_helper")}>
          <select
            value={form.location_precision}
            // MEH-1936: the manual select stays authoritative. One deliberate
            // change here and the auto-derivation stops writing to this field
            // for the rest of the form's life.
            onChange={(e) => {
              setPrecisionTouched(true);
              set("location_precision")(e);
            }}
            className="w-full rounded-[10px] border border-border bg-surface px-3 py-2 text-sm"
            data-testid="location-precision"
          >
            <option value="exact">{tForm("precision_exact")}</option>
            <option value="approximate">{tForm("precision_approximate")}</option>
          </select>
        </Field>
        <Field label={tForm("label_label")} hint={tForm("label_hint")}>
          <TextInput
            value={form.label}
            onChange={set("label")}
            placeholder={tForm("label_placeholder")}
          />
        </Field>
        {/* MEH-1936: the two location fields are the canonical components the
            register flow uses, not free text. They are NOT wrapped in `Field`:
            each renders its own <label htmlFor>, and Field's implicit <label>
            would contribute its whole text to the control's accessible name on
            top of that — the same double-association Field's own comment below
            warns about. Hint lines therefore sit as plain siblings.
            REUSES: RegisterProducerClient.jsx:986-999 (CitySearch, labelVisible)
            and :1021-1031 (AddressSearch under a visible <label htmlFor>, the
            MEH-1405 pattern that avoids a duplicate sr-only association). */}
        <div className="text-xs" data-testid="location-city-field">
          <CitySearch
            id={cityId}
            labelVisible
            label={tForm("city_label")}
            placeholder={tForm("city_placeholder")}
            value={form.city}
            onChange={handleCityChange}
          />
          <span className="mt-1 block text-[11px] text-fg-muted">{placeHint}</span>
        </div>
        <div className="text-xs" data-testid="location-address-field">
          <label
            htmlFor={addressId}
            className="mb-1 block font-medium text-fg-muted"
          >
            {tForm("address_label")}
          </label>
          <AddressSearch
            id={addressId}
            inputTestId="location-address"
            value={form.address}
            onChange={handleAddressChange}
            onSelect={handleAddressSelect}
            placeholder={tForm("address_placeholder")}
          />
          <span className="mt-1 block text-[11px] text-fg-muted">{placeHint}</span>
        </div>
        <Field label={tForm("phone_label")}>
          <TextInput
            value={form.phone}
            onChange={set("phone")}
            type="tel"
            placeholder={tForm("phone_placeholder")}
          />
        </Field>
        <Field label={tForm("hours_label")}>
          <TextInput
            value={form.opening_hours}
            onChange={set("opening_hours")}
            placeholder={tForm("hours_placeholder")}
          />
        </Field>
        <label className="flex items-center gap-2 self-end text-sm text-text">
          <input
            type="checkbox"
            checked={!!form.is_primary}
            onChange={(e) =>
              setForm((f) => ({ ...f, is_primary: e.target.checked }))
            }
            data-testid="location-primary"
          />
          {tForm("primary_label")}
        </label>
      </div>

      {/* MEH-1936 — three mutually exclusive states, keyed on whether the text
          in the address field has coordinates attached to it. Same state
          machine as the register step (RegisterProducerClient.jsx:1083-1130),
          because it is the same question being asked:
            no address           → nothing (the field's own hint is enough)
            address, no coords   → the fallback line, pointing at the manual
                                   coordinates disclosure directly below
            coords               → confirmation line + a street-level map
          The unresolved line is deliberately NOT error-styled and does NOT gate
          save: `lat`/`lng` stay nullable in LocationInputSchema, and a moshav
          with no street number is a legitimate row, not a mistake. */}
      <AddressState
        geocoded={geocoded}
        unresolved={addressUnresolved}
        confirmLabel={confirmLabel}
        lat={form.lat}
        lng={form.lng}
        name={form.label || form.address || form.city}
      />

      {/* MEH-1563: raw coordinates are an escape hatch, not a required field —
          collapsed by default so the form no longer opens on two unexplained
          numeric inputs. Presentation only: `form.lat` / `form.lng` state and
          buildPayload are untouched. REUSES: components/admin/ProducerForm.jsx:647
          (MEH-1242 PR2 manual-coords disclosure). */}
      <details
        open={coordsOpen}
        className="rounded-[10px] border border-border bg-surface px-3 py-2"
      >
        {/* MEH-1595: 44px minimum tap target — the row was 16px tall, on the
            one control an owner has to go looking for. Padding + min-height
            only: no `display` override, because anything other than the
            default `list-item` drops the disclosure triangle that signals the
            row is expandable. */}
        <summary
          className="min-h-[44px] cursor-pointer py-3 text-xs font-medium text-fg-muted"
          data-testid="location-coords-toggle"
        >
          {tForm("coords_summary")}
        </summary>
        <p className="mt-1 text-[11px] text-fg-muted">{tForm("coords_hint")}</p>
        <div className="mt-2 grid grid-cols-2 gap-2">
          <Field label={tForm("lat_label")}>
            <TextInput
              value={form.lat}
              onChange={set("lat")}
              inputMode="decimal"
              testid="location-lat"
            />
          </Field>
          <Field label={tForm("lng_label")}>
            {/* MEH-1936: `lat` has carried a testid since MEH-1421 and `lng`
                never did — an asymmetry with no reason behind it, and the
                reason no test had ever driven the manual-coordinates path
                end to end. Added so it can. */}
            <TextInput
              value={form.lng}
              onChange={set("lng")}
              inputMode="decimal"
              testid="location-lng"
            />
          </Field>
        </div>
      </details>

      <div className="flex items-center gap-2">
        <button
          type="submit"
          disabled={saving}
          className="rounded-full bg-primary px-4 py-1.5 text-sm font-medium text-white hover:bg-primary-dark disabled:opacity-50"
          data-testid="location-save"
        >
          {saving ? t("saving") : t("save_cta")}
        </button>
        <button
          type="button"
          onClick={onCancel}
          className="rounded-full px-4 py-1.5 text-sm font-medium text-fg-muted hover:text-text"
        >
          {t("cancel_cta")}
        </button>
      </div>
    </form>
  );
}

// MEH-1936 — the address field's three mutually exclusive states, keyed on
// whether the text in the field has coordinates attached to it:
//
//   no address           → nothing (the field's own hint already covers it)
//   address, no coords   → the fallback line, pointing at the manual
//                          coordinates disclosure directly below it
//   coords               → confirmation line + a street-level map
//
// Same state machine as the register step (RegisterProducerClient.jsx:1083-1130)
// because it is the same question being asked of the same person. Extracted as
// its own component rather than a nested ternary inline: it is the one branch
// in this form with three arms, and the flat `if` chain reads as the states it
// models.
//
// The unresolved line is deliberately NOT error-styled and does NOT gate save.
// `lat`/`lng` stay nullable in LocationInputSchema, and a moshav with no street
// number is a legitimate row, not a mistake — Baymard's documented
// address-validator anti-pattern, quoted in AddressSearch.jsx:29-31.
function AddressState({ geocoded, unresolved, confirmLabel, lat, lng, name }) {
  const tForm = useTranslations("settings.locations.form");

  if (geocoded) {
    return (
      <div data-testid="location-address-confirm">
        {/* The caption is CONDITIONAL on there being something to name. A row
            whose coordinates were typed by hand into the disclosure below,
            with no address and no town yet, has coordinates and nothing to
            caption — the unguarded version rendered "המיקום זוהה: " with a
            dangling colon. The map is the useful half and still renders; the
            0-item arm of the same 0/1/many matrix the conditional-UI rule
            asks for. Found in review, not in a failing run. */}
        {confirmLabel === "" ? null : (
          <p className="inline-flex items-center gap-1.5 text-sm text-primary text-start">
            <CheckCircle size={16} weight="fill" aria-hidden="true" className="shrink-0" />
            <span data-testid="location-address-confirm-label">
              {tForm("address_confirmed", { location: confirmLabel })}
            </span>
          </p>
        )}
        <div className="mt-2 overflow-hidden rounded-md">
          {/* Confirmation only: no Waze/Google pills — "navigate to your own
              shop" means nothing in an edit form — and a street zoom instead of
              MiniMap's neighbourhood default. Both are opt-in props from
              MEH-1808; every other MiniMap consumer is untouched. */}
          <MiniMap
            lat={Number(lat)}
            lng={Number(lng)}
            name={name}
            zoom={ADDRESS_CONFIRM_ZOOM}
            showNavigation={false}
          />
        </div>
      </div>
    );
  }

  if (unresolved) {
    return (
      <p
        data-testid="location-address-unresolved"
        className="text-[11px] text-fg-muted text-start"
      >
        {tForm("address_unresolved")}
      </p>
    );
  }

  return null;
}

// MEH-1563: `hint` renders the field's "where it appears" / explanation line
// under the input. Omitted → nothing renders (fields whose guidance is carried
// by the card intro alone). The hint sits OUTSIDE the <label> on purpose: an
// implicit label contributes its whole text to the control's accessible name,
// so an in-label hint would make a screen reader announce the select as
// "דיוק מדויק — הלקוחות יראו סיכה…". REUSES: edit/cards.jsx:801-802 — same
// label/`*_where`-sibling split.
function Field({ label, hint, children }) {
  return (
    <div className="text-xs">
      <label className="block">
        <span className="mb-1 block font-medium text-fg-muted">{label}</span>
        {children}
      </label>
      {hint ? (
        <span className="mt-1 block text-[11px] text-fg-muted">{hint}</span>
      ) : null}
    </div>
  );
}

function TextInput({ value, onChange, type = "text", inputMode, testid, placeholder }) {
  return (
    <input
      type={type}
      inputMode={inputMode}
      value={value}
      onChange={onChange}
      placeholder={placeholder}
      data-testid={testid}
      className="w-full rounded-[10px] border border-border bg-surface px-3 py-2 text-sm"
    />
  );
}
