"use client";

/**
 * Module:   producer/dashboard/edit/cards
 * Purpose:  The self-service editor cards for the producer edit tab —
 *           categories, gallery images, map location, and the AI bio panel.
 *           Extracted VERBATIM from edit/page.js (MEH-1119, MEH-1157).
 * Does NOT: host the page shell, fetch, or the other cards (questions /
 *           contact channels) — those stay in edit/page.js.
 * Related:  app/[locale]/producer/dashboard/edit/page.js (imports these);
 *           __tests__/EditTab{Categories,Images,Location,BioPanel}*.test.jsx.
 * History:  MEH-1119 — a non-Page `export` in edit/page.js broke the Next Page
 *           type contract under `next build --webpack`; moving the three
 *           test-exported cards here keeps the page file's export surface valid.
 *           MEH-1157 — BioPanelCard relocated here (same test-export reason)
 *           + generate() errors split by cause (401 / 429 / fail-open empty).
 */

import { useState, useEffect } from "react";
import { useTranslations } from "next-intl";
import { Warning, X } from "@phosphor-icons/react";
import api from "@/lib/api";
import { detailToMessage } from "@/lib/errors";
import { optimizeCloudinary } from "@/lib/cloudinary";
import EditAccordionCard from "@/components/EditAccordionCard";
import AddressSearch from "@/components/AddressSearch";

// ============================================================
// Edit-tab chunk A: producer-facing categories editor.
// Mirrors ContactChannelsCard — local selection seeded from
// profile.categories, saves category_ids via PUT /producers/me. A
// license-required category chosen with no license number triggers a backend
// 422 (ensure_license_for_categories, producer_me.py); the Hebrew detail is
// surfaced inline via detailToMessage (lib/errors.js), never the generic copy.
// REUSES: components/admin/ProducerForm.jsx:207-217,433-451 (GET /categories
// checkbox grid + toggle), producer-self version.
// ============================================================

// Exported for isolation tests (EditTabCategoriesCard.test.jsx). Mounting the
// whole page under jsdom hangs the vitest runner, so the cards are tested
// directly — the default page export is unchanged.
export function CategoriesCard({ profile, onSave, reportDirty = () => {} }) {
  const t = useTranslations("dashboard.producer.categories");
  const [allCategories, setAllCategories] = useState([]);
  const seedIds = (profile?.categories || []).map((c) => c.id);
  const [selected, setSelected] = useState(seedIds);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [errorMsg, setErrorMsg] = useState(null);
  const [fetchError, setFetchError] = useState(null);

  useEffect(() => {
    let cancelled = false;
    api
      .get("/categories")
      .then((r) => {
        if (!cancelled) {
          setAllCategories(r.data || []);
          setFetchError(null);
        }
      })
      .catch((err) => {
        // Surface a load failure instead of a silently-empty grid (a producer
        // would otherwise see a blank card with no way to know it failed).
        if (!cancelled) {
          setAllCategories([]);
          setFetchError(detailToMessage(err?.response?.data?.detail) || t("fetch_error"));
        }
      });
    return () => {
      cancelled = true;
    };
    // `t` (next-intl translator) has a stable identity per locale/namespace,
    // so listing it re-runs the fetch only on a real locale change — never a
    // per-render loop. (The earlier loop came from an ad-hoc test mock that
    // returned a fresh `t` each render; tests now use the real
    // NextIntlClientProvider, so the honest dependency is safe.)
  }, [t]);

  // Dirty when the selection differs from the seeded set (order-independent).
  const dirty =
    seedIds.length !== selected.length ||
    seedIds.some((id) => !selected.includes(id));
  // MEH-1100: lift to the page-level unsaved-changes aggregate.
  useEffect(() => {
    reportDirty("categories", dirty);
    return () => reportDirty("categories", false);
  }, [dirty, reportDirty]);

  const toggle = (id) => {
    setSaved(false);
    setErrorMsg(null);
    setSelected((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id],
    );
  };

  const handleSave = async () => {
    setSaving(true);
    setSaved(false);
    setErrorMsg(null);
    try {
      await api.put("/producers/me", { category_ids: selected });
      // Keep the parent profile in sync so a re-render reseeds correctly.
      onSave({ categories: allCategories.filter((c) => selected.includes(c.id)) });
      setSaved(true);
      setTimeout(() => setSaved(false), 3000);
    } catch (err) {
      // Surface the backend Hebrew detail (e.g. license-required 422) inline;
      // detailToMessage normalises the FastAPI 422 detail-array (MEH-989).
      setErrorMsg(detailToMessage(err?.response?.data?.detail) || t("save_error"));
    } finally {
      setSaving(false);
    }
  };

  return (
    <div>
      {/* MEH-1116: card chrome + heading moved to the EditAccordionCard header. */}
      <p className="text-xs text-fg-muted mb-4">{t("subtitle")}</p>

      {fetchError ? (
        <p className="flex items-center gap-1.5 text-xs text-red-600" role="alert">
          <Warning size={16} weight="fill" aria-hidden="true" className="shrink-0" />
          {fetchError}
        </p>
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
          {allCategories.map((c) => (
            <label key={c.id} className="flex items-center gap-2 text-sm cursor-pointer">
              <input
                type="checkbox"
                checked={selected.includes(c.id)}
                onChange={() => toggle(c.id)}
                className="w-4 h-4 accent-primary"
              />
              <span>{c.name}</span>
            </label>
          ))}
        </div>
      )}

      {errorMsg && (
        <p className="mt-3 flex items-center gap-1.5 text-xs text-red-600" role="alert">
          <Warning size={16} weight="fill" aria-hidden="true" className="shrink-0" />
          {errorMsg}
        </p>
      )}

      <button
        onClick={handleSave}
        disabled={saving || !dirty}
        className="mt-4 bg-primary text-white px-4 py-2 rounded-[10px] text-sm font-medium hover:bg-primary-dark transition disabled:opacity-60"
      >
        {saving ? t("saving") : saved ? t("saved") : t("save_cta")}
      </button>
    </div>
  );
}

