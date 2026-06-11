import { getTranslations } from "next-intl/server";
import AboutProcessClient from "./AboutProcessClient";
import { BRAND_NAME } from "@/lib/constants";
import { buildAlternates, urlForLocalePath, OG_LOCALE } from "@/lib/i18n-seo";

// MEH-534: S11 "תהליך הקבלה" Direction D — standalone editorial process page.
// Server wrapper mirrors the about/page.js shape (MEH-739 / login MEH-658
// precedent): metadata strings resolve from the page's own `process` namespace
// so /about/process carries a self-canonical URL + per-locale title.
export async function generateMetadata({ params }) {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "process.meta" });

  return {
    // title.absolute prevents the layout's `%s | ${BRAND_NAME}` template from
    // appending — process.meta.title already carries the brand suffix.
    title: { absolute: t("title") },
    description: t("description"),
    openGraph: {
      title: t("og_title"),
      description: t("og_description"),
      type: "article",
      url: urlForLocalePath("/about/process", locale),
      siteName: BRAND_NAME,
      locale: OG_LOCALE[locale],
      images: ["/og-image.png"],
    },
    alternates: buildAlternates("/about/process", locale),
  };
}

export default function AboutProcessPage() {
  return <AboutProcessClient />;
}
