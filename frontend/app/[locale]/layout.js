import "../globals.css";
import { headers } from "next/headers";
import { notFound } from "next/navigation";
import { NextIntlClientProvider, hasLocale } from "next-intl";
import { setRequestLocale } from "next-intl/server";
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

// localePrefix is "as-needed": defaultLocale (he) has no prefix; others get
// /<locale>. Normalize "/" to "" so the home URL has no trailing slash
// (`${SITE_URL}` for HE, `${SITE_URL}/en` for EN).
function urlForLocale(path, locale) {
  const base = locale === routing.defaultLocale ? SITE_URL : `${SITE_URL}/${locale}`;
  const normalized = path === "/" ? "" : path;
  return `${base}${normalized}`;
}

// Strip the /{locale} prefix from a request pathname so it can be re-applied
// per locale. "/en/about" → "/about"; "/about" → "/about"; "/" → "/".
// Only non-default locales carry a prefix under localePrefix:"as-needed".
function stripLocalePrefix(pathname) {
  for (const locale of routing.locales) {
    if (locale === routing.defaultLocale) continue;
    const prefix = `/${locale}`;
    if (pathname === prefix) return "/";
    if (pathname.startsWith(`${prefix}/`)) return pathname.slice(prefix.length);
  }
  return pathname;
}

// Resolve the canonical + per-locale hreflang URLs for the current request.
// Reads x-pathname (set by middleware.js) and strips the locale segment so
// each locale's URL can be reconstructed. Shared by generateMetadata + the
// LocaleLayout component so canonical and hreflang derive from the same
// path on every render.
async function getLocaleUrls(locale) {
  const h = await headers();
  const rawPath = h.get("x-pathname") || "/";
  const pathWithoutLocale = stripLocalePrefix(rawPath);

  const languages = Object.fromEntries(
    routing.locales.map((l) => [HREFLANG_CODES[l] ?? l, urlForLocale(pathWithoutLocale, l)]),
  );
  // x-default → HE per MEH-366 Q1 decision: Israeli audience is the primary market.
  languages["x-default"] = urlForLocale(pathWithoutLocale, routing.defaultLocale);

  return {
    canonical: urlForLocale(pathWithoutLocale, locale),
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
  const { canonical } = await getLocaleUrls(locale);

  // Self-referencing canonical per locale. Linear MEH-476 <spec> says
  // "canonical = he_url (canonical to default locale)" but that's incorrect
  // for multilingual SEO: pointing EN canonical to HE would consolidate EN
  // ranking signals into HE, defeating the purpose of hreflang. Self-canonical
  // + hreflang is Google's documented best practice for multilingual sites.
  //
  // Hreflang `<link rel="alternate">` tags are emitted from LocaleLayout
  // JSX below (not here) because 12 child pages override `alternates` with
  // their own canonical-only object, which would shallow-merge over any
  // `languages` map set here. JSX `<head>` children render alongside the
  // metadata API and don't conflict with that merge.
  return {
    ...BASE_METADATA,
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

  // MEH-476 PR 2: compute hreflang URLs here (JSX path) rather than in
  // generateMetadata so the tags survive page-level `alternates` overrides
  // (12 pages set their own `alternates.canonical` which shallow-merges
  // over the layout's metadata.alternates). JSX `<head>` children render
  // independently of the metadata API merge.
  const { languages } = await getLocaleUrls(locale);

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
        {/* MEH-476 PR 2: hreflang signals to Google. Matches sitemap.js (PR 1)
            for cross-signal consistency. x-default → HE per MEH-366 Q1. */}
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
