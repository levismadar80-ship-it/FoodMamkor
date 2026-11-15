// @ts-check
"use client";

/**
 * Module:   AdminPhotoGrid
 * Purpose:  The admin business form's photo grid. Marks the first photo as
 *           the main one (it is the card photo everywhere on the site) and
 *           lets the admin promote any other photo to main.
 * Does NOT: upload (ProducerForm.handleImageUpload) or save — the new order
 *           lives in the form state until the form's own save.
 * Related:  frontend/components/admin/ProducerForm.jsx (the images section).
 * History:  MEH-3320 (creation — a live business showed its text logo as the
 *           card photo and the form had no way to change the order).
 */
import { useTranslations } from "next-intl";
import { X } from "@phosphor-icons/react";
import { optimizeCloudinary } from "@/lib/cloudinary";

/**
 * The chosen photo first, every other photo in its old order.
 * @param {string[]} images
 * @param {string} url
 * @returns {string[]}
 */
export function promoteToMain(images, url) {
  if (!images.includes(url) || images[0] === url) return images;
  return [url, ...images.filter((u) => u !== url)];
}

/**
 * @param {{ images: string[], onChange: (next: string[]) => void, onRemove: (url: string) => void }} props
 */
export default function AdminPhotoGrid({ images, onChange, onRemove }) {
  const t = useTranslations("admin");
  if (!images?.length) return null;
  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 gap-3 mt-4" data-testid="admin-photo-grid">
      {images.map((url, i) => (
        <div key={url} className="flex flex-col gap-1">
          <div className="relative group">
            {/* raw img: admin-entered image URLs may be ANY host (the
                MEH-1222 "https://bread.jpg" case). next/image throws on a src
                outside remotePatterns instead of firing onError (MEH-1833). */}
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={optimizeCloudinary(url)}
              alt=""
              className={`w-full h-24 object-cover rounded-sm border ${i === 0 ? "border-2 border-action-primary" : "border-border"}`}
            />
            <button
              type="button"
              onClick={() => onRemove(url)}
              className="absolute top-1 start-1 bg-danger-500 text-white rounded-full w-6 h-6 inline-flex items-center justify-center opacity-100 [@media(hover:hover)_and_(pointer:fine)]:opacity-0 group-hover:opacity-100 focus-visible:opacity-100 transition before:absolute before:-inset-[10px] before:content-['']"
              aria-label={t("common.delete")}
            >
              <X size={14} weight="bold" aria-hidden="true" />
            </button>
          </div>
          {i === 0 ? (
            <span className="text-xs font-medium text-action-primary min-h-[44px] inline-flex items-center" data-testid="admin-photo-main">
              {t("producers.form.photos.main_label")}
            </span>
          ) : (
            <button
              type="button"
              onClick={() => onChange(promoteToMain(images, url))}
              className="text-xs text-action-primary underline underline-offset-2 min-h-[44px] text-start focus-ring rounded-sm"
            >
              {t("producers.form.photos.make_main")}
            </button>
          )}
        </div>
      ))}
    </div>
  );
}
