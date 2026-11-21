// @ts-check
/**
 * Module:   og-site-image
 * Purpose:  The one owner of the site's link-preview image path, per locale.
 *           A page that sets its own `openGraph` replaces the layout's object
 *           (Next merges metadata shallowly), so it must name an image itself —
 *           and it names THIS one, not a copy of the path.
 * Does NOT: build a business card (lib/seo.js producerOgCardUrl) or a
 *           Cloudinary photo transform (lib/seo.js ogImage).
 * Related:  app/[locale]/layout.js (OG_IMAGE / OG_IMAGE_EN, same files);
 *           scripts/checks/og-site-image-guard.sh (holds the rule).
 * History:  MEH-3590 (creation) — 33 pages pointed at the 1.26 MB PNG that
 *           MEH-2827 had retired for WhatsApp, and /en pages at the Hebrew art.
 */

// DO NOT point at /og-image.png — 1.26 MB; WhatsApp drops a preview that heavy
// (MEH-2827). The PNGs stay in public/ only for links shared before the switch.
const SITE_OG_IMAGE_PATH = Object.freeze({ he: "/og-image.jpg", en: "/og-image-en.jpg" });

/**
 * The site preview image for a locale (relative; metadataBase makes it absolute).
 * @param {string | undefined} locale
 * @returns {string}
 */
export function siteOgImageUrl(locale) {
  return locale === "en" ? SITE_OG_IMAGE_PATH.en : SITE_OG_IMAGE_PATH.he;
}
