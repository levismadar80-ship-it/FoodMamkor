// @ts-check
"use client";

/**
 * Module:   GalleryViewAllButton
 * Purpose:  The «כל התמונות (n)» pill on a cover photo that opens the shared
 *           Lightbox at the first image. For pages that show one cover image
 *           but own several (the organizer page, MEH-3341).
 * Does NOT: render the cover itself (the page owns it, so the page keeps its
 *           own sizing and LCP), or render anything with fewer than 2 images —
 *           a single photo is already fully visible (MEH-3341 AC «תמונה 1»).
 * Related:  components/ImageGallery.jsx (the business page's grid pill — same
 *           look, same `gallery.view_all` string), components/Lightbox.jsx.
 * History:  MEH-3341 (creation).
 */
import { useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { Images } from "@phosphor-icons/react";
import Lightbox from "./Lightbox";

const MIN_IMAGES = 2;

/** @param {{ images?: string[], className?: string }} props */
export default function GalleryViewAllButton({ images = [], className = "" }) {
  const t = useTranslations("gallery");
  const [open, setOpen] = useState(false);
  const buttonRef = useRef(/** @type {HTMLButtonElement | null} */ (null));
  if (images.length < MIN_IMAGES) return null;
  return (
    <>
      {/* REUSES: components/ImageGallery.jsx gallery-all-pill — the look of
          the business page's «כל התמונות (n)», here as its own button. */}
      <button
        ref={buttonRef}
        type="button"
        onClick={() => setOpen(true)}
        aria-haspopup="dialog"
        data-testid="gallery-view-all"
        className={`inline-flex items-center gap-1.5 min-h-touch rounded-full bg-accent px-3 text-sm font-label-md text-white shadow-lg focus-ring ${className}`}
      >
        <Images size={16} weight="bold" aria-hidden="true" />
        {t("view_all", { n: images.length })}
      </button>
      {open && (
        <Lightbox
          images={images}
          startIndex={0}
          onClose={() => {
            setOpen(false);
            buttonRef.current?.focus();
          }}
        />
      )}
    </>
  );
}
