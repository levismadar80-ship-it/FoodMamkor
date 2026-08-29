import "../globals.css";
import { FONT_VARIABLES } from "../fonts";
import { notFound } from "next/navigation";
import { NextIntlClientProvider, hasLocale } from "next-intl";
import { MotionConfig } from "framer-motion";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { AuthProvider } from "@/lib/auth-context";
import { LanguageProvider } from "@/lib/language-context";
import Header from "@/components/Header";
import VerifyBanner from "@/components/VerifyBanner";
import FooterSlot from "@/components/FooterSlot";
import BottomNav from "@/components/BottomNav";
import Toaster from "@/components/Toaster";
import CookieBanner from "@/components/CookieBanner";
import SmoothScrollProvider from "@/components/SmoothScrollProvider";
import CustomCursor from "@/components/CustomCursor";
import ChatWidgetLazy from "@/components/ChatWidgetLazy";
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

// MEH-1831 / MEH-2029: the four brand typefaces are self-hosted from .woff2
// files committed in this repo, and the build makes no network request for
// them. The loader lives in app/fonts.js — next/font calls have to sit in a
// module of their own here, because Turbopack's SWC transform serialises their
// arguments statically and the declarations are long enough to bury this file.
// Read app/fonts.js before changing any font: it carries the ordering rule that
// keeps a fallback face from swallowing Hebrew, and the reason each weight
// repeats the same path.
// DO NOT add @font-face blocks for these families — next/font owns their
// hosting, and a hand-written face would resolve to a different file.

const SITE_TITLE = "מהמקור — בתי עסק מקומיים בתחום המזון, כולם במקום אחד";
const SITE_DESCRIPTION =
  "בתי עסק מקומיים מתחום המזון בישראל, כולם במקום אחד. כל בית עסק נבחר אישית.";
const OG_IMAGE = `${SITE_URL}/og-image.png`;
// MEH-1060 (SEO-11): og-image-en.png exists but was unreferenced — /en/* pages
// shared the Hebrew-text og-image.png. Select the EN artwork for the en locale.
const OG_IMAGE_EN = `${SITE_URL}/og-image-en.png`;

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
  // MEH-1060 (SEO-11): locale-conditional OG/Twitter artwork.
  const ogImageUrl = locale === "en" ? OG_IMAGE_EN : OG_IMAGE;

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
  // roots), /login, /register, /favorites, /settings, /search,
  // /reset-password, /verify-email. (MEH-1555 removed /upgrade from this
  // list along with the route.) SEO impact on those is minimal — most
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
          url: ogImageUrl,
          alt: title,
        },
      ],
    },
    twitter: {
      ...BASE_METADATA.twitter,
      title: t("twitter_title"),
      description: t("twitter_description"),
      images: [ogImageUrl],
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
  const tSweep = await getTranslations({ locale, namespace: "sweep_tail.layout" });

  // MEH-476 PR 3b2: the JSX <link rel="alternate"> fallback block that
  // PR 3b1 left behind has been removed. All 17 public routes now emit
  // their own per-page hreflang via generateMetadata.alternates. The
  // layout's own generateMetadata.alternates above provides the root-URL
  // fallback signal for any route that doesn't override (auth chrome).
  const dir = locale === "he" ? "rtl" : "ltr";

  return (
    <html lang={locale} dir={dir} className={FONT_VARIABLES}>
      <head>
        {/* MEH-1831: the fonts.googleapis/gstatic preconnects and the Google
            Fonts stylesheet that used to sit here are gone — next/font serves
            every family from our own origin, so there is nothing left to
            preconnect to. */}
        {/* MEH-1834: res.cloudinary.com serves every producer photo, including
            the LCP image on the home grid and producer pages — it had no
            preconnect while unsplash and the three OSM shards did. */}
        <link rel="preconnect" href="https://res.cloudinary.com" crossOrigin="anonymous" />
        <link rel="preconnect" href="https://images.unsplash.com" crossOrigin="anonymous" />
        {/* MEH-604: preconnect OSM tile shards (a/b/c) for HomepageMiniMap above-the-fold */}
        <link rel="preconnect" href="https://a.tile.openstreetmap.org" crossOrigin="anonymous" />
        <link rel="preconnect" href="https://b.tile.openstreetmap.org" crossOrigin="anonymous" />
        <link rel="preconnect" href="https://c.tile.openstreetmap.org" crossOrigin="anonymous" />
      </head>
      {/* MEH-1775: `pb-20 md:pb-0` reserved room for the BottomNav band and for
          NOTHING else, so the cookie banner — which floats in its own band
          starting ABOVE that one (CookieBanner.jsx — MEH-1950: bottom derives
          from --bottom-nav-clearance + 8px, ≈ safe-area+80px at default height)
          — covered whatever in-flow content sat at the end of the scroll. On
          /register/producer step 2 that was the «הבא» button: a WCAG 2.2 AA
          failure (SC 2.4.11, W3C failure F110), not a cosmetic one.
          `--bottom-inset` (globals.css, under `html`) now owns that sum. It
          still evaluates to exactly 5rem when the banner is absent, which is
          what the old class said — so this is a superset, not a re-spacing. */}
      <body className="font-body-md bg-background text-text min-h-screen flex flex-col pb-[var(--bottom-inset)]">
        <a href="#main-content" className="sr-only focus:not-sr-only focus:absolute focus:top-2 focus:start-2 focus:z-[10000] focus:bg-primary focus:text-white focus:px-4 focus:py-2 focus:rounded-lg">
          {tSweep("skip_to_main")}
        </a>
        <NextIntlClientProvider>
          <AuthProvider>
            <LanguageProvider>
              <SmoothScrollProvider>
                {/* MEH-788: global reduced-motion off-switch for ALL
                    framer-motion (FadeInSection scroll-reveals, home hero/grid,
                    etc.). reducedMotion="user" makes framer honor
                    prefers-reduced-motion — its default is "never", which is why
                    motion previously ignored the OS setting. CSS-driven motion
                    (hover transitions, marquee, kenburns) is covered by the
                    global @media block in globals.css. */}
                <MotionConfig reducedMotion="user">
                <Header />
                {/* MEH-731: verify banner relocated out of the sticky <header>
                    to the top of <main> so the floating navbar pill stays pure
                    on the homepage. Still shows on every page + when scrolled. */}
                {/* MEH-735: tabIndex=-1 + focus:outline-none make <main> a
                    programmatic focus target for the skip-to-content link
                    (layout.js:199) without a full-width focus ring. */}
                <main id="main-content" tabIndex={-1} className="flex-1 focus:outline-none"><VerifyBanner />{children}</main>
                <FooterSlot />
                <BottomNav />
                <Toaster />
                <CookieBanner />
                <CustomCursor />
                <ChatWidgetLazy />
                <InstallPrompt />
                </MotionConfig>
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