// ============================================================
// Edit-tab chunk B: producer-facing gallery images editor.
// Mirrors ContactChannelsCard (card/save/dirty pattern) + the admin
// ProducerForm image grid (upload loop + remove + hover-grid, producer-self
// version). Multi-file upload via POST /upload/image; saves images[] via PUT
// /producers/me (backend runs Cloudinary cleanup for removed URLs). Upload
// errors are surfaced inline via detailToMessage (lib/errors.js).
// REUSES: components/admin/ProducerForm.jsx:219-243,630-662.
// ============================================================

// Exported for isolation tests (EditTabImagesCard.test.jsx) — see CategoriesCard.
export function ImagesCard({ profile, onSave, reportDirty = () => {} }) {
  const t = useTranslations("dashboard.producer.images");
  const seed = profile?.images || [];
  const [images, setImages] = useState(seed);
  const [uploading, setUploading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [errorMsg, setErrorMsg] = useState(null);
  const [dragOver, setDragOver] = useState(false);

  // Dirty when the list differs from the seeded set (order-sensitive: a reorder
  // would count as dirty, but this editor has no reorder — add/remove only).
  const dirty =
    seed.length !== images.length || seed.some((url, i) => url !== images[i]);
  // MEH-1100: lift to the page-level unsaved-changes aggregate.
  useEffect(() => {
    reportDirty("images", dirty);
    return () => reportDirty("images", false);
  }, [dirty, reportDirty]);

  // MEH-1099: shared upload path — the file input's onChange and the
  // dropzone's onDrop both feed here, so drag-drop reuses the exact
  // POST /upload/image + Cloudinary flow (no parallel mechanism).
  const uploadFiles = async (files) => {
    if (!files.length) return;
    setSaved(false);
    setErrorMsg(null);
    setUploading(true);
    try {
      const uploaded = [];
      for (const file of files) {
        const fd = new FormData();
        fd.append("file", file);
        const r = await api.post("/upload/image", fd);
        uploaded.push(r.data.url);
      }
      setImages((prev) => [...prev, ...uploaded]);
    } catch (err) {
      setErrorMsg(detailToMessage(err?.response?.data?.detail) || t("upload_error"));
    } finally {
      setUploading(false);
    }
  };

  const handleUpload = async (e) => {
    await uploadFiles(Array.from(e.target.files || []));
    e.target.value = "";
  };

  const handleDrop = (e) => {
    e.preventDefault();
    setDragOver(false);
    if (uploading) return;
    // Only image files — a dropped PDF/zip silently filters out, matching
    // the input's accept="image/*" gate on the click path.
    uploadFiles(
      Array.from(e.dataTransfer?.files || []).filter((f) =>
        f.type.startsWith("image/")
      )
    );
  };

  // Remove by index (not by URL value): if images[] ever holds a duplicate
  // URL (backend drift / bad prior save), a value-filter would drop every
  // copy at once. Index-based removal deletes exactly the clicked thumbnail.
  const removeImage = (index) => {
    setSaved(false);
    setErrorMsg(null);
    setImages((prev) => prev.filter((_, i) => i !== index));
  };

  const handleSave = async () => {
    setSaving(true);
    setSaved(false);
    setErrorMsg(null);
    try {
      await api.put("/producers/me", { images });
      onSave({ images });
      setSaved(true);
      setTimeout(() => setSaved(false), 3000);
    } catch (err) {
      setErrorMsg(detailToMessage(err?.response?.data?.detail) || t("save_error"));
    } finally {
      setSaving(false);
    }
  };

  return (
    <div>
      {/* MEH-1116: card chrome + heading moved to the EditAccordionCard header. */}
      <p className="text-xs text-fg-muted mb-4">{t("subtitle")}</p>

      <label
        data-testid="images-dropzone"
        onDragOver={(e) => {
          e.preventDefault();
          setDragOver(true);
        }}
        onDragLeave={(e) => {
          // Ignore leave events from moving over child nodes — only clear
          // the drop state when the cursor truly exits the zone.
          if (!e.currentTarget.contains(e.relatedTarget)) setDragOver(false);
        }}
        onDrop={handleDrop}
        className={`inline-flex items-center text-sm border border-dashed rounded-[10px] px-4 py-3 cursor-pointer transition ${
          dragOver ? "border-primary bg-green-50" : "border-border hover:bg-green-50"
        }`}
      >
        <input
          type="file"
          accept="image/*"
          multiple
          className="hidden"
          disabled={uploading}
          onChange={handleUpload}
        />
        {uploading ? t("uploading") : dragOver ? t("drop_here") : t("add_cta")}
      </label>

      {/* MEH-1099: photography tips — wording from Brand Hub 05-photography-style
          (imagery SoT, MEH-788) + the approved product-photography guide.
          DO NOT reword here — brand-book-precedes-code. */}
      <ul className="mt-3 space-y-1 text-xs text-fg-muted">
        {["light", "real", "no_stock"].map((k) => (
          <li key={k} className="flex items-start gap-1.5">
            <span
              aria-hidden="true"
              className="mt-[5px] w-1 h-1 rounded-full bg-primary shrink-0"
            />
            {t(`tips.${k}`)}
          </li>
        ))}
      </ul>

      {images.length > 0 && (
        <div className="grid grid-cols-3 md:grid-cols-5 gap-3 mt-4">
          {images.map((url, i) => (
            <div key={`${url}-${i}`} className="relative group">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={optimizeCloudinary(url)}
                alt=""
                className="w-full h-24 object-cover rounded-[8px] border border-border"
              />
              <button
                type="button"
                onClick={() => removeImage(i)}
                className="absolute top-1 start-1 bg-error text-white rounded-full w-6 h-6 inline-flex items-center justify-center opacity-0 group-hover:opacity-100 transition"
                aria-label={t("remove_aria")}
              >
                <X size={14} weight="bold" aria-hidden="true" />
              </button>
            </div>
          ))}
        </div>
      )}

      {errorMsg && (
        // MEH-1099: text-error (ADR-026) — the drag-drop path made this error
        // display newly reachable; sibling text-red-600 sites in the other
        // cards stay for the MEH-1086 follow-up sweep.
        <p className="mt-3 flex items-center gap-1.5 text-xs text-error" role="alert">
          <Warning size={16} weight="fill" aria-hidden="true" className="shrink-0" />
          {errorMsg}
        </p>
      )}

      <button
        onClick={handleSave}
        disabled={saving || uploading || !dirty}
        className="mt-4 bg-primary text-white px-4 py-2 rounded-[10px] text-sm font-medium hover:bg-primary-dark transition disabled:opacity-60"
      >
        <span aria-live="polite" aria-atomic="true">
          {saving ? t("saving") : saved ? t("saved") : t("save_cta")}
        </span>
      </button>
    </div>
  );
}

// ============================================================
// Edit-tab chunk C: producer-facing location/coords editor (gated).
// Mirrors ContactChannelsCard (card/save/dirty/inline-error). The owner types
// an address into AddressSearch (Nominatim geocode, no Leaflet); onSelect
// returns {lat,lng,city}; Save persists them via PUT /producers/me. Rendered
// only for physical-location producers (gated at the mount, MEH-213) — no map,
// no pin-drag, no radius.
// REUSES: components/AddressSearch.jsx (onSelect {street,neighborhood,city,lat,lng}).
// ============================================================

// Exported for isolation tests (EditTabLocationCard.test.jsx) — see CategoriesCard.
export function LocationCard({ profile, onSave, reportDirty = () => {} }) {
  const t = useTranslations("dashboard.producer.location");
  const seedLat = profile?.lat ?? null;
  const seedLng = profile?.lng ?? null;
  const seedCity = profile?.city ?? "";
  const [coords, setCoords] = useState({ lat: seedLat, lng: seedLng, city: seedCity });
  const [addressText, setAddressText] = useState("");
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [errorMsg, setErrorMsg] = useState(null);

  const dirty =
    coords.lat !== seedLat || coords.lng !== seedLng || coords.city !== seedCity;
  // MEH-1100: lift to the page-level unsaved-changes aggregate.
  useEffect(() => {
    reportDirty("location", dirty);
    return () => reportDirty("location", false);
  }, [dirty, reportDirty]);

  const handleSelect = (picked) => {
    setSaved(false);
    setErrorMsg(null);
    // Keep the seeded city if Nominatim doesn't resolve one (never clobber).
    setCoords({
      lat: picked.lat,
      lng: picked.lng,
      city: picked.city || coords.city,
    });
  };

  const handleSave = async () => {
    setSaving(true);
    setSaved(false);
    setErrorMsg(null);
    try {
      await api.put("/producers/me", {
        lat: coords.lat,
        lng: coords.lng,
        city: coords.city || null,
      });
      onSave({ lat: coords.lat, lng: coords.lng, city: coords.city });
      setSaved(true);
      setTimeout(() => setSaved(false), 3000);
    } catch (err) {
      setErrorMsg(detailToMessage(err?.response?.data?.detail) || t("save_error"));
    } finally {
      setSaving(false);
    }
  };

  const hasCoords = coords.lat != null && coords.lng != null;

  return (
    <div>
      {/* MEH-1116: card chrome + heading moved to the EditAccordionCard header. */}
      <p className="text-xs text-fg-muted mb-4">{t("subtitle")}</p>

      {hasCoords && (
        <p className="text-xs text-fg-muted mb-3">
          {t("current_prefix")}{" "}
          <span className="text-text">
            {coords.city ? `${coords.city} · ` : ""}
            <span dir="ltr">{coords.lat}, {coords.lng}</span>
          </span>
        </p>
      )}

      <AddressSearch
        id="producer-location-address"
        label={t("heading")}
        value={addressText}
        onChange={setAddressText}
        onSelect={handleSelect}
      />

      {errorMsg && (
        <p className="mt-3 flex items-center gap-1.5 text-xs text-red-600" role="alert">
          <Warning size={16} weight="fill" aria-hidden="true" className="shrink-0" />
          {errorMsg}
        </p>
      )}

      <button
        onClick={handleSave}
        disabled={saving || !dirty}
        className="mt-4 bg-primary text-white px-4 py-2 rounded-[10px] text-sm font-medium hover:bg-primary-dark transition disabled:opacity-60"
      >
        <span aria-live="polite" aria-atomic="true">
          {saving ? t("saving") : saved ? t("saved") : t("save_cta")}
        </span>
      </button>
    </div>
  );
}

// ============================================================
// MEH-56: AI bio writer panel. Relocated VERBATIM from edit/page.js
// (MEH-1157 — same test-export reason as MEH-1119) except generate()'s
// error mapping, now split by cause: 401 → session expired, 429 → the
// backend limiter (5/hour, producer_me.py), 200 {"bio": ""} → the
// fail-open AI-unavailable path. The old catch-all blamed the owner's
// valid input for all of these.
// ============================================================

// Exported for isolation tests (EditTabBioPanel.test.jsx) — see CategoriesCard.
export function BioPanelCard({ profile, onSave, reportDirty = () => {} }) {
  const t = useTranslations("dashboard.producer.bio");
  const [source, setSource] = useState(profile.instagram || "");
  const [generatedBio, setGeneratedBio] = useState("");
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState("");

  // MEH-1100: this card had no dirty flag — the losable state is a generated
  // bio that hasn't been saved yet (typing a source alone costs nothing).
  const dirty = Boolean(generatedBio) && !saved;
  useEffect(() => {
    reportDirty("bio", dirty);
    return () => reportDirty("bio", false);
  }, [dirty, reportDirty]);

  const generate = async () => {
    if (!source.trim()) return;
    setLoading(true);
    setError("");
    setGeneratedBio("");
    setSaved(false);
    try {
      const r = await api.post("/producers/me/bio/generate", { source: source.trim() });
      setGeneratedBio(r.data.bio || "");
      // MEH-1157: fail-open backend (MEH-56) returns 200 {"bio": ""} when the
      // AI is unavailable — say so instead of blaming the owner's input.
      if (!r.data.bio) setError(t("error_unavailable"));
    } catch (err) {
      const status = err?.response?.status;
      if (status === 401) setError(t("error_session_expired"));
      else if (status === 429) setError(t("error_rate_limit"));
      else setError(t("error_generate"));
    }
    setLoading(false);
  };

  const saveBio = async () => {
    if (!generatedBio) return;
    setSaving(true);
    try {
      await api.put("/producers/me", { description: generatedBio });
      onSave(generatedBio);
      setSaved(true);
    } catch {
      setError(t("error_save"));
    }
    setSaving(false);
  };

  return (
    <div>
      {/* MEH-1116: card chrome + heading moved to the EditAccordionCard header. */}
      <p className="text-xs text-fg-muted mb-3">
        {t("intro")}
      </p>

      <textarea
        value={source}
        onChange={(e) => { setSource(e.target.value); setSaved(false); setGeneratedBio(""); }}
        placeholder={t("source_placeholder")}
        className="w-full border border-border rounded-[10px] px-3 py-2 text-sm resize-none h-16"
        dir="ltr"
        maxLength={500}
      />

      <button
        onClick={generate}
        disabled={loading || !source.trim()}
        className="w-full mt-2 bg-primary text-white py-2 rounded-[10px] text-sm font-medium disabled:opacity-50 hover:bg-primary-dark transition"
      >
        {loading ? t("generating") : t("generate_cta")}
      </button>

      {error && <p className="text-xs text-red-500 mt-2" role="alert">{error}</p>}

      {generatedBio && (
        <div className="mt-3 space-y-2">
          <textarea
            value={generatedBio}
            onChange={(e) => setGeneratedBio(e.target.value.slice(0, 150))}
            className="w-full border border-primary/30 bg-primary/5 rounded-[10px] px-3 py-2 text-sm resize-none h-16"
            dir="rtl"
            maxLength={150}
          />
          <div className="flex items-center justify-between">
            <span className="text-xs text-fg-muted">{generatedBio.length}/150</span>
            <button
              onClick={saveBio}
              disabled={saving}
              className="bg-primary text-white px-4 py-1.5 rounded-[8px] text-xs font-medium disabled:opacity-50 hover:bg-primary-dark transition"
            >
              {saving ? t("saving") : saved ? t("saved") : t("save_cta")}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
