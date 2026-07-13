import { getTranslations } from "next-intl/server";
import ShareClient from "./ShareClient";
import { BRAND_NAME } from "@/lib/constants";
import { buildAlternates, urlForLocalePath, OG_LOCALE } from "@/lib/i18n-seo";

/**
 * /share — "ספרו עלינו" server wrapper (MEH-1160).
 *
 * Purpose:  generateMetadata (seo.share.*) + renders ShareClient.
 * Does NOT: hold page copy or share logic — see ShareClient.jsx.
 * Related:  frontend/app/[locale]/about/page.js (metadata pattern source)
 * History:  MEH-1160 (creation)
 */
// REUSES: frontend/app/[locale]/about/page.js:9-30 — per-page generateMetadata
// with title.absolute + og url/siteName/locale + buildAlternates.
export async function generateMetadata({ params }) {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "seo.share" });

  return {
    title: { absolute: t("title") },
    description: t("description"),
    openGraph: {
      title: t("og_title"),
      description: t("og_description"),
      type: "website",
      url: urlForLocalePath("/share", locale),
      siteName: BRAND_NAME,
      locale: OG_LOCALE[locale],
      images: ["/og-image.png"],
    },
    alternates: buildAlternates("/share", locale),
  };
}

export default function SharePage() {
  return <ShareClient />;
}
