"use client";
// @ts-check

/**
 * Module:   producer/dashboard/edit/cards/OwnerStoryCard
 * Purpose:  Owner story editor: bio text and owner photo.
 * Does NOT: apply the gallery freemium gate (owner photo has none).
 * Related:  ../cards.jsx (re-exports this, so existing imports keep working);
 *           ../page.js (renders the cards).
 * History:  MEH-3152 — moved VERBATIM out of edit/cards.jsx (2,618 lines) into
 *           its own file; the per-change history is in the comments below.
 */

import { useState, useEffect } from "react";
import { useTranslations } from "next-intl";
import { Warning } from "@phosphor-icons/react";
import api from "@/lib/api";
import { detailToMessage } from "@/lib/errors";
import { MIN_ESTABLISHED_YEAR, currentIsraelYear } from "@/lib/established-year";
import Input from "@/components/ui/Input";
import Button from "@/components/ui/Button";
import InlineMessage from "@/components/ui/InlineMessage";

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
          <span className="text-2xs text-fg-muted">{t("bio_where")}</span>
        </div>
        <textarea
          value={bio}
          onChange={(e) => { setBio(e.target.value.slice(0, OWNER_BIO_MAX)); setSaved(false); }}
          placeholder={t("bio_placeholder")}
          className="w-full border border-primary/30 bg-primary/5 rounded-sm px-3 py-2 text-sm resize-none h-24 focus-ring"
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
      <Button
        onClick={save}
        disabled={saving || !dirty}
        variant="primary" size="sm"
      >
        <span aria-live="polite" aria-atomic="true">
          {saving ? t("saving") : saved ? t("saved") : t("save_cta")}
        </span>
      </Button>

      {error && (
        <InlineMessage size="xs" className="flex items-start gap-1.5">
          <Warning size={16} weight="fill" aria-hidden="true" className="shrink-0 mt-px" />
          {error}
        </InlineMessage>
      )}
    </div>
  );
}
