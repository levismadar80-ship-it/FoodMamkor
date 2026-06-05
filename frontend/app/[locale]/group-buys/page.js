import GroupBuysClient from "./GroupBuysClient";
import { BRAND_NAME } from "@/lib/constants";
import { urlForLocalePath } from "@/lib/i18n-seo";

// MEH-740: static metadata → generateMetadata so og:url can be per-locale self.
export async function generateMetadata({ params }) {
  const { locale } = await params;
  return {
    title: "קבוצות רכש | מהמקור",
    description: "קנו ביחד וחסכו — קבוצות רכש מיצרנים מקומיים בישראל",
    openGraph: {
      title: "קבוצות רכש | מהמקור",
      description: "קנו ביחד וחסכו — קבוצות רכש מיצרנים מקומיים",
      type: "website",
      url: urlForLocalePath("/group-buys", locale),
      siteName: BRAND_NAME,
      locale: "he_IL",
    },
    alternates: { canonical: "/group-buys" },
  };
}

export default function GroupBuysPage() {
  return <GroupBuysClient />;
}
