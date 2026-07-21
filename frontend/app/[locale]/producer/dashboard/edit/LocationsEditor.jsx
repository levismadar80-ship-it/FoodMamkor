/**
 * Module:   LocationsEditor
 * Purpose:  Owner CRUD for producer_locations (branch / pickup / market_stand)
 *           in the dashboard — the write UI for the map's per-location pins.
 *           Mirrors ProductsSection's list/add/edit/delete shape.
 * Touches:  GET/POST/PUT/DELETE /producers/me/locations (owner-scoped, IDOR
 *           403 + single-primary + same-city-label enforced server-side).
 * Does NOT: geocode addresses, render a map picker, or import locations — manual
 *           lat/lng entry only (MEH-1421 over-engineering guard). Map rendering
 *           of these rows lives in MapComponent (chunk 3, shipped).
 * Related:  frontend/lib/schemas.js:LocationInputSchema (Rule-19 safeParse);
 *           backend/app/routers/producer_me.py (CRUD + invariants).
 * History:  MEH-1421 (creation, MEH-1388 chunk 4a).
 */
"use client";

import { useCallback, useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { MapPin, Pencil, Plus, Star, Trash, X } from "@phosphor-icons/react";

import api from "@/lib/api";
import { detailToMessage } from "@/lib/errors";
import { showToast } from "@/lib/toast";
import { LocationInputSchema } from "@/lib/schemas";
import EmptyState from "@/components/ui/EmptyState";

const KINDS = ["branch", "pickup", "market_stand"];
const EMPTY_FORM = {
  kind: "branch",
  label: "",
  city: "",
  address: "",
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
  const set = (field) => (e) =>
    setForm((f) => ({ ...f, [field]: e.target.value }));

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

      <div className="grid grid-cols-2 gap-2">
        <Field label={tForm("kind_label")}>
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
        <Field label={tForm("precision_label")}>
          <select
            value={form.location_precision}
            onChange={set("location_precision")}
            className="w-full rounded-[10px] border border-border bg-surface px-3 py-2 text-sm"
          >
            <option value="exact">{tForm("precision_exact")}</option>
            <option value="approximate">{tForm("precision_approximate")}</option>
          </select>
        </Field>
        <Field label={tForm("label_label")}>
          <TextInput value={form.label} onChange={set("label")} />
        </Field>
        <Field label={tForm("city_label")}>
          <TextInput value={form.city} onChange={set("city")} />
        </Field>
        <Field label={tForm("address_label")}>
          <TextInput value={form.address} onChange={set("address")} />
        </Field>
        <Field label={tForm("phone_label")}>
          <TextInput value={form.phone} onChange={set("phone")} type="tel" />
        </Field>
        <Field label={tForm("lat_label")}>
          <TextInput
            value={form.lat}
            onChange={set("lat")}
            inputMode="decimal"
            testid="location-lat"
          />
        </Field>
        <Field label={tForm("lng_label")}>
          <TextInput value={form.lng} onChange={set("lng")} inputMode="decimal" />
        </Field>
        <Field label={tForm("hours_label")}>
          <TextInput value={form.opening_hours} onChange={set("opening_hours")} />
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

function Field({ label, children }) {
  return (
    <label className="block text-xs">
      <span className="mb-1 block font-medium text-fg-muted">{label}</span>
      {children}
    </label>
  );
}

function TextInput({ value, onChange, type = "text", inputMode, testid }) {
  return (
    <input
      type={type}
      inputMode={inputMode}
      value={value}
      onChange={onChange}
      data-testid={testid}
      className="w-full rounded-[10px] border border-border bg-surface px-3 py-2 text-sm"
    />
  );
}
