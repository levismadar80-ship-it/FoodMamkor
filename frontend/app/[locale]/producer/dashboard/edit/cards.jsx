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

import { useState, useEffect, useCallback } from "react";
// MEH-1306: locale-aware link for the "view on page" back-link below.
import { Link as LocaleLink } from "@/i18n/navigation";
import { useTranslations } from "next-intl";
import { Warning, X, Sparkle, CheckCircle, Eye } from "@phosphor-icons/react";
// MEH-1167: reuse the public badge strip (+ its CODE_TO_KEY + MEH-1260 expiry
// gate) for the KashrutCard's "approved" zone — one owner of that render.
import KashrutBadgeStrip, { CODE_TO_KEY } from "@/components/KashrutBadgeStrip";
import api from "@/lib/api";
import { showToast } from "@/lib/toast";
import { detailToMessage } from "@/lib/errors";
import { optimizeCloudinary, IMAGE_RATIOS } from "@/lib/cloudinary";
import { MIN_ESTABLISHED_YEAR, currentIsraelYear } from "@/lib/established-year";
import {
  requiresProducerLicense,
  hasLicenseFormatWarning,
} from "@/lib/license-required-categories";
import EditAccordionCard from "@/components/EditAccordionCard";
// MEH-1539 T3: the owner categories card reuses the REGISTER picker (per-category
// descriptions MEH-1354, popular-6 + search, ≤3 cap MEH-1297, primary-first)
// instead of its own flat checkbox grid. Same selection contract (category_ids).
import CategorySelector from "@/components/CategorySelector";
import CategoryRequestModal from "@/components/CategoryRequestModal";
import AddressSearch from "@/components/AddressSearch";
import Input from "@/components/ui/Input";
import CitiesAutocomplete from "@/components/CitiesAutocomplete";
import { DELIVERY_DAYS } from "@/lib/delivery-days";
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
  // MEH-1539 T3: CategorySelector's no-results CTA needs a destination — the
  // same request-a-category modal the register step opens
  // (RegisterProducerClient.jsx:775). Without it the CTA would be a dead link.
  const [showCategoryModal, setShowCategoryModal] = useState(false);

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
        <CategorySelector
          categories={allCategories}
          selectedIds={selected}
          onChange={toggle}
          onRequestCategory={() => setShowCategoryModal(true)}
        />
      )}

      <CategoryRequestModal
        open={showCategoryModal}
        onClose={() => setShowCategoryModal(false)}
        producerId={profile?.id ?? null}
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

// MEH-1352: free-plan image cap surfaced in the UI. Single source for the
// magic number in JSX — the authoritative enforcement is the 403 in
// backend/app/routers/upload.py (free plan, len(images) >= 3); keep in sync.
const FREE_IMAGE_CAP = 3;

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

  // MEH-1352: cap applies to the free plan only (mirrors the upload.py 403
  // guard). atCap disables the picker; the backend 403 stays as safety net.
  const capApplies = (profile?.plan ?? "free") === "free";
  const atCap = capApplies && images.length >= FREE_IMAGE_CAP;

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

      {/* MEH-1352: the free-plan cap was invisible until the 403 on the 4th
          upload. Show X/cap upfront; numeric span is dir="ltr" so the bidi
          algorithm can't flip "1/3" in the RTL sentence. */}
      {capApplies && (
        <p className="text-xs text-fg-muted mb-2" data-testid="images-cap-counter">
          {t.rich("counter", {
            num: () => (
              <span dir="ltr" className="numeric">{`${images.length}/${FREE_IMAGE_CAP}`}</span>
            ),
          })}
        </p>
      )}

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
        onDrop={atCap ? (e) => e.preventDefault() : handleDrop}
        className={`inline-flex items-center text-sm border border-dashed rounded-[10px] px-4 py-3 transition focus-within:border-primary focus-within:ring-2 focus-within:ring-primary/30 ${
          atCap
            ? "border-border text-fg-muted cursor-not-allowed"
            : dragOver
              ? "border-primary bg-green-50 cursor-pointer"
              : "border-border hover:bg-green-50 cursor-pointer"
        }`}
      >
        <input
          type="file"
          accept="image/*"
          multiple
          className="sr-only"
          disabled={uploading || atCap}
          onChange={handleUpload}
        />
        {atCap
          ? t("zone_full")
          : uploading
            ? t("uploading")
            : dragOver
              ? t("drop_here")
              : t("add_cta")}
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
              {/* raw img: producer/admin-submitted URLs reach this grid, and
                  optimizeCloudinary passes a non-Cloudinary URL through
                  unchanged (cloudinary.js:24). next/image THROWS on a src that
                  is neither absolute nor leading-slash (image-loader.ts:93) —
                  it does not degrade — so migrating here trades a broken
                  thumbnail for a crashed dashboard. Measured, see PR. */}
              {/* MEH-2033: the thumb appearing IS the upload success state
                  (no live region), so alt="" announced nothing. The section's
                  existing key is the plural heading — imperfect for one thumb,
                  but the card bans new i18n keys; stated in the PR. */}
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={optimizeCloudinary(url, { aspectRatio: IMAGE_RATIOS.card, width: 320 })}
                alt={t("heading")}
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

// Deliberately TIGHTER than the schemas.py sanitize caps (description 2000,
// short_description 160/200) — product-length choices, not mirrors. The
// invariant that must hold is client <= server (otherwise the UI accepts
// input the server silently truncates); enforced by
// scripts/checks/length-cap-sync-guard.sh (MEH-1393).
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
        {/* MEH-1608: handle-shaped placeholder via i18n — the old hardcoded
            "https://instagram.com/…" told owners to type the exact value
            that broke their public link (ContactCard composes the URL). */}
        <input
          type="text"
          value={instagram}
          onChange={(e) => setInstagram(e.target.value.slice(0, 200))}
          placeholder={t("instagram_placeholder")}
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
// MEH-1335 chunk 3: owner-story editor — the data source for the public
// owner card (OwnerCard, MEH-1334; bio/photo variants wake up on their own
// once these fields hold data). Bio persists via PUT /producers/me
// (owner_bio is in _PRODUCER_WRITABLE_FIELDS); the photo goes through the
// dedicated POST /upload/owner-photo which persists owner_photo_url
// atomically server-side (no follow-up PUT — and deliberately NO freemium
// gate, unlike the /upload/image gallery cap).
// REUSES: edit/cards.jsx DescriptionCard (save/dirty/counter contract) +
// ImagesCard uploadFiles (upload error surface via detailToMessage).
// ============================================================

// Mirrors the schemas.py owner_bio sanitize cap — equality is mechanically
// enforced by scripts/checks/length-cap-sync-guard.sh (MEH-1393), so a drift
// on either side reds the Repo-guards CI job instead of shipping silently.
const OWNER_BIO_MAX = 300;

