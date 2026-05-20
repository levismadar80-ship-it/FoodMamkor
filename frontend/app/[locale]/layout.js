import "../globals.css";
import { notFound } from "next/navigation";
import { NextIntlClientProvider, hasLocale } from "next-intl";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { AuthProvider } from "@/lib/auth-context";
import { LanguageProvider } from "@/lib/language-context";
import Header from "@/components/Header";
import FooterSlot from "@/components/FooterSlot";
import BottomNav from "@/components/BottomNav";
import Toaster from "@/components/Toaster";
import CookieBanner from "@/components/CookieBanner";
import SmoothScrollProvider from "@/components/SmoothScrollProvider";
import CustomCursor from "@/components/CustomCursor";
import ChatWidget from "@/components/ChatWidget";
import InstallPrompt from "@/components/InstallPrompt";
import ClarityScript from "@/components/ClarityScript";
import { SpeedInsights } from "@vercel/speed-insights/next";
import { env, SITE_URL } from "@/lib/env";
import { BRAND_NAME } from "@/lib/constants";
import { routing } from "@/i18n/routing";

const SITE_TITLE = "מהמקור — אוכל אמיתי, ישר מהמקור אליך";
const SITE_DESCRIPTION =
  "בתי עסק מקומיים, כולם במקום אחד. מצאי אוכל אמיתי, טרי ובריא באזור שלך.";
const OG_IMAGE = `${SITE_URL}/og-image.jpg`;

// MEH-476 PR 2: hreflang codes emitted to Google. Matches sitemap.js (MEH-476
// PR 1) for cross-signal consistency. "he-IL" geo-targets the Israeli audience
// (mehamakor.online is IL-only); routing locale codes ("he", "en") stay
// unchanged in middleware + URL building below.
// DO NOT add to routing.locales without adding the matching HREFLANG_CODES
// entry — silent drift class (MEH-271 smell #2).
const HREFLANG_CODES = { he: "he-IL", en: "en" };

// MEH-476 PR 3a: OG locale codes per Facebook's spec (underscored region).
// DO NOT add to routing.locales without adding the matching OG_LOCALE entry.
const OG_LOCALE = { he: "he_IL", en: "en_US" };
const OG_ALTERNATE_LOCALES = ["he_IL", "en_US"];

// MEH-476 PR 3b1: now ACTIVE. PR 2's headers() read has been removed in favor
// of per-page generateMetadata (sample: app/[locale]/about/page.js). Layout
// itself only emits root-level hreflang as fallback; ISR cache hint is honored
// for routes whose generateMetadata is locale-stable (no request-time APIs).
export const revalidate = 3600;

// localePrefix is "as-needed": defaultLocale (he) has no prefix; others get
// /<locale>. Normalize "/" to "" so the home URL has no trailing slash
// (`${SITE_URL}` for HE, `${SITE_URL}/en` for EN).
function urlForLocale(path, locale) {
  const base = locale === routing.defaultLocale ? SITE_URL : `${SITE_URL}/${locale}`;
  const normalized = path === "/" ? "" : path;
  return `${base}${normalized}`;
}

// Resolve the root-level canonical + per-locale hreflang URLs. After MEH-476
// PR 3b1, layout no longer derives the request pathname (was: headers()).
// This produces root URLs ("/" / "/en") as fallback signal for routes without
// their own per-page generateMetadata. Pages with overrides (e.g. /about post
// 3b1) emit per-page URLs from their own generateMetadata; 11 other pages
// still use this fallback until PR 3b2 sweeps them.
function getLocaleUrls(locale) {
  const languages = Object.fromEntries(
    routing.locales.map((l) => [HREFLANG_CODES[l] ?? l, urlForLocale("/", l)]),
  );
  // x-default → HE per MEH-366 Q1 decision: Israeli audience is the primary market.
  languages["x-default"] = urlForLocale("/", routing.defaultLocale);

  return {
    canonical: urlForLocale("/", locale),
    languages,
  };
}

