import { getTranslations } from "next-intl/server";
import AboutClient from "./AboutClient";
import { BRAND_NAME } from "@/lib/constants";
import { buildAlternates, OG_LOCALE } from "@/lib/i18n-seo";

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
      siteName: BRAND_NAME,
      locale: OG_LOCALE[locale],
      images: ["/og-image.png"],
    },
    alternates: buildAlternates("/about", locale),
  };
}

export default function AboutPage() {
  return <AboutClient />;
}
