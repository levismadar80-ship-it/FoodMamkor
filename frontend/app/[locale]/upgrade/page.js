import { getTranslations } from "next-intl/server";
import UpgradeClient from "./UpgradeClient";
import { BRAND_NAME } from "@/lib/constants";
import { buildAlternates, OG_LOCALE } from "@/lib/i18n-seo";

// MEH-641 PR-B: server-wrapper pattern (MEH-658 precedent) — client
// components can't export metadata; the wrapper supplies SEO while
// UpgradeClient.jsx keeps the "use client" plan-comparison flow untouched.
export async function generateMetadata({ params }) {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "seo.upgrade" });

  return {
    // title.absolute prevents layout's `%s | ${BRAND_NAME}` template appending
    // (seo.upgrade.title already includes the brand suffix).
    title: { absolute: t("title") },
    description: t("description"),
    openGraph: {
      title: t("og_title"),
      description: t("og_description"),
      type: "website",
      siteName: BRAND_NAME,
      locale: OG_LOCALE[locale],
      images: ["/og-image.jpg"],
    },
    alternates: buildAlternates("/upgrade", locale),
    // MEH-641: authenticated route — not indexable, but hreflang preserved for cross-locale signal
    robots: { index: false, follow: false },
  };
}

export default function UpgradePage() {
  return <UpgradeClient />;
}
