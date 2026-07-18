"use client";

/**
 * Module:   producer/dashboard/edit/cards
 * Purpose:  The self-service editor cards for the producer edit tab —
 *           categories, gallery images, map location, and the description
 *           card (hero description + tagline + AI writing assist).
 *           Extracted VERBATIM from edit/page.js (MEH-1119, MEH-1157).
 * Does NOT: host the page shell, fetch, or the other cards (questions /
 *           contact channels) — those stay in edit/page.js.
 * Related:  app/[locale]/producer/dashboard/edit/page.js (imports these);
 *           __tests__/EditTab{Categories,Images,Location,DescriptionCard}*.test.jsx.
 * History:  MEH-1119 — a non-Page `export` in edit/page.js broke the Next Page
 *           type contract under `next build --webpack`; moving the three
 *           test-exported cards here keeps the page file's export surface valid.
 *           MEH-1157 — BioPanelCard relocated here (same test-export reason)
 *           + generate() errors split by cause (401 / 429 / fail-open empty).
 *           MEH-1173 — BioPanelCard → DescriptionCard: Shopify-Magic redesign,
 *           structured 3-question assist replaces the Instagram scrape.
 */

import { useState, useEffect } from "react";
// MEH-1306: locale-aware link for the "view on page" back-link below.
import { Link as LocaleLink } from "@/i18n/navigation";
import { useTranslations } from "next-intl";
import { Warning, X, Sparkle, CheckCircle, Eye } from "@phosphor-icons/react";
import api from "@/lib/api";
import { showToast } from "@/lib/toast";
import { detailToMessage } from "@/lib/errors";
import { optimizeCloudinary, IMAGE_RATIOS } from "@/lib/cloudinary";
import {
  requiresProducerLicense,
  hasLicenseFormatWarning,
} from "@/lib/license-required-categories";
import EditAccordionCard from "@/components/EditAccordionCard";
import AddressSearch from "@/components/AddressSearch";
import Input from "@/components/ui/Input";
import CitiesAutocomplete from "@/components/CitiesAutocomplete";
import HoursEditor from "./HoursEditor";

// ============================================================
// MEH-1306: "view on page" back-link — closes the edit↔public loop from the
// edit side. Rendered inside the EXPANDED card body only (never the accordion
// header — that's a <button>, a nested interactive element is invalid HTML).
// Deep-links to the mapped public section id (#section-*, ProducerDetail /
// ProducerSections). producerId comes from the already-fetched /producers/me
// payload — no new API calls; self-hides when the id is absent.
// ============================================================

export function ViewOnPageLink({ producerId, anchor }) {
  const t = useTranslations("dashboard.producer");
  if (!producerId) return null;
  return (
    <p className="mb-3">
      <LocaleLink
        href={`/producer/${producerId}#${anchor}`}
        data-testid={`view-on-page-${anchor}`}
        // Calm idiom (ADR-019): muted text link, never a primary CTA;
        // min-h 44px keeps the tap target (MEH-813).
        className="inline-flex items-center gap-1.5 min-h-[44px] text-sm text-fg-muted hover:text-accent focus-visible:underline transition-colors"
      >
        <Eye size={16} aria-hidden="true" />
        {t("view_on_page")}
      </LocaleLink>
    </p>
  );
}

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
      const next = [...images, ...uploaded];
      setImages(next);
      // MEH-1236: kill the upload≠save trap. Uploading a photo used to feel like
      // saving, but images[] only persisted on an explicit Save click — so the
      // overview checklist ("חסרה תמונה") never updated and the photo looked
      // lost. Auto-persist the new list right after a successful upload (single
      // PUT) so the checklist reflects it with no manual save. Removals keep the
      // explicit Save intent below (a mis-click shouldn't wipe a photo silently).
      try {
        await api.put("/producers/me", { images: next });
        onSave({ images: next });
        setSaved(true);
        setTimeout(() => setSaved(false), 3000);
      } catch (err) {
        // Uploaded to Cloudinary but the profile save failed — the photos stay
        // in the local list (now dirty), so the explicit Save button lets her
        // retry. Never silent: surface the save error.
        setErrorMsg(detailToMessage(err?.response?.data?.detail) || t("save_error"));
      }
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
      {/* MEH-1306: back-link to the public gallery section. */}
      <ViewOnPageLink producerId={profile?.id} anchor="section-images" />

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
                src={optimizeCloudinary(url, { aspectRatio: IMAGE_RATIOS.card, width: 320 })}
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
      {/* MEH-1306: back-link to the public map block. */}
      <ViewOnPageLink producerId={profile?.id} anchor="section-location" />

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
// MEH-1173: "תיאור העסק" card (was "ביו AI" / BioPanelCard). Direction 2 —
// Shopify Magic pattern: ONE hero description field is the product; AI is a
// quiet assist INSIDE the card. The assist replaces the old free-text source
// + Instagram scrape (deleted backend-side) with a 3-question structured form.
//   • hero textarea = description (always visible, prefilled, 150 counter)
//   • tagline input = short_description (public card, MEH-1002 gap closed)
//   • ONE save → PUT /producers/me {description, short_description}
//   • generate fills the hero with a transient primary/10 highlight + toast;
//     an empty fail-open result NEVER wipes existing text (MEH-1163 guard).
//   • error mapping split by cause preserved 1:1 (MEH-1157): 401 / 429 /
//     200 {"bio":""} fail-open / other.
// ============================================================

