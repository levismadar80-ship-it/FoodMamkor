// @ts-check
"use client";

/**
 * Module:   AdminOwnerStoryFields
 * Purpose:  The «מאחורי העסק» fields on the admin producer form — the owner's
 *           one-line bio and her photo — for a page an admin builds on the
 *           owner's behalf.
 * Touches:  POST /upload/owner-photo/{producer_id} (admin; saves the URL at
 *           once). The bio and a REMOVED photo travel with the form's own
 *           save (PUT /admin/producers/{id}, POST /admin/producers).
 * Does NOT: edit the owner's dashboard card (dashboard/edit/cards/
 *           OwnerStoryCard.jsx is hers and unchanged) or render the public
 *           OwnerCard.
 * History:  MEH-3338 (creation).
 */

import { useState } from "react";
import { useTranslations } from "next-intl";
import api from "@/lib/api";
import { detailToMessage } from "@/lib/errors";
import Button from "@/components/ui/Button";
import Textarea from "@/components/ui/Textarea";
import Avatar from "@/components/ui/Avatar";
import InlineMessage from "@/components/ui/InlineMessage";

// Mirrors schemas ProducerUpdate / ProducerAdminCreate owner_bio (300).
const OWNER_BIO_MAX = 300;

/**
 * @param {{
 *   producerId?: string | null,
 *   bio: string,
 *   photoUrl: string | null,
 *   onBioChange: (v: string) => void,
 *   onPhotoChange: (v: string | null) => void,
 * }} props
 */
export default function AdminOwnerStoryFields({ producerId = null, bio, photoUrl, onBioChange, onPhotoChange }) {
  const t = useTranslations("admin.producers.form.fields");
  const tOwner = useTranslations("dashboard.producer.owner_story");
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState(/** @type {string | null} */ (null));

  /** @param {import("react").ChangeEvent<HTMLInputElement>} e */
  const handleFile = async (e) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file || !producerId) return;
    setUploading(true);
    setError(null);
    try {
      const fd = new FormData();
      fd.append("file", file);
      const r = await api.post(`/upload/owner-photo/${producerId}`, fd);
      onPhotoChange(r.data.url);
    } catch (err) {
      setError(detailToMessage(err?.response?.data?.detail) || tOwner("upload_error"));
    } finally {
      setUploading(false);
    }
  };

  return (
    <div className="space-y-4" data-testid="admin-owner-story">
      <Textarea
        id="admin-owner-bio"
        label={t("owner_bio")}
        value={bio}
        onChange={(e) => onBioChange(e.target.value)}
        maxLength={OWNER_BIO_MAX}
        rows={3}
        className="resize-y"
        helperText={<span data-testid="admin-owner-bio-count">{bio.length}/{OWNER_BIO_MAX}</span>}
      />

      {producerId && (
        <div>
          <span className="text-sm font-medium block mb-1">{t("owner_photo")}</span>
          <div className="flex items-center gap-3">
            {photoUrl && (
              <span data-testid="admin-owner-photo-preview" data-src={photoUrl}>
                {/* Shared person-photo primitive (components/CLAUDE.md). */}
                <Avatar src={photoUrl} name={t("owner_photo")} size={64} />
              </span>
            )}
            <label className="inline-flex rounded-full focus-within:ring-2 focus-within:ring-primary">
              <input
                type="file"
                accept="image/*"
                className="sr-only"
                onChange={handleFile}
                disabled={uploading}
                data-testid="admin-owner-photo-input"
              />
              <span className="cursor-pointer rounded-full border border-border px-4 py-2 text-sm">
                {uploading ? tOwner("uploading") : photoUrl ? tOwner("photo_replace_cta") : tOwner("photo_cta")}
              </span>
            </label>
            {photoUrl && !uploading && (
              <Button variant="text" size="sm" type="button" onClick={() => onPhotoChange(null)}>
                {t("owner_photo_remove")}
              </Button>
            )}
          </div>
          {error && <InlineMessage tone="error" className="mt-2">{error}</InlineMessage>}
        </div>
      )}
    </div>
  );
}
