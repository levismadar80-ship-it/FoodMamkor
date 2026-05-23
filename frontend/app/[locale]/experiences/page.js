import ExperiencesClient from "./ExperiencesClient";
import { BRAND_NAME } from "@/lib/constants";

export const metadata = {
  title: "חוויות וסדנאות קהילתיות",
  description:
    "סדנאות בישול, סיורי אוכל, ושיעורי תזונה שמארחים אנשים מקומיים בישראל. גלי חוויה לפי עיר וקטגוריה, או הגישי חוויה משלך.",
  openGraph: {
    title: "חוויות וסדנאות קהילתיות | מהמקור",
    description:
      "סדנאות בישול, סיורי אוכל ושיעורי תזונה — מארחים מקומיים, חוויות אמיתיות.",
    type: "website",
    siteName: BRAND_NAME,
    locale: "he_IL",
    images: ["/og-image.png"],
  },
  alternates: { canonical: "/experiences" },
};

export default function ExperiencesPage() {
  return <ExperiencesClient />;
}