const DESC_MAX = 150;
const TAGLINE_MAX = 160;
const HIGHLIGHT_MS = 2500;

// The inline 3-question assist form. Bundled state passed as one `assist`
// object so this stays a 2-arg component (exec §8 / max-params). q_sell is the
// only required field — the "צרו תיאור" button gates on it, with a visible
// reason line so a disabled button is never a dead end.
function AssistForm({ t, assist }) {
  const {
    sells, setSells, area, setArea, special, setSpecial,
    instagram, setInstagram, generate, close, loading, error,
  } = assist;
  const canGenerate = !!sells.trim();

  return (
    <div className="bg-primary/5 border border-primary/15 rounded-[12px] p-3 space-y-3">
      <div className="flex items-center gap-2">
        <Sparkle size={16} weight="fill" className="text-accent shrink-0" aria-hidden="true" />
        <strong className="text-sm flex-1">{t("assist_title")}</strong>
        <button
          type="button"
          onClick={close}
          aria-label={t("assist_close")}
          className="text-fg-muted hover:text-text transition"
        >
          <X size={14} aria-hidden="true" />
        </button>
      </div>

      <AssistField
        label={t("q_sell_label")}
        value={sells}
        onChange={setSells}
        placeholder={t("q_sell_placeholder")}
      />
      <AssistField
        label={t("q_area_label")}
        value={area}
        onChange={setArea}
        placeholder={t("q_area_placeholder")}
        optional={t("optional")}
      />
      <AssistField
        label={t("q_special_label")}
        value={special}
        onChange={setSpecial}
        placeholder={t("q_special_placeholder")}
        optional={t("optional")}
      />
      <div className="space-y-1">
        <div className="flex items-center gap-2">
          <label className="text-xs font-medium">{t("instagram_label")}</label>
          <span className="text-[10px] text-fg-muted border border-border rounded-full px-2 py-px">
            {t("optional")}
          </span>
        </div>
        <input
          type="text"
          value={instagram}
          onChange={(e) => setInstagram(e.target.value.slice(0, 200))}
          placeholder="https://instagram.com/…"
          className="w-full border border-border bg-surface rounded-[10px] px-3 py-2 text-sm"
          dir="ltr"
          maxLength={200}
        />
        <p className="text-[11px] text-fg-muted">{t("instagram_hint")}</p>
      </div>

      <button
        type="button"
        onClick={generate}
        disabled={!canGenerate || loading}
        className="w-full bg-primary text-white py-2 rounded-[10px] text-sm font-medium disabled:opacity-50 hover:bg-primary-dark transition flex items-center justify-center gap-2"
      >
        <Sparkle size={15} weight="fill" aria-hidden="true" />
        {loading ? t("generating") : t("generate_cta")}
      </button>
      {!canGenerate && (
        <p className="text-[11px] text-fg-muted text-center">{t("generate_hint_disabled")}</p>
      )}
      {error && (
        <p className="text-xs text-error flex items-start gap-1.5" role="alert">
          <Warning size={15} weight="fill" aria-hidden="true" className="shrink-0 mt-px" />
          {error}
        </p>
      )}
    </div>
  );
}

