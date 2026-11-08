/**
 * Module:   about-badges
 * Purpose:  /about/badges — «מה אומרים התגים»: every badge on the site, grouped
 *           by who stands behind it (admin-verified · editorial · self-declared
 *           · system). MEH-2701.
 * Touches:  none (presentation only).
 * Does NOT: own the badge copy — labels and tooltips come from
 *           lib/badges.js BADGE_CONFIG, so a new badge appears here with no
 *           second edit (BadgesExplainer.test.jsx guards it).
 * Related:  frontend/app/[locale]/about/why-local/page.js (same page pattern),
 *           frontend/components/BadgeRow.jsx (hero popovers link here).
 */
import { getTranslations, setRequestLocale } from "next-intl/server";
import BadgesExplainer from "./BadgesExplainer";
import { BRAND_NAME } from "@/lib/constants";
import { buildAlternates, urlForLocalePath, OG_LOCALE } from "@/lib/i18n-seo";

export async function generateMetadata({ params }) {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "about_badges" });
  return {
    title: { absolute: t("meta_title") },
    description: t("meta_description"),
    openGraph: {
      title: t("meta_title"),
      description: t("meta_description"),
      type: "article",
      url: urlForLocalePath("/about/badges", locale),
      siteName: BRAND_NAME,
      locale: OG_LOCALE[locale],
      images: ["/og-image.png"],
    },
    alternates: buildAlternates("/about/badges", locale),
  };
}

export default async function AboutBadgesPage({ params }) {
  const { locale } = await params;
  setRequestLocale(locale);
  return <BadgesExplainer />;
}
