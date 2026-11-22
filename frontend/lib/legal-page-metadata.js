// @ts-check
// MEH-3623: one generateMetadata for the three legal pages (privacy, terms,
// accessibility) — they were three copies of the same openGraph + twitter
// block. Same shape as lib/guide-metadata.js for the business guides.
import { getTranslations } from "next-intl/server";
import { BRAND_NAME } from "@/lib/constants";
import { buildAlternates, buildEntityTitle, urlForLocalePath, OG_LOCALE } from "@/lib/i18n-seo";
import { siteOgImageUrl } from "@/lib/og-site-image";

/**
 * @param {string} locale
 * @param {{ namespace: string, path: string }} page
 */
export async function buildLegalPageMetadata(locale, { namespace, path }) {
  const t = await getTranslations({ locale, namespace });
  const title = t("meta_title");
  const description = t("meta_description");
  const ogTitle = buildEntityTitle(title, locale);
  const images = [siteOgImageUrl(locale)];
  return {
    // MEH-2853: plain title — the layout template `%s | <brand>` adds the brand.
    title,
    description,
    // A page-level openGraph REPLACES the layout's (Next.js shallow merge), so
    // siteName / locale / image are repeated here (MEH-740, MEH-3590).
    openGraph: {
      title: ogTitle,
      description,
      type: "website",
      url: urlForLocalePath(path, locale),
      siteName: BRAND_NAME,
      locale: OG_LOCALE[locale],
      images,
    },
    // MEH-1060 (SEO-10): explicit Twitter card mirroring og.
    twitter: {
      card: "summary_large_image",
      title: ogTitle,
      description,
      images,
    },
    alternates: buildAlternates(path, locale),
  };
}