// Base metadata shared across all locales. PR 3 (MEH-476) will translate
// title / description / OG content per locale — this PR is hreflang-only.
const BASE_METADATA = {
  metadataBase: new URL(SITE_URL),
  title: {
    default: SITE_TITLE,
    template: `%s | ${BRAND_NAME}`,
  },
  description: SITE_DESCRIPTION,
  keywords: [
    "אוכל אמיתי",
    "מוצרים מקומיים",
    "grass-fed",
    "אוכל בריא",
    "אוכל אורגני",
    "בעלי עסק ישראלים",
    BRAND_NAME,
    "שוק איכרים",
  ],
  manifest: "/manifest.json",
  icons: {
    icon: [
      { url: "/favicon.ico", sizes: "any" },
      { url: "/icon-192.png", type: "image/png", sizes: "192x192" },
      { url: "/icon-512.png", type: "image/png", sizes: "512x512" },
    ],
    apple: [
      { url: "/apple-touch-icon.png", sizes: "180x180", type: "image/png" },
    ],
  },
  openGraph: {
    type: "website",
    locale: "he_IL",
    url: SITE_URL,
    siteName: BRAND_NAME,
    title: SITE_TITLE,
    description: SITE_DESCRIPTION,
    images: [
      {
        url: OG_IMAGE,
        width: 1200,
        height: 630,
        alt: SITE_TITLE,
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: SITE_TITLE,
    description: SITE_DESCRIPTION,
    images: [OG_IMAGE],
  },
  robots: {
    index: true,
    follow: true,
  },
  appleWebApp: {
    capable: true,
    statusBarStyle: "black-translucent",
    title: BRAND_NAME,
  },
  other: {
    "mobile-web-app-capable": "yes",
  },
};

export async function generateMetadata({ params }) {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "seo.site" });
  const { canonical } = getLocaleUrls(locale);

  const title = t("title");
  const description = t("description");

  // Self-referencing canonical per locale. Linear MEH-476 <spec> says
  // "canonical = he_url (canonical to default locale)" but that's incorrect
  // for multilingual SEO: pointing EN canonical to HE would consolidate EN
  // ranking signals into HE, defeating the purpose of hreflang. Self-canonical
  // + hreflang is Google's documented best practice for multilingual sites.
  //
  // MEH-476 PR 3b1: hreflang now in metadata.alternates.languages (was JSX
  // <head> children in PR 2). Pages with their own alternates.languages map
  // (e.g. /about post PR 3b1) emit per-page URLs that override these root-
  // level fallback values via Next.js metadata-API merge semantics. Pages
  // still using only `alternates: { canonical: '/path' }` retain layout's
  // root-URL languages signal until PR 3b2 sweeps them.
  //
  // Q6 hybrid: openGraph.siteName + appleWebApp.title stay BRAND_NAME
  // ("מהמקור") even on /en/* (UI metadata / platform chrome). Per-locale
  // title / description / og / twitter content comes from seo.site.* keys.
  return {
    ...BASE_METADATA,
    title: {
      default: title,
      template: `%s | ${BRAND_NAME}`,
    },
    description,
    openGraph: {
      ...BASE_METADATA.openGraph,
      title: t("og_title"),
      description: t("og_description"),
      locale: OG_LOCALE[locale],
      alternateLocale: OG_ALTERNATE_LOCALES.filter((l) => l !== OG_LOCALE[locale]),
      images: [
        {
          ...BASE_METADATA.openGraph.images[0],
          alt: title,
        },
      ],
    },
    twitter: {
      ...BASE_METADATA.twitter,
      title: t("twitter_title"),
      description: t("twitter_description"),
    },
    // alternates.languages intentionally NOT set on layout's metadata API
    // post PR 3b1: child pages with `alternates: { canonical }` shallow-merge
    // and would drop the languages map anyway. Hreflang fallback for those
    // pages comes from the JSX <link> emission in LocaleLayout below.
    alternates: { canonical },
  };
}

export const viewport = {
  themeColor: "#2e6853",
};

export function generateStaticParams() {
  return routing.locales.map((locale) => ({ locale }));
}

const CLARITY_PROJECT_ID = env.NEXT_PUBLIC_CLARITY_PROJECT_ID;

export default async function LocaleLayout({ children, params }) {
  const { locale } = await params;
  if (!hasLocale(routing.locales, locale)) {
    notFound();
  }
  setRequestLocale(locale);

  // MEH-476 PR 3b1: hreflang via JSX <link> here is the FALLBACK signal for
  // pages that override `alternates` but didn't add their own `languages` map
  // (currently 11 of 12 alternates-override pages). Emits root URLs since
  // layout no longer derives the request pathname (was: PR 2's headers()).
  // Pages that DO set their own `alternates.languages` (post PR 3b1: /about;
  // post PR 3b2: all 12) get per-page URLs via the metadata API in addition
  // to these root-URL JSX tags. The duplicate is accepted carry-over until
  // PR 3b2 finishes the sweep — at which point this JSX block can be deleted.
  const { languages } = getLocaleUrls(locale);

  const dir = locale === "he" ? "rtl" : "ltr";

  return (
    <html lang={locale} dir={dir}>
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link rel="preconnect" href="https://images.unsplash.com" crossOrigin="anonymous" />
        {/* MEH-604: preconnect OSM tile shards (a/b/c) for HomepageMiniMap above-the-fold */}
        <link rel="preconnect" href="https://a.tile.openstreetmap.org" crossOrigin="anonymous" />
        <link rel="preconnect" href="https://b.tile.openstreetmap.org" crossOrigin="anonymous" />
        <link rel="preconnect" href="https://c.tile.openstreetmap.org" crossOrigin="anonymous" />
        <link
          href="https://fonts.googleapis.com/css2?family=Frank+Ruhl+Libre:wght@400;700;900&family=Cormorant+Garamond:wght@400;600&family=DM+Sans:wght@400;500;600&display=swap"
          rel="stylesheet"
        />
        {/* MEH-476 PR 3b1: root-URL hreflang fallback for 11 pages without
            per-page generateMetadata yet. PR 3b2 removes this block. */}
        {Object.entries(languages).map(([code, href]) => (
          <link key={code} rel="alternate" hrefLang={code} href={href} />
        ))}
      </head>
      <body className="font-body bg-background text-site-text min-h-screen flex flex-col pb-20 md:pb-0">
        {/* rtl-ok: focus position for accessibility */}
        <a href="#main-content" className="sr-only focus:not-sr-only focus:absolute focus:top-2 focus:right-2 focus:z-[10000] focus:bg-primary focus:text-white focus:px-4 focus:py-2 focus:rounded-lg">
          דלג לתוכן הראשי
        </a>
        <NextIntlClientProvider>
          <AuthProvider>
            <LanguageProvider>
              <SmoothScrollProvider>
                <Header />
                <main id="main-content" className="flex-1">{children}</main>
                <FooterSlot />
                <BottomNav />
                <Toaster />
                <CookieBanner />
                <CustomCursor />
                <ChatWidget />
                <InstallPrompt />
              </SmoothScrollProvider>
            </LanguageProvider>
          </AuthProvider>
        </NextIntlClientProvider>
        {CLARITY_PROJECT_ID && <ClarityScript projectId={CLARITY_PROJECT_ID} />}
        <SpeedInsights />
      </body>
    </html>
  );
}
