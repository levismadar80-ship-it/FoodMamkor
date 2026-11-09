import { getTranslations } from "next-intl/server";
import GroupBuysClient from "./GroupBuysClient";
import { BRAND_NAME } from "@/lib/constants";
import { buildAlternates, buildEntityTitle, urlForLocalePath, OG_LOCALE } from "@/lib/i18n-seo";
import { getHubCount, hubRobots } from "@/lib/listing-supply";

// MEH-740: static metadata → generateMetadata so og:url can be per-locale self.
// MEH-475 Wave 6: metadata strings → seo.group_buys.* (was hardcoded HE) +
// hreflang leftover fixed (canonical-only → buildAlternates). Refs MEH-476.
// MEH-2853: the key no longer carries the brand, so the layout template adds
// it once — no title.absolute.
export async function generateMetadata({ params }) {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "seo.group_buys" });
  // MEH-2369: a hub that is KNOWN to be empty is noindex (an empty listing
  // reads to Google as a soft 404); an unknown count stays indexable.
  const robots = hubRobots(await getHubCount("groupBuys"));
  return {
    ...(robots ? { robots } : {}),
    // MEH-2853: plain title — the layout template `%s | <brand>` adds the brand.
    title: t("title"),
    description: t("description"),
    openGraph: {
      title: buildEntityTitle(t("og_title"), locale),
      description: t("og_description"),
      type: "website",
      url: urlForLocalePath("/group-buys", locale),
      siteName: BRAND_NAME,
      locale: OG_LOCALE[locale],
      images: ["/og-image.png"], // MEH-2590: not inherited from the layout
    },
    alternates: buildAlternates("/group-buys", locale),
  };
}

export default function GroupBuysPage() {
  return <GroupBuysClient />;
}
