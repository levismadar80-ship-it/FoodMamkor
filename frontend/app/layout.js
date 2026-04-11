import Script from "next/script";
import "./globals.css";
import { AuthProvider } from "@/lib/auth-context";
import Header from "@/components/Header";
import Footer from "@/components/Footer";
import BottomNav from "@/components/BottomNav";
import Toaster from "@/components/Toaster";
import CookieBanner from "@/components/CookieBanner";
import SmoothScrollProvider from "@/components/SmoothScrollProvider";
import CustomCursor from "@/components/CustomCursor";
import ChatWidget from "@/components/ChatWidget";

// LAUNCH_CHECKLIST week 1 — SEO. Rich default metadata that inherits
// to every page that doesn't override it. Individual page.js files
// can extend via `export const metadata = { ... }` on server components
// or via a wrapping server component for client pages.
const SITE_URL = process.env.SITE_URL || "https://mehamakor.co.il";
const SITE_TITLE = "מהמקור — אוכל אמיתי, ישר מהמקור אליך";
const SITE_DESCRIPTION =
  "בתי עסק מקומיים, מגדלים קטנים ושכנות שמבשלות בבית. מצאי אוכל אמיתי, טרי ובריא באזור שלך.";
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
      <body className="font-body bg-background text-site-text min-h-screen flex flex-col pb-16 md:pb-0">
        <AuthProvider>
          <SmoothScrollProvider>
            <Header />
            <main className="flex-1">{children}</main>
            <Footer />
            <BottomNav />
            <Toaster />
            <CookieBanner />
            {/* PREMIUM_DESIGN: subtle green dot cursor on desktop only —
                component self-disables on touch + reduced-motion. */}
            <CustomCursor />
            {/* AI Q&A bot — desktop only, floating bottom-left.
                Self-hides on mobile via `hidden md:flex`. */}
            <ChatWidget />
          </SmoothScrollProvider>
        </AuthProvider>
        {CLARITY_PROJECT_ID && (
          <Script id="ms-clarity" strategy="afterInteractive">
            {`(function(c,l,a,r,i,t,y){
              c[a]=c[a]||function(){(c[a].q=c[a].q||[]).push(arguments)};
              t=l.createElement(r);t.async=1;t.src="https://www.clarity.ms/tag/"+i;
              y=l.getElementsByTagName(r)[0];y.parentNode.insertBefore(t,y);
            })(window, document, "clarity", "script", "${CLARITY_PROJECT_ID}");`}
          </Script>
        )}
      </body>
    </html>
  );
}
