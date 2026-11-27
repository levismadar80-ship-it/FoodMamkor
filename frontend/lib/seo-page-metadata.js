// @ts-check
/**
 * Module:   seo-page-metadata
 * Purpose:  generateMetadata for a static page whose copy lives in an
 *           `seo.<page>` block (title, description, og_title,
 *           og_description). MEH-3981: /join/orders would have been the
 *           third hand-written copy of this block (/join and /join/pricing
 *           carry the other two; moving them here is a separate change).
 * Related:  lib/guide-metadata.js (the same shape for the business guides).
 */
import { getTranslations } from "next-intl/server";
import { BRAND_NAME } from "@/lib/constants";
import { buildAlternates, buildEntityTitle, OG_LOCALE } from "@/lib/i18n-seo";
import { siteOgImageUrl } from "@/lib/og-site-image";

/**
 * @param {string} locale
 * @param {{ namespace: string, path: string }} page
 */
export async function buildSeoPageMetadata(locale, { namespace, path }) {
  const t = await getTranslations({ locale, namespace });
  return {
    // MEH-2853: plain title — the layout template `%s | <brand>` adds the brand.
    title: t("title"),
    description: t("description"),
    openGraph: {
      title: buildEntityTitle(t("og_title"), locale),
      description: t("og_description"),
      type: "website",
      siteName: BRAND_NAME,
      locale: OG_LOCALE[locale],
      images: [siteOgImageUrl(locale)],
    },
    alternates: buildAlternates(path, locale),
  };
}
