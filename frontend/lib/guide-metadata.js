// @ts-check
// MEH-3590: one generateMetadata for the three business guides — they were
// three copies, and the share image had to be added to each by hand.
import { getTranslations } from "next-intl/server";
import { BRAND_NAME } from "@/lib/constants";
import { buildAlternates, buildEntityTitle, OG_LOCALE } from "@/lib/i18n-seo";
import { siteOgImageUrl } from "@/lib/og-site-image";

/**
 * @param {string} locale
 * @param {{ namespace: string, path: string }} guide
 */
export async function buildGuideMetadata(locale, { namespace, path }) {
  const t = await getTranslations(namespace);
  const title = t("title");
  const description = t("preview");
  return {
    // MEH-2853: plain title — the layout template `%s | <brand>` adds the brand.
    title,
    description,
    openGraph: {
      title: buildEntityTitle(title, locale),
      description,
      type: "article",
      siteName: BRAND_NAME,
      locale: OG_LOCALE[locale],
      // MEH-3590: a page-level openGraph replaces the layout's, image included.
      images: [siteOgImageUrl(locale)],
    },
    alternates: buildAlternates(path, locale),
  };
}
