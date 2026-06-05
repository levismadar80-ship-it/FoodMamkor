import ExperiencesClient from "./ExperiencesClient";
import { BRAND_NAME } from "@/lib/constants";
import { urlForLocalePath } from "@/lib/i18n-seo";

// MEH-740: static metadata → generateMetadata so og:url can be per-locale self.
export async function generateMetadata({ params }) {
  const { locale } = await params;
  return {
    title: "חוויות וסדנאות קהילתיות",
    description:
      "סדנאות בישול, סיורי אוכל, ושיעורי תזונה שמארחים אנשים מקומיים בישראל. גלי חוויה לפי עיר וקטגוריה, או הגישי חוויה משלך.",
    openGraph: {
      title: "חוויות וסדנאות קהילתיות | מהמקור",
      description:
        "סדנאות בישול, סיורי אוכל ושיעורי תזונה — מארחים מקומיים, חוויות אמיתיות.",
      type: "website",
      url: urlForLocalePath("/experiences", locale),
      siteName: BRAND_NAME,
      locale: "he_IL",
      images: ["/og-image.png"],
    },
    alternates: { canonical: "/experiences" },
  };
}

export default function ExperiencesPage() {
  return <ExperiencesClient />;
}