// Exported for isolation tests (EditTabOwnerStoryCard.test.jsx) — see CategoriesCard.
export function OwnerStoryCard({ profile, onSave, reportDirty = () => {} }) {
  const t = useTranslations("dashboard.producer.owner_story");
  const [bio, setBio] = useState(profile.owner_bio || "");
  const [savedBio, setSavedBio] = useState(profile.owner_bio || "");
  // MEH-1385 addendum (MEH-1392 F2): contact_name was public-read on OwnerCard
  // but admin-write only. Same OwnerCard surface → folded into this card. The
  // field is already in _PRODUCER_WRITABLE_FIELDS (producer_me.py), so it rides
  // the same explicit PUT as the bio.
  const [contactName, setContactName] = useState(profile.contact_name || "");
  const [savedContactName, setSavedContactName] = useState(profile.contact_name || "");
  // MEH-1541: self-reported founding year → the quiet "מאז {שנה}" masthead line.
  // Kept as a string in state (the native number input's value) and coerced to
  // int|null on save. Empty string clears the value.
  const [year, setYear] = useState(profile.established_year ?? "");
  const [savedYear, setSavedYear] = useState(profile.established_year ?? "");
  const [photoUrl, setPhotoUrl] = useState(profile.owner_photo_url || "");
  const [uploading, setUploading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState("");

  const dirty =
    bio !== savedBio ||
    contactName !== savedContactName ||
    String(year) !== String(savedYear);
  useEffect(() => {
    reportDirty("ownerStory", dirty);
    return () => reportDirty("ownerStory", false);
  }, [dirty, reportDirty]);

  // The endpoint saves owner_photo_url itself (atomic, MEH-375 fixed-slot
  // overwrite) — success here needs no explicit Save click, mirroring the
  // ImagesCard MEH-1236 "upload≠save trap" fix.
  const uploadPhoto = async (e) => {
    const file = (e.target.files || [])[0];
    e.target.value = "";
    if (!file) return;
    setError("");
    setUploading(true);
    try {
      const fd = new FormData();
      fd.append("file", file);
      const r = await api.post("/upload/owner-photo", fd);
      setPhotoUrl(r.data.url);
      onSave({ owner_photo_url: r.data.url });
    } catch (err) {
      setError(detailToMessage(err?.response?.data?.detail) || t("upload_error"));
    } finally {
      setUploading(false);
    }
  };

  const save = async () => {
    if (!dirty) return;
    setSaving(true);
    setError("");
    const owner_bio = bio.trim() || null;
    const contact_name = contactName.trim() || null;
    // MEH-1541: "" clears the year; otherwise send the integer. Range
    // (1800..current year) is enforced server-side (422 → surfaced below).
    const established_year =
      String(year).trim() === "" ? null : Number(year);
    try {
      await api.put("/producers/me", { owner_bio, contact_name, established_year });
      onSave({ owner_bio, contact_name, established_year });
      // Track (and show) the normalized value that was actually persisted —
      // storing the raw textarea value would leave a phantom-dirty gap when
      // the input carried trailing whitespace (PR review nit).
      setBio(owner_bio ?? "");
      setSavedBio(owner_bio ?? "");
      setContactName(contact_name ?? "");
      setSavedContactName(contact_name ?? "");
      setYear(established_year ?? "");
      setSavedYear(established_year ?? "");
      setSaved(true);
    } catch (err) {
      // MEH-1541: surface the Hebrew validation detail (e.g. "שנת ההקמה לא
      // תקינה") instead of the generic fallback.
      setError(detailToMessage(err?.response?.data?.detail) || t("error_save"));
    }
    setSaving(false);
  };

  return (
    <div className="space-y-4">
      {/* Card chrome + heading live in the EditAccordionCard header (MEH-1116). */}
      <p className="text-xs text-fg-muted">{t("intro")}</p>

      {/* MEH-1385 addendum: contact person name — public on OwnerCard, was
          admin-only until now (MEH-1392 F2). Saved with the bio on one PUT. */}
      <Input
        type="text"
        label={t("contact_label")}
        value={contactName}
        maxLength={200}
        onChange={(e) => {
          setContactName(e.target.value);
          setSaved(false);
        }}
        placeholder={t("contact_placeholder")}
        data-testid="owner-contact-name-input"
      />

      {/* MEH-1541: founding year (optional) → the quiet "מאז {שנה}" masthead
          line. Numeric field, dir="ltr" so the digits read in LTR order.
          MEH-1581: bounds derive from the shared helper (Israel-tz year),
          parity with the server validator (1800..israel_today().year). */}
      <Input
        type="number"
        label={t("year_label")}
        helperText={t("year_helper")}
        value={year}
        onChange={(e) => {
          setYear(e.target.value);
          setSaved(false);
        }}
        min={MIN_ESTABLISHED_YEAR}
        max={currentIsraelYear()}
        dir="ltr"
        inputMode="numeric"
        data-testid="owner-established-year-input"
      />

      {/* Photo — locked spec label (photo_label). Square face-gravity crop is
          server-side; the round preview mirrors the public OwnerCard avatar. */}
      <div className="space-y-1.5">
        <span className="text-sm font-medium block">{t("photo_label")}</span>
        <div className="flex items-center gap-3">
          {photoUrl ? (
            /* raw img: owner-uploaded photo preview; `photoUrl` may be the
               local /placeholder-image.png fallback (upload.py:115), not a
               Cloudinary URL. Authenticated dashboard chrome, 64px. */
            /* eslint-disable-next-line @next/next/no-img-element */
            <img
              src={photoUrl}
              alt={t("photo_label")}
              className="w-16 h-16 rounded-full object-cover border border-border"
            />
          ) : (
            <span className="w-16 h-16 rounded-full bg-primary/10 border border-border" aria-hidden="true" />
          )}
          <label className="inline-flex items-center gap-2 text-sm font-medium text-primary hover:text-primary-dark cursor-pointer transition">
            <input
              type="file"
              accept="image/*"
              className="sr-only"
              onChange={uploadPhoto}
              disabled={uploading}
              data-testid="owner-photo-input"
            />
            <span aria-live="polite">
              {uploading ? t("uploading") : photoUrl ? t("photo_replace_cta") : t("photo_cta")}
            </span>
          </label>
        </div>
      </div>

      {/* Bio — locked spec label (bio_label) + 300 counter. */}
      <div className="space-y-1.5">
        <div className="flex items-baseline gap-2">
          <label className="text-sm font-medium">{t("bio_label")}</label>
          <span className="text-[11px] text-fg-muted">{t("bio_where")}</span>
        </div>
        <textarea
          value={bio}
          onChange={(e) => { setBio(e.target.value.slice(0, OWNER_BIO_MAX)); setSaved(false); }}
          placeholder={t("bio_placeholder")}
          className="w-full border border-primary/30 bg-primary/5 rounded-[10px] px-3 py-2 text-sm resize-none h-24"
          dir="auto"
          maxLength={OWNER_BIO_MAX}
          data-testid="owner-bio-input"
        />
        <div className="flex items-center justify-end">
          <span className="text-xs text-fg-muted tabular-nums" dir="ltr">
            {bio.length}/{OWNER_BIO_MAX}
          </span>
        </div>
      </div>

      {/* ONE explicit save for the bio (the photo self-persists on upload). */}
      <button
        onClick={save}
        disabled={saving || !dirty}
        className="bg-primary text-white px-4 py-2 rounded-[10px] text-sm font-medium disabled:opacity-60 hover:bg-primary-dark transition"
      >
        <span aria-live="polite" aria-atomic="true">
          {saving ? t("saving") : saved ? t("saved") : t("save_cta")}
        </span>
      </button>

      {error && (
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
      <p className="text-xs text-fg-muted mb-1">{t("subtitle")}</p>
      {/* MEH-1539 T2: what "top product" means + where the pair surfaces. */}
      <p className="text-xs text-fg-muted mb-4">{t("scope_helper")}</p>

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
          helperText={t("price_hint")}
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
      {/* MEH-1597: the "where it appears" line the MEH-1539 standard requires.
          Unconditional — `required_hint` above renders only for a category that
          demands a license, so without this an owner in any other category was
          asked for a regulated number with nothing said about where it goes.
          Deliberately silent on the verified badge: filling this number does
          not grant it (admin-granted after document review, ADR-022), and
          implying otherwise is the over-claim class MEH-1579 fixed. */}
      <p className="text-xs text-fg-muted mb-3">{t("where")}</p>
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
// MEH-1167: producer-facing kashrut-request card — closes the verified-only
// supply gap (MEH-986 removed free-text kosher from every consumer surface, so
// this request flow is the ONLY way a business appears as kosher). Backend POST
// lived since MEH-51 with zero callers (MEH-1392 audit F0); this card + the new
// GET /producers/me/kashrut-requests + POST /upload/kashrut-cert wire it up.
// Three zones: approved badges (reuse KashrutBadgeStrip), own pending/rejected
// requests with status chips, and the request form. Self-fetches its request
// list (not on the /producers/me profile). v1 is image-only (PDF = non-goal).
// REUSES: edit/cards.jsx OwnerStoryCard (upload + persistent-success contract),
// LicenseCard (MEH-1270 role="status" success), components/KashrutBadgeStrip.
// ============================================================

// MEH-1852: the code → he.json `kashrut.badges.*` key axis is imported from
// KashrutBadgeStrip (line 29), which already owns it and which this file
// already imports for the approved-badges zone. There is no marginal cost here
// and never was.
const KASHRUT_CODES = Object.keys(CODE_TO_KEY);

// Exported for isolation tests (EditTabKashrutCard.test.jsx) — see CategoriesCard.
export function KashrutCard({ profile, reportDirty = () => {} }) {
  const t = useTranslations("dashboard.producer.kashrut");
  const tBadges = useTranslations("kashrut.badges");
  const [requests, setRequests] = useState([]);
  const [badgeCode, setBadgeCode] = useState("");
  const [certUrl, setCertUrl] = useState("");
  const [uploading, setUploading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [error, setError] = useState("");

  // A half-filled request form counts as unsaved work (page-level aggregate).
  const dirty = Boolean(badgeCode || certUrl);
  useEffect(() => {
    reportDirty("kashrut", dirty);
    return () => reportDirty("kashrut", false);
  }, [dirty, reportDirty]);

  const loadRequests = useCallback(async () => {
    try {
      const r = await api.get("/producers/me/kashrut-requests");
      setRequests(Array.isArray(r.data) ? r.data : []);
    } catch {
      // Non-blocking: the request form still works if the list read fails.
    }
  }, []);
  useEffect(() => {
    loadRequests();
  }, [loadRequests]);

  const uploadCert = async (e) => {
    const file = (e.target.files || [])[0];
    e.target.value = "";
    if (!file) return;
    setError("");
    setUploading(true);
    try {
      const fd = new FormData();
      fd.append("file", file);
      const r = await api.post("/upload/kashrut-cert", fd);
      setCertUrl(r.data.url);
    } catch (err) {
      setError(detailToMessage(err?.response?.data?.detail) || t("upload_error"));
    } finally {
      setUploading(false);
    }
  };

  const submit = async () => {
    if (!badgeCode) return;
    setSubmitting(true);
    setError("");
    try {
      await api.post("/producers/me/kashrut-request", {
        badge_code: badgeCode,
        cert_url: certUrl || null,
      });
      setSubmitted(true);
      setBadgeCode("");
      setCertUrl("");
      loadRequests();
    } catch (err) {
      // 409 duplicate-pending surfaces the backend Hebrew detail inline.
      setError(detailToMessage(err?.response?.data?.detail) || t("error_submit"));
    } finally {
      setSubmitting(false);
    }
  };

  const approvedBadges = profile?.kashrut_badges || [];
  const openRequests = requests.filter(
    (r) => r.status === "pending" || r.status === "rejected",
  );
  const isEmpty = approvedBadges.length === 0 && openRequests.length === 0;

  return (
    <div className="space-y-4">
      {/* Chrome + heading live in the EditAccordionCard header (MEH-1116). */}
      <p className="text-xs text-fg-muted">{t("intro")}</p>

      {/* MEH-1439: the owner filled the free-text kosher field but has no
          verified certificate — free-text drives NO public "כשר" filter
          appearance (MEH-986, verified-only). Explain why + point at the cert. */}
      {profile?.kosher?.trim() && !profile?.kashrut_verified_at && (
        <p data-testid="kashrut-filter-hint" className="text-xs text-fg-muted">
          {t("filter_hint")}
        </p>
      )}

      {/* Zone 1 — approved badges (reuse the public strip + its expiry gate). */}
      {approvedBadges.length > 0 && (
        <div className="space-y-1.5">
          <span className="text-sm font-medium block">{t("approved_heading")}</span>
          <KashrutBadgeStrip
            badges={approvedBadges}
            verified_at={profile?.kashrut_verified_at}
            expires_at={profile?.kashrut_expires_at}
          />
        </div>
      )}

      {/* Zone 2 — own requests with status chips. */}
      {openRequests.length > 0 && (
        <ul className="space-y-1.5" data-testid="kashrut-requests">
          {openRequests.map((r) => {
            const key = CODE_TO_KEY[r.badge_code];
            const label = key ? tBadges(`${key}.label`) : r.badge_code;
            const rejected = r.status === "rejected";
            return (
              <li key={r.id} className="flex flex-wrap items-center gap-2 text-sm">
                <span className="font-medium">{label}</span>
                <span
                  className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${
                    rejected ? "bg-error/10 text-error" : "bg-primary/10 text-primary"
                  }`}
                >
                  {rejected ? t("status_rejected") : t("status_pending")}
                </span>
                {rejected && r.notes && (
                  <span className="text-xs text-fg-muted">{r.notes}</span>
                )}
              </li>
            );
          })}
        </ul>
      )}

      {isEmpty && <p className="text-xs text-fg-muted">{t("empty")}</p>}

      {/* Zone 3 — request form. */}
      <div className="space-y-3 border-t border-border pt-4">
        <div className="space-y-1.5">
          <label htmlFor="kashrut-badge-select" className="text-sm font-medium block">
            {t("select_label")}
          </label>
          <select
            id="kashrut-badge-select"
            value={badgeCode}
            onChange={(e) => {
              setBadgeCode(e.target.value);
              setSubmitted(false);
            }}
            className="w-full border border-primary/30 bg-primary/5 rounded-[10px] px-3 py-2 text-sm"
            data-testid="kashrut-badge-select"
          >
            <option value="">{t("select_placeholder")}</option>
            {KASHRUT_CODES.map((code) => (
              <option key={code} value={code}>
                {tBadges(`${CODE_TO_KEY[code]}.label`)}
              </option>
            ))}
          </select>
        </div>

        <div className="space-y-1.5">
          <span className="text-sm font-medium block">{t("upload_label")}</span>
          <div className="flex items-center gap-3">
            {certUrl && (
              /* raw img: certificate upload preview, same mixed provenance
                 as the photo above (upload.py:115). */
              /* eslint-disable-next-line @next/next/no-img-element */
              <img
                src={certUrl}
                alt={t("upload_label")}
                className="w-16 h-16 rounded-[8px] object-cover border border-border"
              />
            )}
            <label className="inline-flex items-center gap-2 text-sm font-medium text-primary hover:text-primary-dark cursor-pointer transition">
              <input
                type="file"
                accept="image/*"
                className="sr-only"
                onChange={uploadCert}
                disabled={uploading}
                data-testid="kashrut-cert-input"
              />
              <span aria-live="polite">
                {uploading
                  ? t("uploading")
                  : certUrl
                    ? t("upload_replace_cta")
                    : t("upload_cta")}
              </span>
            </label>
          </div>
        </div>

        <button
          onClick={submit}
          disabled={submitting || !badgeCode}
          className="bg-primary text-white px-4 py-2 rounded-[10px] text-sm font-medium disabled:opacity-60 hover:bg-primary-dark transition"
        >
          <span aria-live="polite" aria-atomic="true">
            {submitting ? t("submitting") : t("submit_cta")}
          </span>
        </button>

        {error && (
          <p className="text-xs text-error flex items-start gap-1.5" role="alert">
            <Warning size={15} weight="fill" aria-hidden="true" className="shrink-0 mt-px" />
            {error}
          </p>
        )}
        {submitted && !error && (
          <p
            className="flex items-center gap-1.5 text-xs text-primary"
            role="status"
            data-testid="kashrut-submit-success"
          >
            <CheckCircle size={16} weight="fill" aria-hidden="true" className="shrink-0" />
            {t("success")}
          </p>
        )}
      </div>
    </div>
  );
}

// MEH-1577: mirrors backend/app/schemas/schemas.py MAX_DELIVERY_MONEY. Not
// importable across the Python/JS boundary, so kept in sync by hand — the
// ceiling exists to catch a typo before the round-trip 422, not as security.
const MAX_DELIVERY_MONEY = 1_000_000;

// ============================================================
// MEH-1242 PR5: producer-facing location-mode + delivery editor. Mirrors the
// admin ProducerForm "business_type" section (physical-store toggle, delivery
// toggle, nationwide-or-cities via CitiesAutocomplete). The owner now writes
// has_physical_location / offers_delivery / delivery_nationwide (previously
// admin-only). Client blocks the invalid states the backend
// ProducerUpdate._validate_location_mode also 422s (neither type;
// nationwide + cities). REUSES: components/admin/ProducerForm.jsx:491-543.
// MEH-1644: saves STRUCTURED delivery_areas rows (city · delivery_day ·
// min_order) instead of the flat delivery_area_cities list — each city gets
// an optional canonical-day select (lib/delivery-days.js mirrors the backend
// whitelist), and registration-captured min_order survives the save instead
// of being wiped by the flat delete+insert path. The admin form still uses
// the flat list (it has no day input — nothing to align).
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
    // MEH-1577: structured delivery cost. Held as STRINGS in form state (an
    // <input> value must be), with "" meaning "not stated" → null on save.
    // `?? ""` and not `|| ""`: a stored 0 is a real value ("משלוח חינם") and
    // `||` would blank the field every time the owner reopened the form.
    fee: profile?.delivery_fee ?? "",
    freeAbove: profile?.free_delivery_above ?? "",
    // MEH-1644: optional per-city dispatch day (canonical Hebrew values —
    // lib/delivery-days.js mirrors the backend whitelist). "" = no day
    // ("בתיאום מראש"). Legacy free-text values not in the vocabulary load as
    // "" so the select never offers an unstorable value; the stored row is
    // only rewritten on the next save (expand-only).
    days: Object.fromEntries(
      (profile?.delivery_areas ?? [])
        .filter((d) => d.city)
        .map((d) => [d.city, DELIVERY_DAYS.includes(d.delivery_day) ? d.delivery_day : ""]),
    ),
    // MEH-1772 chunk 3: optional per-city fee override. Same string-in-form-
    // state convention as `fee`/`freeAbove` above ("" = not stated → null on
    // save), and the same `?? ""` rather than `|| ""` — a stored 0 means
    // "משלוח חינם for this city" and `||` would blank it on every reopen,
    // silently converting the free case back to "inherits the business rate".
    fees: Object.fromEntries(
      (profile?.delivery_areas ?? [])
        .filter((d) => d.city)
        .map((d) => [d.city, d.delivery_fee ?? ""]),
    ),
  };
  // MEH-1644: min_order isn't editable here, but the structured save must not
  // wipe values registration captured — carry them through per city.
  const minOrders = Object.fromEntries(
    (profile?.delivery_areas ?? [])
      .filter((d) => d.city && d.min_order != null)
      .map((d) => [d.city, d.min_order]),
  );
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
    form.excluded.some((c, i) => c !== baseline.excluded[i]) ||
    // MEH-1577: String() both sides — baseline holds numbers after a save,
    // form holds input strings, and 35 !== "35" would keep the card
    // permanently dirty (blocking the unsaved-changes guard from ever clearing).
    String(form.fee) !== String(baseline.fee) ||
    String(form.freeAbove) !== String(baseline.freeAbove) ||
    // MEH-1644: a day change on any currently-chosen city is a real edit.
    form.cities.some((c) => (form.days[c] || "") !== (baseline.days[c] || "")) ||
    // MEH-1772 chunk 3: same for a per-city fee. String() both sides for the
    // MEH-1577 reason above — baseline holds numbers after a save, form holds
    // input strings, and 20 !== "20" would keep the card permanently dirty.
    form.cities.some(
      (c) => String(form.fees[c] ?? "") !== String(baseline.fees[c] ?? ""),
    );
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
    // MEH-1577: "" → null (owner cleared the field / never filled it), any
    // other value → Number. Written as an explicit ""-check rather than
    // `Number(v) || null`, which would turn a legitimate 0 into null and
    // silently downgrade "delivery is free" to "cost not stated".
    const toNullableInt = (v) => (v === "" || v == null ? null : Number(v));
    const normalized = {
      hasPhysical: form.hasPhysical,
      offersDelivery: form.offersDelivery,
      nationwide: form.offersDelivery ? form.nationwide : false,
      cities,
      excluded,
      // Cost is meaningless for a pickup-only business — cleared alongside
      // nationwide/cities above, same normalisation rule.
      fee: form.offersDelivery ? toNullableInt(form.fee) : null,
      freeAbove: form.offersDelivery ? toNullableInt(form.freeAbove) : null,
      days: form.days,
      fees: form.fees,
    };
    // MEH-1644: structured rows replace the flat delivery_area_cities send —
    // each city carries its optional canonical day ("" → null = בתיאום מראש)
    // and preserves any registration-captured min_order (previously wiped by
    // the flat delete+insert path).
    // MEH-1772 chunk 3: delivery_fee rides the same row. toNullableInt, not
    // `|| null` — 0 is a real override ("משלוח חינם" for that city) and must
    // survive the save as 0, not collapse to "inherit the business rate".
    const rows = normalized.cities.map((c) => ({
      city: c,
      delivery_day: normalized.days[c] || null,
      min_order: minOrders[c] ?? null,
      delivery_fee: toNullableInt(normalized.fees[c] ?? ""),
    }));
    try {
      await api.put("/producers/me", {
        has_physical_location: normalized.hasPhysical,
        offers_delivery: normalized.offersDelivery,
        delivery_nationwide: normalized.nationwide,
        delivery_areas: rows,
        delivery_excluded_cities: normalized.excluded,
        delivery_fee: normalized.fee,
        free_delivery_above: normalized.freeAbove,
      });
      // Patch the parent profile so LocationCard gating + re-seeds stay in sync.
      onSave({
        has_physical_location: normalized.hasPhysical,
        offers_delivery: normalized.offersDelivery,
        delivery_nationwide: normalized.nationwide,
        delivery_areas: rows,
        delivery_excluded_cities: normalized.excluded,
        delivery_fee: normalized.fee,
        free_delivery_above: normalized.freeAbove,
      });
      // MEH-1577: back to "" for the inputs — normalized carries null, and a
      // null <input value> makes React warn about an uncontrolled component.
      const asFields = {
        ...normalized,
        fee: normalized.fee ?? "",
        freeAbove: normalized.freeAbove ?? "",
      };
      setBaseline(asFields);
      setForm(asFields);
      setSaved(true);
      setTimeout(() => setSaved(false), 3000);
    } catch (err) {
      setErrorMsg(detailToMessage(err?.response?.data?.detail) || t("save_error"));
    } finally {
      setSaving(false);
    }
  };

  // MEH-1821: makes the per-city override's three-value semantics visible.
  // Mirrors the server contract (DeliveryAreaCreate._validate_area_delivery_fee):
  // "" / null = inherits the business-level default · 0 = free for this city ·
  // positive = the city's own rate. Deliberately NOT a truthiness test — `!raw`
  // would collapse 0 into the inherit branch and silently redescribe a free
  // city as "inherits 35 ₪". Returns null when there is nothing to declare:
  // an unstated city while the business default is itself unstated inherits
  // nothing, so no hint is rendered at all.
  const areaFeeHint = (city) => {
    const raw = form.fees[city];
    const stated = raw !== "" && raw !== null && raw !== undefined;
    if (!stated) {
      const base = form.fee;
      if (base === "" || base === null || base === undefined) return null;
      // A business-level 0 is free delivery, and the row below states its own
      // 0 as "משלוח חינם" — rendering the inherited one as "יורש 0 ₪" would
      // show the same value two different ways in the same list. The 0 case
      // is reachable on purpose: the fee input is min="0" and fee_hint tells
      // the owner to write 0 when delivery is free.
      return Number(base) === 0
        ? t("area_fee_inherits_free")
        : t("area_fee_inherits", { fee: base });
    }
    return Number(raw) === 0 ? t("area_fee_free") : null;
  };

  return (
    <div>
      <p className="text-xs text-fg-muted mb-1">{t("subtitle")}</p>
      {/* MEH-1540: scope helper — this card is delivery destinations only,
          the business address itself lives in LocationCard. */}
      <p className="text-xs text-fg-muted mb-4">{t("scope_helper")}</p>

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
            {/* MEH-1577: structured delivery cost. Both optional — leaving them
                empty keeps the public page exactly as it is today. Each field
                carries a "where it appears" line + an example placeholder per
                the dashboard field standard (docs/audits/dashboard-field-
                guidance-audit.md, MEH-1539). min=0 on the fee (0 = free),
                min=1 on the threshold, and max=MAX_DELIVERY_MONEY on both
                mirror the server validators, so the browser catches the same
                values the API would 422 on — the ceiling round-trips instead
                of only surfacing after a submit.
                MEH-1821: this block sits ABOVE the area list, not below it.
                It is the default every `delivery_areas` row inherits, and a
                default stated after its own exceptions reads as a repetition
                of them — which is exactly how it was read in the field. Order
                follows Shopify's profile → zone → rate hierarchy: the general
                rate is set first, zones override it underneath. Moving this
                block is presentational only; `handleSave` below is untouched
                and the PUT /producers/me payload is byte-identical. */}
            <div className="space-y-3 pt-1" data-testid="delivery-default-block">
              {/* MEH-1821: the copy is mode-dependent because the block is
                  not. It renders whenever delivery is on, but the per-area
                  list it points at exists only in the non-nationwide branch
                  below — nationwide clears `cities`, so there is no row to
                  override and "ברירת מחדל" would name exceptions that cannot
                  exist. Nationwide gets its own pair: one country-wide fee,
                  nothing beneath it. */}
              <p className="text-sm font-medium">
                {form.nationwide
                  ? t("default_block_title_nationwide")
                  : t("default_block_title")}
              </p>
              <p className="text-xs text-fg-muted">
                {form.nationwide
                  ? t("default_block_hint_nationwide")
                  : t("default_block_hint")}
              </p>
              <div>
                <label
                  htmlFor="delivery-fee"
                  className="block text-sm text-muted mb-1"
                >
                  {t("fee_label")}
                </label>
                <p className="text-xs text-fg-muted mb-1">{t("fee_hint")}</p>
                <input
                  id="delivery-fee"
                  type="number"
                  inputMode="numeric"
                  min="0"
                  max={MAX_DELIVERY_MONEY}
                  step="1"
                  value={form.fee}
                  onChange={(e) => set({ fee: e.target.value })}
                  placeholder={t("fee_placeholder")}
                  className="w-32 border border-border rounded-[10px] px-3 py-2 text-sm"
                />
              </div>
              <div>
                <label
                  htmlFor="free-delivery-above"
                  className="block text-sm text-muted mb-1"
                >
                  {t("free_above_label")}
                </label>
                <p className="text-xs text-fg-muted mb-1">
                  {t("free_above_hint")}
                </p>
                <input
                  id="free-delivery-above"
                  type="number"
                  inputMode="numeric"
                  min="1"
                  max={MAX_DELIVERY_MONEY}
                  step="1"
                  value={form.freeAbove}
                  onChange={(e) => set({ freeAbove: e.target.value })}
                  placeholder={t("free_above_placeholder")}
                  className="w-32 border border-border rounded-[10px] px-3 py-2 text-sm"
                />
              </div>
            </div>
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
                {/* MEH-1644: optional per-city dispatch day — select-from-
                    canonical (lib/delivery-days.js), never free text. Empty
                    option = "בתיאום מראש" (stored as null). Dashboard field
                    standard: label + where-it-appears hint + select. */}
                {form.cities.length > 0 && (
                  <div className="mt-3">
                    <span className="block text-sm text-muted mb-0.5">
                      {t("delivery_days_label")}
                    </span>
                    <p className="text-xs text-fg-muted mb-2">
                      {t("delivery_days_hint")}
                    </p>
                    {/* MEH-1772 chunk 3: the per-city fee override shares this
                        list — both are per-city dimensions of the same row, so
                        a second list would ask the owner to match cities across
                        two tables. Label + "where it appears" hint + example
                        placeholder per the dashboard field standard
                        (docs/audits/dashboard-field-guidance-audit.md,
                        MEH-1539). min/max mirror the server validators
                        (DeliveryAreaCreate._validate_area_delivery_fee). */}
                    <span className="block text-sm text-muted mb-0.5">
                      {t("area_fee_label")}
                    </span>
                    <p className="text-xs text-fg-muted mb-2">
                      {t("area_fee_hint")}
                    </p>
                    <ul className="space-y-1.5">
                      {form.cities.map((c) => (
                        <li
                          key={c}
                          className="flex flex-wrap items-center justify-between gap-2 text-sm"
                        >
                          <span className="min-w-0 flex-1 truncate">{c}</span>
                          <input
                            type="number"
                            inputMode="numeric"
                            min="0"
                            max={MAX_DELIVERY_MONEY}
                            step="1"
                            value={form.fees[c] ?? ""}
                            aria-label={t("area_fee_aria", { city: c })}
                            data-testid={`delivery-fee-input-${c}`}
                            onChange={(e) =>
                              set({ fees: { ...form.fees, [c]: e.target.value } })
                            }
                            placeholder={t("area_fee_placeholder")}
                            className="w-20 border border-border rounded-[8px] px-2 py-1 text-sm bg-surface"
                          />
                          <select
                            value={form.days[c] || ""}
                            aria-label={t("day_select_aria", { city: c })}
                            data-testid={`delivery-day-select-${c}`}
                            onChange={(e) =>
                              set({ days: { ...form.days, [c]: e.target.value } })
                            }
                            className="border border-border rounded-[8px] px-2 py-1 text-sm bg-surface"
                          >
                            <option value="">{t("day_arranged")}</option>
                            {DELIVERY_DAYS.map((d) => (
                              <option key={d} value={d}>
                                {d}
                              </option>
                            ))}
                          </select>
                          {/* MEH-1821: declares what an unstated row inherits.
                              `w-full` makes it wrap onto its own line inside
                              the flex row rather than competing for width with
                              the inputs. */}
                          {areaFeeHint(c) && (
                            <p
                              className="w-full text-xs text-fg-muted"
                              data-testid={`delivery-fee-hint-${c}`}
                            >
                              {areaFeeHint(c)}
                            </p>
                          )}
                        </li>
                      ))}
                    </ul>
                  </div>
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

// ============================================================
// MEH-1823 chunk 3 — OffersCard: the owner's single typed offer.
// Four types, an optional threshold, an optional free-text line, and a
// MANDATORY end date. Sends `active_offer` on the same PUT /producers/me as
// every other card here (producer_me._sync_active_offer replaces the active
// row rather than updating it, so the unique partial index holds).
//
// Three write states, and they are NOT the same request:
//   type == ""      -> {active_offer: null}   deactivate
//   type set        -> {active_offer: {...}}  replace
//   card untouched  -> the key is never sent  leave alone
// The third is why every other card can be saved without wiping the offer.
// ============================================================

// Which types show the threshold pair. All four typed ones — the threshold is
// optional for EVERY type and deliberately not gated by type (Sapir, 02/08:
// "10% off pickup over ₪100" and "first order over ₪150" are real offers).
// Kept as a named constant rather than inlined `true` so the decision is
// visible at the point a future reader would try to narrow it.
//
// MEH-1898 added `custom` as the fifth, and it IS the one exception to the
// paragraph above — but only here, in the form. The backend stayed uniform
// (no type-conditional validation, five CHECKs unchanged); what changes is
// what the owner is shown. `custom` has no platform sentence for a threshold
// to sit inside, so there is nothing to attach «מעל 100 ₪» to, and a field
// whose value can never be rendered is a field that should not be on screen.
const OFFER_TYPES = [
  "free_delivery_above",
  "gift_above",
  "first_order",
  "pickup_discount",
  "custom",
];
const CUSTOM_OFFER_TYPE = "custom";
const THRESHOLD_UNITS = ["ils", "units", "liters", "kg"];
const MAX_OFFER_HEADLINE = 60;

// Exported for isolation tests (OfferBadge.test.jsx renders it directly).
export function OffersCard({ profile, onSave, reportDirty = () => {} }) {
  const t = useTranslations("producer.offer");
  const existing = profile?.active_offer ?? null;
  const initial = {
    // "" = no active offer. Held as strings for the same reason DeliveryCard
    // does it: an <input>/<select> value must be one.
    type: existing?.offer_type ?? "",
    threshold: existing?.threshold_value ?? "",
    unit: existing?.threshold_unit ?? "",
    headline: existing?.headline ?? "",
    expires: existing?.expires_at ?? "",
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
    form.type !== baseline.type ||
    String(form.threshold) !== String(baseline.threshold) ||
    form.unit !== baseline.unit ||
    form.headline !== baseline.headline ||
    form.expires !== baseline.expires;

  // The cleanup is not optional: every other card here returns
  // reportDirty(key, false), and without it the card stays "dirty" after
  // unmount, so the editor's unsaved-changes warning fires forever on a
  // card the owner already left.
  useEffect(() => {
    reportDirty("offer", dirty);
    return () => reportDirty("offer", false);
  }, [dirty, reportDirty]);

  // Client-side mirrors of the two server rules most likely to be hit, so the
  // owner sees them before a round-trip. The server remains the authority —
  // these only shorten the loop, they do not replace the 422.
  const hasType = form.type !== "";
  const isCustom = form.type === CUSTOM_OFFER_TYPE;
  const thresholdStated = String(form.threshold).trim() !== "";
  const unitStated = form.unit !== "";
  // Suppressed for `custom`, where the threshold inputs are not rendered. An
  // owner who half-filled the pair under another type and then switched would
  // otherwise be blocked by an error naming two fields she can no longer see.
  const pairBroken = hasType && !isCustom && thresholdStated !== unitStated;
  const missingExpiry = hasType && !form.expires;
  // MEH-1898 — the ONLY required-headline rule in the system, and it lives
  // here on purpose. The API accepts a headline-less `custom` offer (uniform
  // validation, see ProducerOfferCreate) and OfferBadge renders nothing for
  // one. Neither is a good outcome for the owner: she would save successfully
  // and then find no offer on her page, with nothing telling her why. This
  // check is what turns that silent no-op into a visible "write your words"
  // before the request is made.
  //
  // `.trim()` matches OfferBadge's own test on the render side — the two must
  // agree about what counts as words, or the form permits exactly the state
  // the badge refuses to draw.
  const missingCustomHeadline = isCustom && form.headline.trim() === "";
  const blocked = pairBroken || missingExpiry || missingCustomHeadline;

  const handleSave = async () => {
    setSaving(true);
    setErrorMsg(null);
    try {
      const payload = hasType
        ? {
            offer_type: form.type,
            // toNullableInt semantics: "" -> null, never 0. A 0 here would be
            // rejected by the server anyway (threshold must be > 0), but
            // sending null is the honest encoding of "not stated".
            //
            // `!isCustom &&` — a hidden field's value must not be submitted.
            // Switching an existing offer to `custom` leaves the old threshold
            // in form state while its inputs are unmounted, and sending it
            // would persist a number the owner can no longer see, edit, or
            // find rendered anywhere. Clearing it is what the screen says is
            // happening. The pair goes to null TOGETHER, so the both-or-neither
            // CHECK holds either way.
            threshold_value:
              !isCustom && thresholdStated ? Number(form.threshold) : null,
            threshold_unit: !isCustom && thresholdStated ? form.unit : null,
            headline: form.headline.trim() || null,
            expires_at: form.expires,
          }
        : null;
      await api.put("/producers/me", { active_offer: payload });
      // No `id` in the optimistic patch. The save REPLACES the row, so the old
      // id is wrong and the new one is server-assigned and unknown here —
      // an earlier version wrote `id: existing?.id ?? null`, which asserted a
      // null id for a business creating its first offer. Omitting the key says
      // "unknown", which is true; `null` says "there isn't one", which isn't.
      // Nothing reads it today; the real id arrives with the next profile load.
      onSave({ active_offer: payload });
      setBaseline(form);
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
      <p className="text-xs text-fg-muted mb-1">{t("card_subtitle")}</p>
      <p className="text-xs text-fg-muted mb-4">{t("scope_helper")}</p>

      <div className="space-y-3">
        <div>
          <label htmlFor="offer-type" className="block text-sm text-muted mb-1">
            {t("type_label")}
          </label>
          <select
            id="offer-type"
            value={form.type}
            data-testid="offer-type-select"
            onChange={(e) => set({ type: e.target.value })}
            className="w-full border border-border rounded-[10px] px-3 py-2 text-sm bg-surface"
          >
            <option value="">{t("type_none")}</option>
            {OFFER_TYPES.map((ot) => (
              <option key={ot} value={ot}>{t(`types.${ot}`)}</option>
            ))}
          </select>
        </div>

        {/* Everything below is meaningless without a type, so the whole block
            is gated — the "no offer" state is a genuinely empty card, not a
            form full of disabled inputs. */}
        {hasType && (
          <div className="ms-6 space-y-3 border-s-2 border-border ps-4 pt-1">
            {/* MEH-1898: hidden for `custom`. Unmounted, not disabled — a
                disabled input still reads as "a thing this offer has, greyed
                out", and a threshold is not a thing a custom offer has. */}
            {!isCustom && (
            <div>
              <span className="block text-sm text-muted mb-0.5">{t("threshold_label")}</span>
              <p className="text-xs text-fg-muted mb-2">{t("threshold_hint")}</p>
              <div className="flex flex-wrap items-center gap-2">
                <input
                  type="number"
                  inputMode="numeric"
                  min="1"
                  step="1"
                  value={form.threshold}
                  aria-label={t("threshold_label")}
                  data-testid="offer-threshold-input"
                  onChange={(e) => set({ threshold: e.target.value })}
                  placeholder={t("threshold_placeholder")}
                  className="w-24 border border-border rounded-[10px] px-3 py-2 text-sm"
                />
                <select
                  value={form.unit}
                  aria-label={t("unit_label")}
                  data-testid="offer-unit-select"
                  onChange={(e) => set({ unit: e.target.value })}
                  className="border border-border rounded-[10px] px-3 py-2 text-sm bg-surface"
                >
                  <option value="">{t("unit_label")}</option>
                  {THRESHOLD_UNITS.map((u) => (
                    <option key={u} value={u}>{t(`units.${u}`)}</option>
                  ))}
                </select>
              </div>
              {pairBroken && (
                <p className="text-xs text-red-600 mt-1" data-testid="offer-pair-error">
                  {t("threshold_pair_required")}
                </p>
              )}
            </div>
            )}

            <div>
              {/* MEH-1898: under `custom` this field stops being the optional
                  extra line and becomes the offer itself, so the label must
                  stop saying «(לא חובה)». Reuses the dropdown's own approved
                  string rather than inventing a second name for one thing. */}
              <label htmlFor="offer-headline" className="block text-sm text-muted mb-1">
                {isCustom ? t("types.custom") : t("headline_label")}
              </label>
              <p className="text-xs text-fg-muted mb-1">
                {isCustom ? t("custom_hint") : t("headline_hint")}
              </p>
              <input
                id="offer-headline"
                type="text"
                maxLength={MAX_OFFER_HEADLINE}
                value={form.headline}
                required={isCustom}
                aria-required={isCustom}
                aria-invalid={missingCustomHeadline}
                data-testid="offer-headline-input"
                onChange={(e) => set({ headline: e.target.value })}
                placeholder={t("headline_placeholder")}
                className="w-full border border-border rounded-[10px] px-3 py-2 text-sm"
              />
              {missingCustomHeadline && (
                <p className="text-xs text-red-600 mt-1" data-testid="offer-headline-error">
                  {t("custom_headline_required")}
                </p>
              )}
            </div>

            <div>
              <label htmlFor="offer-expires" className="block text-sm text-muted mb-1">
                {t("expires_label")}
              </label>
              <p className="text-xs text-fg-muted mb-1">{t("expires_hint")}</p>
              <input
                id="offer-expires"
                type="date"
                value={form.expires}
                data-testid="offer-expires-input"
                onChange={(e) => set({ expires: e.target.value })}
                className="border border-border rounded-[10px] px-3 py-2 text-sm"
              />
              {missingExpiry && (
                <p className="text-xs text-red-600 mt-1" data-testid="offer-expiry-error">
                  {t("expires_required")}
                </p>
              )}
            </div>
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
        data-testid="offer-save"
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
// MEH-1872 — business-name editor with re-moderation.
//
// The ONLY card here that does not write its field. Every sibling PUTs to
// /producers/me and the value moves; this one POSTs a REQUEST and the public
// name stays exactly where it was until an admin approves.
//
// That difference is the feature, not an implementation detail: MEH-1851
// removed `name` from _PRODUCER_WRITABLE_FIELDS because a plain setattr let an
// approved business silently become a different business, against the DNA-LOCK
// "every business is approved by hand". So the copy has to make "you filed a
// request" unmistakable — an owner who reads this as "saved" will think the
// rename already happened and go looking for it on her public page.
//
// One open request at a time (the backend returns 409); when one is pending we
// render the pending state and no form, so the 409 is unreachable from the UI
// rather than merely handled.
//
// Touches: POST + GET /producers/me/name-change-requests.
// ============================================================
export function BusinessNameCard({ profile }) {
  const t = useTranslations("dashboard.producer.name_change");
  const [requestedName, setRequestedName] = useState("");
  const [reason, setReason] = useState("");
  const [pending, setPending] = useState(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [justSent, setJustSent] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    let alive = true;
    api
      .get("/producers/me/name-change-requests")
      .then((r) => {
        if (!alive) return;
        const list = Array.isArray(r.data) ? r.data : [];
        setPending(list.find((x) => x.status === "pending") || null);
      })
      .catch(() => {
        // A failed history read must not present as "no pending request" —
        // that would offer a form whose submit is guaranteed to 409. Leave
        // `pending` null but surface the error so the state is legible.
        if (alive) setError(t("load_error"));
      })
      .finally(() => {
        if (alive) setLoading(false);
      });
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const trimmed = requestedName.trim();
  const unchanged = trimmed === (profile?.name || "").trim();
  const canSubmit = trimmed.length >= 2 && !unchanged && !saving;

  const submit = async (e) => {
    e.preventDefault();
    if (!canSubmit) return;
    setSaving(true);
    setError("");
    try {
      const r = await api.post("/producers/me/name-change-requests", {
        requested_name: trimmed,
        reason: reason.trim() || null,
      });
      setPending(r.data);
      setJustSent(true);
      setRequestedName("");
      setReason("");
      showToast.success(t("sent_toast"));
    } catch (err) {
      setError(detailToMessage(err, t("submit_error")));
    } finally {
      setSaving(false);
    }
  };

  if (loading) return <p className="text-sm text-fg-muted">{t("loading")}</p>;

  return (
    <div className="space-y-4" data-testid="name-change-card">
      <p className="text-sm text-fg-muted">{t("intro")}</p>

      {/* Current name is shown read-only so the comparison the owner is about
          to request is visible without leaving the card. */}
      <div>
        <p className="text-[13px] font-semibold text-text mb-1">{t("current_label")}</p>
        <p
          className="text-base font-bold text-text bg-bg-subtle border border-border rounded-[8px] px-3 py-2"
          data-testid="name-change-current"
        >
          {profile?.name}
        </p>
      </div>

      {justSent && (
        <div
          className="bg-green-50 border border-primary rounded-[12px] p-4 text-sm text-text"
          role="status"
          data-testid="name-change-sent"
        >
          {t("sent_confirmation")}
        </div>
      )}

      {pending ? (
        <div
          className="bg-yellow-50 border border-yellow-300 rounded-[12px] p-4 space-y-1"
          role="status"
          data-testid="name-change-pending"
        >
          <p className="text-sm font-semibold text-text">{t("pending_heading")}</p>
          <p className="text-sm text-fg-muted">
            {t("pending_detail", { name: pending.requested_name })}
          </p>
        </div>
      ) : (
        <form onSubmit={submit} className="space-y-3" data-testid="name-change-form">
          <Input
            label={t("requested_label")}
            helperText={t("requested_where")}
            value={requestedName}
            onChange={(e) => setRequestedName(e.target.value)}
            placeholder={t("requested_placeholder")}
            maxLength={100}
            data-testid="name-change-input"
          />
          <Input
            label={t("reason_label")}
            helperText={t("reason_where")}
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder={t("reason_placeholder")}
            maxLength={500}
            data-testid="name-change-reason"
          />
          {unchanged && trimmed.length > 0 && (
            <p className="text-sm text-fg-muted">{t("same_name_hint")}</p>
          )}
          {error && (
            <p className="text-sm text-red-700" role="alert" data-testid="name-change-error">
              {error}
            </p>
          )}
          <button
            type="submit"
            disabled={!canSubmit}
            className="bg-primary text-white rounded-full px-5 py-2.5 text-sm font-semibold disabled:opacity-50 focus-ring"
            data-testid="name-change-submit"
          >
            {saving ? t("submitting") : t("submit_cta")}
          </button>
        </form>
      )}
    </div>
  );
}
