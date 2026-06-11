import { getTranslations } from "next-intl/server";
import GroupBuysClient from "./GroupBuysClient";
import { BRAND_NAME } from "@/lib/constants";
import { buildAlternates, urlForLocalePath, OG_LOCALE } from "@/lib/i18n-seo";

// MEH-740: static metadata → generateMetadata so og:url can be per-locale self.
// MEH-475 Wave 6: metadata strings → seo.group_buys.* (was hardcoded HE) +
// hreflang leftover fixed (canonical-only → buildAlternates). title.absolute
// also drops the prior double-brand (non-absolute key carried the suffix,
// then the layout template appended a second). Refs MEH-476.
export async function generateMetadata({ params }) {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "seo.group_buys" });
  return {
    title: { absolute: t("title") },
    description: t("description"),
    openGraph: {
      title: t("og_title"),
      description: t("og_description"),
      type: "website",
      url: urlForLocalePath("/group-buys", locale),
      siteName: BRAND_NAME,
      locale: OG_LOCALE[locale],
    },
    alternates: buildAlternates("/group-buys", locale),
  };
}

export default function GroupBuysPage() {
  return <GroupBuysClient />;
}
