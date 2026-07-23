import { getTranslations } from "next-intl/server";
import { notFound } from "next/navigation";
import UpgradeClient from "./UpgradeClient";
import { BRAND_NAME } from "@/lib/constants";
import { buildAlternates, OG_LOCALE } from "@/lib/i18n-seo";

// MEH-641 PR-B: server-wrapper pattern (MEH-658 precedent) — client
// components can't export metadata; the wrapper supplies SEO while
// UpgradeClient.jsx keeps the "use client" plan-comparison flow untouched.
// MEH-1057: /upgrade is production-gated — the plan-comparison page promises a
// premium tier while the monetization model is undecided (MEH-617 frozen).
// notFound() in production only, following dev/components/page.jsx:42.
// UpgradeClient + i18n keys stay intact so the route returns post-launch by
// deleting these two guards. generateMetadata is short-circuited too so the
// gated route emits not-found metadata rather than upgrade SEO tags.
export async function generateMetadata({ params }) {
  if (process.env.NODE_ENV === "production") notFound();
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
      images: ["/og-image.png"],
    },
    alternates: buildAlternates("/upgrade", locale),
    // MEH-641: authenticated route — not indexable, but hreflang preserved for cross-locale signal
    robots: { index: false, follow: false },
  };
}

export default function UpgradePage() {
  if (process.env.NODE_ENV === "production") notFound();
  return <UpgradeClient />;
}
