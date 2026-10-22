import { getTranslations } from "next-intl/server";
import AboutClient from "./AboutClient";
import { BRAND_NAME } from "@/lib/constants";
import { buildOrganizationNode, serializeJsonLd } from "@/lib/seo";
import { buildAlternates, urlForLocalePath, OG_LOCALE } from "@/lib/i18n-seo";

// MEH-476 PR 3b1: per-page generateMetadata established the pattern.
// MEH-476 PR 3b2: inline helpers extracted to @/lib/i18n-seo so all 17
// public routes share a single source of truth (was duplicated × 12+).
export async function generateMetadata({ params }) {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "seo.about" });

  return {
    // title.absolute prevents layout's `%s | ${BRAND_NAME}` template appending
    // (seo.about.title already includes the brand suffix).
    title: { absolute: t("title") },
    description: t("description"),
    openGraph: {
      title: t("og_title"),
      description: t("og_description"),
      type: "article",
      // MEH-740: per-page og:url = self (mirrors #916 terms/privacy).
      url: urlForLocalePath("/about", locale),
      siteName: BRAND_NAME,
      locale: OG_LOCALE[locale],
      images: ["/og-image.png"],
    },
    // MEH-1060 (SEO-10): explicit Twitter card mirroring og (was inheriting the
    // layout's generic site card).
    twitter: {
      card: "summary_large_image",
      title: t("og_title"),
      description: t("og_description"),
      images: ["/og-image.png"],
    },
    alternates: buildAlternates("/about", locale),
  };
}

export default function AboutPage() {
  return (
    <>
      {/* MEH-2192: /about is the page answer engines open for "who runs this
          site", and it emitted 0 ld+json blocks (measured on production,
          21/10). Same `@id` (`#organization`) as the homepage graph, so this
          is ONE entity referenced from two pages — schema.org's intended
          shape — not a competing second Organization. Server-rendered. */}
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: serializeJsonLd({
            "@context": "https://schema.org",
            ...buildOrganizationNode(),
          }),
        }}
      />
      <AboutClient />
    </>
  );
}
