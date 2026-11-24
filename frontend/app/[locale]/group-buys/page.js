// @ts-check
import { getTranslations, setRequestLocale } from "next-intl/server";
import HubFaq from "@/components/HubFaq";
import { HUB_FAQ } from "@/lib/hub-faq";
import GroupBuysClient from "./GroupBuysClient";
import { BRAND_NAME } from "@/lib/constants";
import { buildAlternates, buildEntityTitle, urlForLocalePath, OG_LOCALE } from "@/lib/i18n-seo";
import { getHubCount, hubRobots } from "@/lib/listing-supply";
import { rescueBagsEnabled } from "@/lib/rescue";
import { serverFirstJson } from "@/lib/server-first-json";
import { siteOgImageUrl } from "@/lib/og-site-image";

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
      images: [siteOgImageUrl(locale)], // MEH-2590: not inherited from the layout
    },
    alternates: buildAlternates("/group-buys", locale),
  };
}

// MEH-2233: the first list (status «open», no city) and its tab counts are
// read on the server, so the first HTML holds the cards. Before, the list
// waited for the JS bundle and a client request: the LCP landed at ~6.2s on a
// phone (staging 20/11, slow 4G + CPU x4). null = the client fetches, as before.

export default async function GroupBuysPage({ params }) {
  // MEH-3737: the FAQ reads messages on the server, so the locale is passed
  // explicitly (MEH-3049) and the page stays static.
  const { locale } = await params;
  setRequestLocale(locale);
  // MEH-3076: the rescue tab's supply, read here so the hub tab row is decided
  // before the first paint. The pilot off = known empty (0), not unknown.
  const [initialItems, initialCounts, rescueCount] = await Promise.all([
    // Every row an object with an id: a malformed row must not break the server render.
    serverFirstJson("/group-buys?status=open", (j) => Array.isArray(j) && j.every((x) => !!x && typeof x === "object" && "id" in x)),
    serverFirstJson("/group-buys/counts", (j) => !!j && typeof j === "object" && !Array.isArray(j)),
    rescueBagsEnabled() ? getHubCount("rescue") : Promise.resolve(0),
  ]);
  return (
    <>
      <GroupBuysClient initialItems={initialItems} initialCounts={initialCounts} serverSupply={{ rescue: rescueCount }} />
      {/* MEH-3737: common questions under the list, with FAQPage JSON-LD. */}
      <HubFaq faq={HUB_FAQ.groupBuys} locale={locale} />
    </>
  );
}
