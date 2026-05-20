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
import {
  buildAlternates,
  OG_LOCALE,
  OG_ALTERNATE_LOCALES,
} from "@/lib/i18n-seo";

const SITE_TITLE = "מהמקור — אוכל אמיתי, ישר מהמקור אליך";
const SITE_DESCRIPTION =
  "בתי עסק מקומיים, כולם במקום אחד. מצאי אוכל אמיתי, טרי ובריא באזור שלך.";
const OG_IMAGE = `${SITE_URL}/og-image.jpg`;

// MEH-476 PR 3b1: ACTIVE for all locale-stable routes (no headers() reads).
// PR 3b2: every public route has per-page generateMetadata; this layout-level
// metadata now functions only as fallback for routes without an override
// (auth chrome — /login, /register, etc — and the locale root /, /en).
export const revalidate = 3600;

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

  const title = t("title");
  const description = t("description");

  // Self-referencing canonical per locale. Linear MEH-476 <spec> says
  // "canonical = he_url (canonical to default locale)" but that's incorrect
  // for multilingual SEO: pointing EN canonical to HE would consolidate EN
  // ranking signals into HE, defeating the purpose of hreflang. Self-canonical
  // + hreflang is Google's documented best practice for multilingual sites.
  //
  // MEH-476 PR 3b2: layout's alternates is the FALLBACK for routes without
  // their own override. The 17 public routes in PR 3b2 scope all set their
  // own alternates (per-page URLs), which shallow-merge to replace these
  // root values. Routes still relying on this fallback: /, /en (locale
  // roots), /login, /register, /favorites, /settings, /search, /upgrade,
  // /reset-password, /verify-email. SEO impact on those is minimal — most
  // are auth chrome, not SEO surfaces.
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
    alternates: buildAlternates("/", locale),
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

  // MEH-476 PR 3b2: the JSX <link rel="alternate"> fallback block that
  // PR 3b1 left behind has been removed. All 17 public routes now emit
  // their own per-page hreflang via generateMetadata.alternates. The
  // layout's own generateMetadata.alternates above provides the root-URL
  // fallback signal for any route that doesn't override (auth chrome).
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