// One structured question row. dir="auto" so Hebrew answers flow RTL (fixes the
// old LTR source field's broken bidi).
function AssistField({ label, value, onChange, placeholder, optional }) {
  return (
    <div className="space-y-1">
      <div className="flex items-center gap-2">
        <label className="text-xs font-medium">{label}</label>
        {optional && (
          <span className="text-[10px] text-fg-muted border border-border rounded-full px-2 py-px">
            {optional}
          </span>
        )}
      </div>
      <input
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value.slice(0, 200))}
        placeholder={placeholder}
        className="w-full border border-border bg-surface rounded-[10px] px-3 py-2 text-sm"
        dir="auto"
        maxLength={200}
      />
    </div>
  );
}

// Exported for isolation tests (EditTabDescriptionCard.test.jsx) — see CategoriesCard.
export function DescriptionCard({ profile, onSave, reportDirty = () => {} }) {
  const t = useTranslations("dashboard.producer.description_card");
  const [description, setDescription] = useState(profile.description || "");
  const [savedDescription, setSavedDescription] = useState(profile.description || "");
  const [tagline, setTagline] = useState(profile.short_description || "");
  const [savedTagline, setSavedTagline] = useState(profile.short_description || "");
  const [assistOpen, setAssistOpen] = useState(false);
  const [sells, setSells] = useState("");
  const [area, setArea] = useState("");
  const [special, setSpecial] = useState("");
  const [instagram, setInstagram] = useState(profile.instagram || "");
  // MEH-1261 F5: the instagram edit used to feed ONLY the AI-generate payload
  // and was silently dropped on save — the one rendered field whose edit did
  // not persist. It now joins the card's save contract (the backend owner
  // whitelist already accepts `instagram` — producer_me.py _PRODUCER_WRITABLE_FIELDS).
  const [savedInstagram, setSavedInstagram] = useState(profile.instagram || "");
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [highlight, setHighlight] = useState(false);
  const [error, setError] = useState("");

  // Dirty covers ALL saved fields — the single save button owns them together.
  const dirty =
    description !== savedDescription ||
    tagline !== savedTagline ||
    instagram !== savedInstagram;
  useEffect(() => {
    reportDirty("bio", dirty);
    return () => reportDirty("bio", false);
  }, [dirty, reportDirty]);

  // The generated-highlight is transient — fades on its own (calm idiom, no
  // manual dismissal). Respects prefers-reduced-motion via the CSS transition.
  useEffect(() => {
    if (!highlight) return undefined;
    const id = setTimeout(() => setHighlight(false), HIGHLIGHT_MS);
    return () => clearTimeout(id);
  }, [highlight]);

  const generate = async () => {
    if (!sells.trim()) return;
    setLoading(true);
    setError("");
    try {
      const r = await api.post("/producers/me/bio/generate", {
        sells: sells.trim(),
        area: area.trim() || null,
        special: special.trim() || null,
        instagram: instagram.trim() || null,
      });
      // MEH-1157: fail-open backend returns 200 {"bio":""} when AI is down —
      // say so. MEH-1163: an empty result must NEVER wipe existing text.
      if (r.data.bio) {
        setDescription(r.data.bio.slice(0, DESC_MAX));
        setSaved(false);
        setHighlight(true);
        setAssistOpen(false);
        showToast.success(t("toast_generated"));
      } else {
        setError(t("error_unavailable"));
      }
    } catch (err) {
      const status = err?.response?.status;
      if (status === 401) setError(t("error_session_expired"));
      else if (status === 429) setError(t("error_rate_limit"));
      else setError(t("error_generate"));
    }
    setLoading(false);
  };

  const save = async () => {
    if (!dirty) return;
    setSaving(true);
    setError("");
    const short_description = tagline.trim() ? tagline : null;
    // MEH-1261 F5: persist the instagram edit too (trimmed; empty clears).
    const instagramValue = instagram.trim() || null;
    try {
      await api.put("/producers/me", {
        description,
        short_description,
        instagram: instagramValue,
      });
      onSave({ description, short_description, instagram: instagramValue });
      setSavedDescription(description);
      setSavedTagline(tagline);
      setSavedInstagram(instagram);
      setSaved(true);
    } catch {
      setError(t("error_save"));
    }
    setSaving(false);
  };

  return (
    <div className="space-y-4">
      {/* MEH-1116: card chrome + heading live in the EditAccordionCard header. */}
      <p className="text-xs text-fg-muted">{t("intro")}</p>
      {/* MEH-1306: back-link to the public description section. */}
      <ViewOnPageLink producerId={profile?.id} anchor="section-bio" />

      {/* Hero: the description IS the product. Always visible, prefilled. */}
      <div className="space-y-1.5">
        <div className="flex items-baseline gap-2">
          <label className="text-sm font-medium">{t("desc_label")}</label>
          <span className="text-[11px] text-fg-muted">{t("desc_where")}</span>
        </div>
        <textarea
          value={description}
          onChange={(e) => { setDescription(e.target.value.slice(0, DESC_MAX)); setSaved(false); }}
          placeholder={t("desc_placeholder")}
          className={`w-full rounded-[10px] px-3 py-2 text-sm resize-none h-24 transition-colors duration-500 ${
            highlight
              ? "border border-primary bg-primary/10 ring-2 ring-primary/20"
              : "border border-primary/30 bg-primary/5"
          }`}
          dir="auto"
          maxLength={DESC_MAX}
        />
        <div className="flex items-center justify-end">
          <span className="text-xs text-fg-muted tabular-nums" dir="ltr">
            {description.length}/{DESC_MAX}
          </span>
        </div>
      </div>

      {/* Assist: quiet text-button → inline structured form. */}
      {assistOpen ? (
        <AssistForm
          t={t}
          assist={{
            sells, setSells, area, setArea, special, setSpecial,
            // MEH-1261 F5: instagram edits are saved fields now — editing one
            // drops the "נשמר" label like the description/tagline inputs do.
            instagram,
            setInstagram: (v) => { setInstagram(v); setSaved(false); },
            generate, close: () => setAssistOpen(false),
            loading, error,
          }}
        />
      ) : (
        <button
          type="button"
          onClick={() => setAssistOpen(true)}
          className="inline-flex items-center gap-2 text-primary font-medium text-sm self-start hover:text-primary-dark transition"
        >
          <Sparkle size={15} weight="fill" aria-hidden="true" />
          {t("assist_cta")}
        </button>
      )}

      {/* Tagline → short_description (public card in search + listings). */}
      <div className="space-y-1.5">
        <div className="flex items-baseline gap-2">
          <label className="text-sm font-medium">{t("tagline_label")}</label>
          <span className="text-[11px] text-fg-muted">{t("tagline_where")}</span>
        </div>
        <input
          type="text"
          value={tagline}
          onChange={(e) => { setTagline(e.target.value.slice(0, TAGLINE_MAX)); setSaved(false); }}
          placeholder={t("tagline_placeholder")}
          className="w-full border border-primary/30 bg-primary/5 rounded-[10px] px-3 py-2 text-sm"
          dir="auto"
          maxLength={TAGLINE_MAX}
        />
        <div className="flex items-center justify-end">
          <span className="text-xs text-fg-muted tabular-nums" dir="ltr">
            {tagline.length}/{TAGLINE_MAX}
          </span>
        </div>
      </div>

      {/* ONE explicit save for the whole card. */}
      <button
        onClick={save}
        disabled={saving || !dirty}
        className="bg-primary text-white px-4 py-2 rounded-[10px] text-sm font-medium disabled:opacity-60 hover:bg-primary-dark transition"
      >
        <span aria-live="polite" aria-atomic="true">
          {saving ? t("saving") : saved ? t("saved") : t("save_cta")}
        </span>
      </button>

      {error && !assistOpen && (
        <p className="text-xs text-error flex items-start gap-1.5" role="alert">
          <Warning size={15} weight="fill" aria-hidden="true" className="shrink-0 mt-px" />
          {error}
        </p>
      )}
    </div>
  );
}

