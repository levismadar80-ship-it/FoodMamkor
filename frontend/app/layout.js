import "./globals.css";
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

// LAUNCH_CHECKLIST week 1 — SEO. Rich default metadata that inherits
// to every page that doesn't override it. Individual page.js files
// can extend via `export const metadata = { ... }` on server components
// or via a wrapping server component for client pages.
const SITE_URL = process.env.SITE_URL || "https://mehamakor.co.il";
const SITE_TITLE = "מהמקור — אוכל אמיתי, ישר מהמקור אליך";
const SITE_DESCRIPTION =
  "בתי עסק מקומיים, כולם במקום אחד. מצאי אוכל אמיתי, טרי ובריא באזור שלך.";
// FINAL_AUDIT: OG image lives in /public/og-image.jpg (1200×630 recommended).
const OG_IMAGE = `${SITE_URL}/og-image.jpg`;

export const metadata = {
  metadataBase: new URL(SITE_URL),
  title: {
    default: SITE_TITLE,
    template: "%s | מהמקור",
  },
  description: SITE_DESCRIPTION,
  keywords: [
    "אוכל אמיתי",
    "מוצרים מקומיים",
    "grass-fed",
    "אוכל בריא",
    "אוכל אורגני",
    "יצרנים ישראלים",
    "מהמקור",
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
    siteName: "מהמקור",
    title: SITE_TITLE,
    description: SITE_DESCRIPTION,
    images: [
      {
        url: OG_IMAGE,
        width: 1200,
        height: 630,
        alt: "מהמקור — אוכל אמיתי, ישר מהמקור אליך",
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
  alternates: {
    canonical: SITE_URL,
  },
  // iOS Safari: launch in standalone mode (no browser chrome) when added to Home Screen.
  appleWebApp: {
    capable: true,
    statusBarStyle: "black-translucent",
    title: "מהמקור",
  },
};

export const viewport = {
  themeColor: "#2e6853",
};

// FINAL_AUDIT: Microsoft Clarity — opt-in via NEXT_PUBLIC_CLARITY_PROJECT_ID.
const CLARITY_PROJECT_ID = process.env.NEXT_PUBLIC_CLARITY_PROJECT_ID;

export default function RootLayout({ children }) {
  return (
    <html lang="he" dir="rtl">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        {/* OPTIMIZE: preconnect to Unsplash so the hero background
            (which lives on a CSS `background-image` and therefore
            bypasses next/image) starts downloading as early as possible.
            Improves LCP on the homepage hero. */}
        <link rel="preconnect" href="https://images.unsplash.com" crossOrigin="anonymous" />
        <link
          href="https://fonts.googleapis.com/css2?family=Frank+Ruhl+Libre:wght@400;700;900&family=Cormorant+Garamond:wght@400;600&family=DM+Sans:wght@400;500;600&display=swap"
          rel="stylesheet"
        />
      </head>
      <body className="font-body bg-background text-site-text min-h-screen flex flex-col pb-20 md:pb-0">
        <a href="#main-content" className="sr-only focus:not-sr-only focus:absolute focus:top-2 focus:right-2 focus:z-[10000] focus:bg-primary focus:text-white focus:px-4 focus:py-2 focus:rounded-lg">
          דלג לתוכן הראשי
        </a>
        <AuthProvider>
          <LanguageProvider>
          <SmoothScrollProvider>
            <Header />
            <main id="main-content" className="flex-1">{children}</main>
            <FooterSlot />
            <BottomNav />
            <Toaster />
            <CookieBanner />
            {/* PREMIUM_DESIGN: subtle green dot cursor on desktop only —
                component self-disables on touch + reduced-motion. */}
            <CustomCursor />
            {/* AI Q&A bot — desktop only, floating bottom-left.
                Self-hides on mobile via `hidden md:flex`. */}
            <ChatWidget />
            <InstallPrompt />
          </SmoothScrollProvider>
          </LanguageProvider>
        </AuthProvider>
        {CLARITY_PROJECT_ID && <ClarityScript projectId={CLARITY_PROJECT_ID} />}
        <SpeedInsights />
      </body>
    </html>
  );
}
