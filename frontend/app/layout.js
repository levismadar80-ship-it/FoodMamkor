import "./globals.css";
import { AuthProvider } from "@/lib/auth-context";
import Header from "@/components/Header";
import Footer from "@/components/Footer";

export const metadata = {
  title: "מהמקור — אוכל אמיתי, ישר מהמקור אליך",
  description: "פלטפורמה לחיבור בין יצרני מזון איכותיים לקונים. מצאו יצרנים מקומיים, אורגניים ובריאים באזור שלכם.",
  manifest: "/manifest.json",
};

export const viewport = {
  themeColor: "#2D6A2D",
};

export default function RootLayout({ children }) {
  return (
    <html lang="he" dir="rtl">
      <body className="font-heebo bg-cream text-text-primary min-h-screen flex flex-col">
        <AuthProvider>
          <Header />
          <main className="flex-1">{children}</main>
          <Footer />
        </AuthProvider>
      </body>
    </html>
  );
}
