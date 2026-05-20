import { getTranslations } from "next-intl/server";
import AboutClient from "./AboutClient";
import { BRAND_NAME } from "@/lib/constants";
import { SITE_URL } from "@/lib/env";
import { routing } from "@/i18n/routing";

// MEH-476 PR 3b1: per-page generateMetadata sample. Establishes the pattern
// that replaces PR 2's layout-level headers()-based hreflang derivation.
// PR 3b2 will propagate to the 11 other pages with alternates overrides.
//
// Helpers mirror layout.js (HREFLANG_CODES + OG_LOCALE + urlForLocale). When
// PR 3b2 lands, candidate to extract into a shared lib/i18n-seo.js — kept
// inline for now since this is the first/sample call site.
// DO NOT add to routing.locales without adding the matching HREFLANG_CODES +
// OG_LOCALE entries — silent drift class (MEH-271 smell #2).
const HREFLANG_CODES = { he: "he-IL", en: "en" };
const OG_LOCALE = { he: "he_IL", en: "en_US" };
const ABOUT_PATH = "/about";

function urlForLocale(locale) {
  const base = locale === routing.defaultLocale ? SITE_URL : `${SITE_URL}/${locale}`;
  return `${base}${ABOUT_PATH}`;
}

export async function generateMetadata({ params }) {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "seo.about" });

  const languages = Object.fromEntries(
    routing.locales.map((l) => [HREFLANG_CODES[l] ?? l, urlForLocale(l)]),
  );
  // x-default → HE per MEH-366 Q1 decision: Israeli audience is the primary market.
  languages["x-default"] = urlForLocale(routing.defaultLocale);

  const title = t("title");

  return {
    title,
    description: t("description"),
    openGraph: {
      title: t("og_title"),
      description: t("og_description"),
      type: "article",
      siteName: BRAND_NAME,
      locale: OG_LOCALE[locale],
      images: ["/og-image.jpg"],
    },
    alternates: {
      canonical: urlForLocale(locale),
      languages,
    },
  };
}

export default function AboutPage() {
  return <AboutClient />;
}
