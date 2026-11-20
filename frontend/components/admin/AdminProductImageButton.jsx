// @ts-check
"use client";

/**
 * Module:   AdminProductImageButton
 * Purpose:  Next to one product on the admin edit page: its current photo (if
 *           any) and «העלאת תמונה» / «החלפת תמונה». The photo is saved on the
 *           product at once — there is no separate save.
 * Touches:  POST /upload/product-image/{product_id} (upload.py, admin only;
 *           same size cap and magic-byte sniff as the owner's upload).
 * Does NOT: remove a photo, edit any other product field, or show anything to
 *           a non-admin (the server answers 403).
 * Related:  components/admin/AdminOwnerStoryFields.jsx (same file-picker shape
 *           and the same «מאחורי העסק» copy keys), DraftProductsPanel.jsx and
 *           AdminProductImagesPanel.jsx (the two lists that render it).
 * History:  MEH-3456 (creation).
 */

import { useId, useState } from "react";
import { useTranslations } from "next-intl";
import { z } from "zod";
import api from "@/lib/api";
import { detailToMessage } from "@/lib/errors";
import { optimizeCloudinary } from "@/lib/cloudinary";
import InlineMessage from "@/components/ui/InlineMessage";

// Rule 19: the upload answers { url }. A response without one never reaches
// the product list.
const UploadResultSchema = z.object({ url: z.string().min(1) });

const THUMB_PX = 48;

/**
 * @param {{
 *   productId: string,
 *   name: string,
 *   imageUrl?: string | null,
 *   onUploaded: (url: string) => void,
 * }} props
 */
export default function AdminProductImageButton({ productId, name, imageUrl = null, onUploaded }) {
  // MEH-3456: the same three strings the admin already sees on «מאחורי העסק».
  const tCopy = useTranslations("dashboard.producer.owner_story");
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState(/** @type {string | null} */ (null));
  const nameId = useId();

  /** @param {import("react").ChangeEvent<HTMLInputElement>} e */
  const handleFile = async (e) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file || uploading) return;
    setUploading(true);
    setError(null);
    try {
      const fd = new FormData();
      fd.append("file", file);
      const r = await api.post(`/upload/product-image/${productId}`, fd);
      const parsed = UploadResultSchema.safeParse(r.data);
      if (!parsed.success) {
        setError(tCopy("upload_error"));
        return;
      }
      onUploaded(parsed.data.url);
    } catch (err) {
      setError(detailToMessage(err?.response?.data?.detail) || tCopy("upload_error"));
    } finally {
      setUploading(false);
    }
  };

  return (
    <span className="flex flex-col gap-1" data-testid="admin-product-image">
      <span className="flex items-center gap-2">
        {/* The product's name, for the file input's accessible description —
            every row's button reads the same. */}
        <span id={nameId} className="sr-only">{name}</span>
        {imageUrl && (
          <span className="contents">
            {/* raw img: same reason as AdminPhotoGrid.jsx (MEH-1833) — an
                older product may carry a URL outside next/image remotePatterns. */}
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={optimizeCloudinary(imageUrl, { aspectRatio: "1:1", width: THUMB_PX * 2 })}
              alt={name}
              width={THUMB_PX}
              height={THUMB_PX}
              data-testid="admin-product-image-thumb"
              className="w-12 h-12 rounded-sm object-cover border border-border"
            />
          </span>
        )}
        <label className="inline-flex rounded-full focus-within:ring-2 focus-within:ring-primary">
          <input
            type="file"
            accept="image/*"
            className="sr-only"
            onChange={handleFile}
            disabled={uploading}
            aria-describedby={nameId}
            data-testid="admin-product-image-input"
          />
          <span className="cursor-pointer min-h-touch inline-flex items-center rounded-full border border-border px-4 text-sm hover:bg-background">
            {uploading ? tCopy("uploading") : imageUrl ? tCopy("photo_replace_cta") : tCopy("photo_cta")}
          </span>
        </label>
      </span>
      {error && (
        <InlineMessage tone="error" data-testid="admin-product-image-error">
          {error}
        </InlineMessage>
      )}
    </span>
  );
}
