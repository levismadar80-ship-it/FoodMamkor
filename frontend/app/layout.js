import "./globals.css";
import { AuthProvider } from "@/lib/auth-context";
import Header from "@/components/Header";
import Footer from "@/components/Footer";
import BottomNav from "@/components/BottomNav";
import Toaster from "@/components/Toaster";
import CookieBanner from "@/components/CookieBanner";
import SmoothScrollProvider from "@/components/SmoothScrollProvider";

// LAUNCH_CHECKLIST week 1 — SEO. Rich default metadata that inherits
// to every page that doesn't override it. Individual page.js files
// can extend via `export const metadata = { ... }` on server components
// or via a wrapping server component for client pages.
const SITE_URL = process.env.SITE_URL || "https://mehamakor.co.il";

export const metadata = {
  metadataBase: new URL(SITE_URL),
  title: {
    default: "מהמקור — אוכל אמיתי, ישר מהמקור אליך",
    template: "%s | מהמקור",
  },
  description:
    "דירקטורי ישראלי של בתי עסק מקומיים לאוכל בריא: מגדלים קטנים, שכנות שמבשלות בבית, בשר grass-fed, גבינות, לחם מחמצת ועוד. גלי בתי עסק קרובים אלייך במפה.",
  keywords: [
    "אוכל אמיתי", "מוצרים מקומיים", "grass-fed",
    "אוכל בריא", "אוכל אורגני", "יצרנים ישראלים",
    "מהמקור", "שוק איכרים",
  ],
  manifest: "/manifest.json",
  icons: {
    icon: "/favicon.ico",
    apple: "/icon-192.png",
  },
  openGraph: {
    type: "website",
    locale: "he_IL",
    url: SITE_URL,
    siteName: "מהמקור",
    title: "מהמקור — אוכל אמיתי, ישר מהמקור אליך",
    description:
      "בתי עסק מקומיים, מגדלים קטנים ושכנות שמבשלות בבית. מצאי אוכל אמיתי קרוב אלייך.",
    images: [
      {
        url: "/logo.png",
        width: 600,
        height: 225,
        alt: "מהמקור",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: "מהמקור — אוכל אמיתי, ישר מהמקור אליך",
    description:
      "בתי עסק מקומיים, מגדלים קטנים ושכנות שמבשלות בבית.",
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

export default function RootLayout({ children }) {
  return (
    <html lang="he" dir="rtl">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
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
          </SmoothScrollProvider>
        </AuthProvider>
      </body>
    </html>
  );
}
