import AboutClient from "./AboutClient";
import { BRAND_NAME } from "@/lib/constants";

export const metadata = {
  title: "החזון שלנו — על מהמקור",
  description:
    "מהמקור נולדה מתוך צורך אמיתי — למצוא אוכל אמיתי, ישר מהמקור. הסיפור של ספיר, המייסדת, הערכים שלנו וקריטריוני הכניסה לבתי עסק.",
  openGraph: {
    title: "החזון שלנו — על מהמקור",
    description: "הסיפור של ספיר, הערכים וקריטריוני הכניסה.",
    type: "article",
    siteName: BRAND_NAME,
    locale: "he_IL",
    images: ["/og-image.jpg"],
  },
  alternates: { canonical: "/about" },
};

export default function AboutPage() {
  return <AboutClient />;
}