// ============================================================
// MEH-1242 PR3: producer-facing price-range + top-product editor.
// Frontend-only gap: the owner whitelist (_PRODUCER_WRITABLE_FIELDS,
// producer_me.py) already accepts `price_range` + `top_product_name` — there
// was just no UI in the edit tab. Mirrors LocationCard's card/save/dirty/
// inline-error contract; persists via PUT /producers/me.
// REUSES: edit/cards.jsx LocationCard (save/dirty/reportDirty contract).
// ============================================================

// Exported for isolation tests (EditTabPricingCard.test.jsx).
export function PricingCard({ profile, onSave, reportDirty = () => {} }) {
  const t = useTranslations("dashboard.producer.pricing");
  const seedTop = profile?.top_product_name ?? "";
  const seedPrice = profile?.price_range ?? "";
  const [topProduct, setTopProduct] = useState(seedTop);
  const [priceRange, setPriceRange] = useState(seedPrice);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [errorMsg, setErrorMsg] = useState(null);

  const dirty = topProduct !== seedTop || priceRange !== seedPrice;
  // MEH-1100: lift to the page-level unsaved-changes aggregate.
  useEffect(() => {
    reportDirty("pricing", dirty);
    return () => reportDirty("pricing", false);
  }, [dirty, reportDirty]);

  const handleSave = async () => {
    setSaving(true);
    setSaved(false);
    setErrorMsg(null);
    try {
      const payload = {
        top_product_name: topProduct.trim() || null,
        price_range: priceRange.trim() || null,
      };
      await api.put("/producers/me", payload);
      onSave(payload);
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
      {/* Chrome + heading live in the EditAccordionCard header (MEH-1116). */}
      <p className="text-xs text-fg-muted mb-4">{t("subtitle")}</p>

      <div className="space-y-3">
        <Input
          type="text"
          label={t("field_top_product")}
          value={topProduct}
          maxLength={80}
          onChange={(e) => setTopProduct(e.target.value)}
          placeholder={t("top_product_placeholder")}
        />
        <Input
          type="text"
          label={t("field_price_range")}
          value={priceRange}
          maxLength={60}
          onChange={(e) => setPriceRange(e.target.value)}
          placeholder={t("price_range_placeholder")}
        />
      </div>

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
// MEH-1276: producer-facing opening-hours editor. Was a free-text LTR field
// (MEH-1242 PR5) that expected the machine format "Sun-Thu 09:00-18:00" and
// silently dropped any deviation. Now a structured Hebrew editor (7 day rows +
// toggle + time inputs) that serialises to the same canonical string — storage,
// API, and lib/hours.parseHours are unchanged. Editor lives in HoursEditor.jsx
// (cards.jsx is already >1200 lines); this stays a thin, test-exported wrapper.
// ============================================================

// Exported for isolation tests (EditTabDeliveryCard.test.jsx covers the pair).
export function HoursCard({ profile, onSave, reportDirty = () => {} }) {
  return <HoursEditor profile={profile} onSave={onSave} reportDirty={reportDirty} />;
}

// ============================================================
// MEH-1258: producer-facing license-number editor — closes the "נשאר להשלים:
// חסר מספר רישיון יצרן" loop (MEH-1011 banner asks, MEH-1236 resubmits, this
// card is where she actually fills it). Backend write path already open
// (MEH-530: producer_license_number in _PRODUCER_WRITABLE_FIELDS,
// producer_me.py:205) — same "missing editor" family as MEH-1242 PR3.
// The clear-while-category-requires guard stays server-side ONLY (MEH-999 2c,
// producer_me.py:143-152); its Hebrew 422 detail is surfaced inline via
// detailToMessage — never duplicated client-side.
// REUSES: components/admin/ProducerForm.jsx:42-97 (ProducerLicenseField —
// numeric / dir="ltr" / maxLength 20 / non-blocking format warning),
// producer-self version on the PricingCard save/dirty contract.
// ============================================================

// Exported for isolation tests (EditTabLicenseCard.test.jsx) — see CategoriesCard.
export function LicenseCard({ profile, onSave, reportDirty = () => {} }) {
  const t = useTranslations("dashboard.producer.license");
  // Format-warning copy reused verbatim from the admin field — one Hebrew SoT
  // (same reuse idiom as MEH-1237's heading strings).
  const tAdmin = useTranslations("admin.producers.form.fields");
  const seed = profile?.producer_license_number ?? "";
  const [value, setValue] = useState(seed);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [errorMsg, setErrorMsg] = useState(null);

  const dirty = value !== seed;
  // MEH-1100: lift to the page-level unsaved-changes aggregate.
  useEffect(() => {
    reportDirty("license", dirty);
    return () => reportDirty("license", false);
  }, [dirty, reportDirty]);

  // UX nudge only (lib/license-required-categories.js) — enforcement is
  // ensure_license_for_categories server-side, regardless of this flag.
  const required = requiresProducerLicense(
    profile?.categories || [],
    (profile?.categories || []).map((c) => c.id),
  );
  const warning = hasLicenseFormatWarning(value);

  const handleSave = async () => {
    setSaving(true);
    setSaved(false);
    setErrorMsg(null);
    try {
      const payload = { producer_license_number: value.trim() || null };
      await api.put("/producers/me", payload);
      onSave(payload);
      // MEH-1270: persist the success signal until the next edit (onChange
      // resets it) — the prior 3s auto-hide made a real save read as a failed
      // one. The masked header chip updates via onSave→profile immediately.
      setSaved(true);
    } catch (err) {
      // Surfaces the MEH-999 2c clear-while-required Hebrew 422 inline.
      setErrorMsg(detailToMessage(err?.response?.data?.detail) || t("save_error"));
    } finally {
      setSaving(false);
    }
  };

  return (
    <div>
      {/* Chrome + heading live in the EditAccordionCard header (MEH-1116). */}
      {required && (
        <p className="text-xs text-fg-muted mb-3">{t("required_hint")}</p>
      )}
      <Input
        type="text"
        dir="ltr"
        inputMode="numeric"
        maxLength={20}
        label={t("field_label")}
        value={value}
        onChange={(e) => {
          setValue(e.target.value);
          setSaved(false);
          setErrorMsg(null);
        }}
      />
      {warning && (
        // Amber + non-blocking, mirroring the admin field — the backend
        // deliberately doesn't enforce the regex (manual-approval flow).
        <p className="text-xs text-amber-600 mt-1">
          {tAdmin("license_format_warning")}
        </p>
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
        {saving ? t("saving") : t("save_cta")}
      </button>

      {/* MEH-1270: explicit, persistent success confirmation — the single
          live region for the card (the button no longer swaps its label, so
          a real save can't read as a failed one). Cleared on the next edit;
          the masked header chip updates via onSave→profile immediately. */}
      {saved && !errorMsg && (
        <p
          className="mt-3 flex items-center gap-1.5 text-xs text-primary"
          role="status"
          data-testid="license-save-success"
        >
          <CheckCircle size={16} weight="fill" aria-hidden="true" className="shrink-0" />
          {t("save_success")}
        </p>
      )}
    </div>
  );
}

// ============================================================
// MEH-1242 PR5: producer-facing location-mode + delivery editor. Mirrors the
// admin ProducerForm "business_type" section (physical-store toggle, delivery
// toggle, nationwide-or-cities via CitiesAutocomplete). The owner now writes
// has_physical_location / offers_delivery / delivery_nationwide (previously
// admin-only) plus delivery_area_cities. Client blocks the invalid states the
// backend ProducerUpdate._validate_location_mode also 422s (neither type;
// nationwide + cities). REUSES: components/admin/ProducerForm.jsx:491-543.
// ============================================================

// Exported for isolation tests (EditTabDeliveryCard.test.jsx).
export function DeliveryCard({ profile, onSave, reportDirty = () => {} }) {
  const t = useTranslations("dashboard.producer.delivery");
  const initial = {
    hasPhysical: profile?.has_physical_location ?? true,
    offersDelivery: profile?.offers_delivery ?? false,
    nationwide: profile?.delivery_nationwide ?? false,
    cities: profile?.delivery_areas?.map((d) => d.city).filter(Boolean) ?? [],
    // MEH-1255: nationwide exclusion list ("לכל הארץ חוץ מ:").
    excluded: profile?.delivery_excluded_cities ?? [],
  };
  const [baseline, setBaseline] = useState(initial);
  const [form, setForm] = useState(initial);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [errorMsg, setErrorMsg] = useState(null);

  const set = (patch) => {
    setForm((f) => ({ ...f, ...patch }));
    setSaved(false);
  };

  const dirty =
    form.hasPhysical !== baseline.hasPhysical ||
    form.offersDelivery !== baseline.offersDelivery ||
    form.nationwide !== baseline.nationwide ||
    form.cities.length !== baseline.cities.length ||
    form.cities.some((c, i) => c !== baseline.cities[i]) ||
    form.excluded.length !== baseline.excluded.length ||
    form.excluded.some((c, i) => c !== baseline.excluded[i]);
  useEffect(() => {
    reportDirty("delivery", dirty);
    return () => reportDirty("delivery", false);
  }, [dirty, reportDirty]);

  const neitherType = !form.hasPhysical && !form.offersDelivery;
  const citiesMissing =
    form.offersDelivery && !form.nationwide && form.cities.length === 0;
  const blocked = neitherType || citiesMissing;

  const handleSave = async () => {
    setSaving(true);
    setSaved(false);
    setErrorMsg(null);
    // Normalise: nationwide/cities only meaningful when delivering; cities
    // cleared when nationwide (matches admin form + the backend XOR guard).
    // MEH-1255: excluded list only meaningful in nationwide-delivery mode.
    const cities = form.offersDelivery && !form.nationwide ? form.cities : [];
    const excluded =
      form.offersDelivery && form.nationwide ? form.excluded : [];
    const normalized = {
      hasPhysical: form.hasPhysical,
      offersDelivery: form.offersDelivery,
      nationwide: form.offersDelivery ? form.nationwide : false,
      cities,
      excluded,
    };
    try {
      await api.put("/producers/me", {
        has_physical_location: normalized.hasPhysical,
        offers_delivery: normalized.offersDelivery,
        delivery_nationwide: normalized.nationwide,
        delivery_area_cities: normalized.cities,
        delivery_excluded_cities: normalized.excluded,
      });
      // Patch the parent profile so LocationCard gating + re-seeds stay in sync.
      onSave({
        has_physical_location: normalized.hasPhysical,
        offers_delivery: normalized.offersDelivery,
        delivery_nationwide: normalized.nationwide,
        delivery_areas: normalized.cities.map((c) => ({ city: c })),
        delivery_excluded_cities: normalized.excluded,
      });
      setBaseline(normalized);
      setForm(normalized);
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
      <p className="text-xs text-fg-muted mb-4">{t("subtitle")}</p>

      <div className="space-y-3">
        <label className="flex items-center gap-2 text-sm cursor-pointer">
          <input
            type="checkbox"
            checked={form.hasPhysical}
            onChange={(e) => set({ hasPhysical: e.target.checked })}
            className="w-4 h-4 accent-primary"
          />
          {t("has_physical_location")}
        </label>
        <label className="flex items-center gap-2 text-sm cursor-pointer">
          <input
            type="checkbox"
            checked={form.offersDelivery}
            onChange={(e) => set({ offersDelivery: e.target.checked })}
            className="w-4 h-4 accent-primary"
          />
          {t("offers_delivery")}
        </label>
        {neitherType && (
          <p className="text-xs text-red-600">{t("type_validation")}</p>
        )}
        {form.offersDelivery && (
          <div className="ms-6 space-y-3 border-s-2 border-border ps-4 pt-1">
            <label className="flex items-center gap-2 text-sm cursor-pointer">
              <input
                type="checkbox"
                checked={form.nationwide}
                onChange={(e) =>
                  set({
                    nationwide: e.target.checked,
                    ...(e.target.checked ? { cities: [] } : {}),
                  })
                }
                className="w-4 h-4 accent-primary"
              />
              {t("delivery_nationwide")}
            </label>
            {!form.nationwide && (
              <div>
                <span className="block text-sm text-muted mb-1">
                  {t("delivery_cities_label")}
                </span>
                <CitiesAutocomplete
                  value={form.cities}
                  onChange={(cities) => set({ cities })}
                  showRegionChips
                />
                {form.cities.length === 0 && (
                  <p className="text-xs text-red-600 mt-1">
                    {t("delivery_cities_required")}
                  </p>
                )}
              </div>
            )}
            {/* MEH-1255: nationwide exclusion list — "לכל הארץ חוץ מ:" */}
            {form.nationwide && (
              <div>
                <span className="block text-sm text-muted mb-1">
                  {t("delivery_excluded_label")}
                </span>
                <p className="text-xs text-fg-muted mb-1">
                  {t("delivery_excluded_hint")}
                </p>
                <CitiesAutocomplete
                  value={form.excluded}
                  onChange={(excluded) => set({ excluded })}
                  showRegionChips
                />
              </div>
            )}
          </div>
        )}
      </div>

      {errorMsg && (
        <p className="mt-3 flex items-center gap-1.5 text-xs text-red-600" role="alert">
          <Warning size={16} weight="fill" aria-hidden="true" className="shrink-0" />
          {errorMsg}
        </p>
      )}

      <button
        onClick={handleSave}
        disabled={saving || !dirty || blocked}
        className="mt-4 bg-primary text-white px-4 py-2 rounded-[10px] text-sm font-medium hover:bg-primary-dark transition disabled:opacity-60"
      >
        <span aria-live="polite" aria-atomic="true">
          {saving ? t("saving") : saved ? t("saved") : t("save_cta")}
        </span>
      </button>
    </div>
  );
}
