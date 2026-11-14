"use client";
// @ts-check

/**
 * Module:   producer/dashboard/edit/cards/ImagesCard
 * Purpose:  Owner-facing gallery images editor (upload, remove, reorder, free-plan cap).
 * Does NOT: enforce the image cap: the 403 in backend upload.py does.
 * Related:  ../cards.jsx (re-exports this, so existing imports keep working);
 *           ../page.js (renders the cards).
 * History:  MEH-3152 — moved VERBATIM out of edit/cards.jsx (2,618 lines) into
 *           its own file; the per-change history is in the comments below.
 */

import { useState, useEffect } from "react";
import { useTranslations } from "next-intl";
import { Warning, X } from "@phosphor-icons/react";
import api from "@/lib/api";
import { detailToMessage } from "@/lib/errors";
import { optimizeCloudinary, IMAGE_RATIOS } from "@/lib/cloudinary";
import Button from "@/components/ui/Button";
import InlineMessage from "@/components/ui/InlineMessage";
import { ViewOnPageLink } from "./ViewOnPageLink";

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

// MEH-2911: statuses whose gallery may not be emptied. Mirrors
// `LAST_PHOTO_GUARDED_STATUSES` in backend/app/routers/producer_me.py, and
// tests/test_meh2911_last_photo_guard.py reads this declaration out of this
// file to red on drift — so keep the members a one-line list of double-quoted
// string literals, whatever container holds them.
const LAST_PHOTO_GUARDED_STATUSES = new Set(["approved", "inactive"]);

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
  // MEH-2911: whether the last-photo removal was refused. A boolean, not
  // an index: the note renders once, immediately after the thumbnail grid,
  // so it can only ever belong to the single remaining thumbnail — an index
  // would be dead data implying a per-cell placement the render does not do.
  // (An earlier revision stored the index and said so in a comment that a
  // reviewer read as a promise the code did not keep.)
  const [lastPhotoBlocked, setLastPhotoBlocked] = useState(false);

  // MEH-2911: a business that is live — or one click away from live — has a
  // public page that would go photoless, so it may not drop to zero photos.
  // A draft, pending or rejected business may still empty its gallery: the
  // submit gate and the approve gate are where that is caught for those.
  //
  // `inactive` is in the set because `toggle_producer_status` (admin.py)
  // moves a row back to `approved` without re-running the approval gates, so
  // pause → empty → un-pause would otherwise publish a photoless business.
  // Measured by MEH-2911's reviewer; the toggle's missing gate is MEH-2945.
  //
  // MUST match `LAST_PHOTO_GUARDED_STATUSES` in producer_me.py — two owners
  // for one fact, which is the smell workflow.md names, and neither can be
  // deleted (the pre-check has to run before any request; the backend has to
  // answer a client that skipped it). So it is enforced instead:
  // tests/test_meh2911_last_photo_guard.py reads this array out of this file
  // and reds if the two drift.
  const isGalleryLocked = LAST_PHOTO_GUARDED_STATUSES.has(profile?.status);

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
      // MEH-2911: the note told her to add a photo first; she has.
      setLastPhotoBlocked(false);
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
    // MEH-2911: refuse here as well as in the backend, so the owner is told
    // at the moment she clicks instead of after a save round-trip. The
    // backend 422 (producer_me.py::LAST_PHOTO_REMOVAL_MESSAGE) stays the
    // authority — a client that ignores this still cannot empty the gallery.
    if (isGalleryLocked && images.length === 1) {
      setSaved(false);
      setErrorMsg(null);
      setLastPhotoBlocked(true);
      return;
    }
    setSaved(false);
    setErrorMsg(null);
    setLastPhotoBlocked(false);
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
      const raw = err?.response?.data?.detail;
      // MEH-2911: reachable when the business was approved in another tab
      // after this card loaded, so the client pre-check above did not know
      // to fire. Same message, same place — not the card-level error, which
      // is what Sapir ruled against.
      //
      // Matched on the CODE. Two earlier bugs here, both found by review:
      // the condition read `images.length === 1`, which is unsatisfiable
      // (the backend only refuses an EMPTY list, and this sends the same
      // `images` it then inspects — so the branch was dead and the refusal
      // fell through to the card-foot error); and it compared a Hebrew
      // sentence, which never matches on /en and would have shown an
      // English-locale owner the raw Hebrew.
      if (raw?.code === "last_photo_required") {
        setLastPhotoBlocked(true);
      } else {
        setErrorMsg(detailToMessage(raw) || t("save_error"));
      }
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
        className={`inline-flex items-center text-sm border border-dashed rounded-md px-4 py-3 transition focus-within:border-primary focus-within:ring-2 focus-within:ring-primary ${
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
                  but the card bans new i18n keys; the 1-based index suffix
                  distinguishes N thumbs without a new key (CI reviewer). */}
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={optimizeCloudinary(url, { aspectRatio: IMAGE_RATIOS.card, width: 320 })}
                alt={`${t("heading")} ${i + 1}`}
                className="w-full h-24 object-cover rounded-sm border border-border"
              />
              <button
                type="button"
                onClick={() => removeImage(i)}
                className="absolute top-1 start-1 bg-error text-white rounded-full w-6 h-6 inline-flex items-center justify-center opacity-100 [@media(hover:hover)_and_(pointer:fine)]:opacity-0 group-hover:opacity-100 focus-visible:opacity-100 transition"
                aria-label={t("remove_aria")}
              >
                <X size={14} weight="bold" aria-hidden="true" />
              </button>
            </div>
          ))}
        </div>
      )}

      {/* MEH-2911: directly under the thumbnail whose remove was refused —
          not at the foot of the card next to `errorMsg` (Sapir's ruling).
          With one photo left the grid above is a single cell, so a sibling
          immediately after it reads as that cell's own message.

          OUTSIDE the `images.length > 0` gate on purpose. The save-path
          refusal (business approved in another tab after this card loaded)
          arrives with the local list already EMPTY, so a note nested in the
          grid would have rendered nowhere and the refusal would have fallen
          through to the card-foot error — the placement the ruling forbids.
          A reviewer found that; the earlier revision had it nested.

          Not `col-span-full`: no longer a grid child. At 375 this wraps to
          two lines, one at 1440 — read off the captures in qa-artifacts.

          No positional classes: it sits in flow, so it mirrors with the
          document and needs no logical property (rtl.md). */}
      {lastPhotoBlocked && (
        <InlineMessage size="xs" className="mt-2 leading-snug" data-testid="images-last-photo-note">
          {t("last_photo")}
        </InlineMessage>
      )}

      {errorMsg && (
        // MEH-1099: text-error (ADR-026) — the drag-drop path made this error
        // display newly reachable; sibling text-red-600 sites in the other
        // cards stay for the MEH-1086 follow-up sweep.
        <InlineMessage size="xs" className="mt-3 flex items-center gap-1.5">
          <Warning size={16} weight="fill" aria-hidden="true" className="shrink-0" />
          {errorMsg}
        </InlineMessage>
      )}

      <Button
        onClick={handleSave}
        disabled={saving || uploading || !dirty}
        variant="primary" size="sm" className="mt-4"
      >
        <span aria-live="polite" aria-atomic="true">
          {saving ? t("saving") : saved ? t("saved") : t("save_cta")}
        </span>
      </Button>
    </div>
  );
}
