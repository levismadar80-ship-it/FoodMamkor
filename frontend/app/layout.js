import "./globals.css";
import { AuthProvider } from "@/lib/auth-context";
import Header from "@/components/Header";
import Footer from "@/components/Footer";
import BottomNav from "@/components/BottomNav";
import Toaster from "@/components/Toaster";
import CookieBanner from "@/components/CookieBanner";

export const metadata = {
  title: "מהמקור — אוכל אמיתי, ישר מהמקור אליך",
  description: "פלטפורמה לחיבור בין בתי עסק מקומיים לקונים. מצאו בתי עסק מקומיים, אורגניים ובריאים באזור שלכם.",
  manifest: "/manifest.json",
  icons: {
    icon: "/favicon.ico",
    apple: "/icon-192.png",
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
          <Header />
          <main className="flex-1">{children}</main>
          <Footer />
          <BottomNav />
          <Toaster />
          <CookieBanner />
        </AuthProvider>
      </body>
    </html>
  );
}
