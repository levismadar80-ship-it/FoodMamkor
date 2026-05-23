import { getTranslations } from "next-intl/server";
import GroupBuyDetailClient from "./GroupBuyDetailClient";
import { API_URL } from "@/lib/env";
import { buildAlternates, buildEntityTitle, OG_LOCALE } from "@/lib/i18n-seo";

// MEH-476 PR 3b2: per-page hreflang + per-locale title. Was no metadata at all.
// Fetches group-buy title server-side for D1 title format; gracefully falls
// back to seo.group_buy.title_fallback if API unreachable.
async function getGroupBuy(id) {
  try {
    const res = await fetch(`${API_URL}/group-buys/${id}`, {
      next: { revalidate: 60 },
    });
    if (!res.ok) return null;
    return res.json();
  } catch {
    return null;
  }
}

export async function generateMetadata(props) {
  const params = await props.params;
  const { id, locale } = params;
  const [groupBuy, t] = await Promise.all([
    getGroupBuy(id),
    getTranslations({ locale, namespace: "seo.group_buy" }),
  ]);
  const path = `/group-buys/${id}`;
  const alternates = buildAlternates(path, locale);
  const entityName = groupBuy?.title || groupBuy?.name;

  if (!entityName) {
    // MEH-641: titleless entity treated as 404; SEO-worthless by design — see ticket for rationale.
    // MEH-476 followup: 404 paths should not be indexed even though they
    // still emit valid hreflang (so cross-locale 404s are linked).
    return {
      title: { absolute: t("title_fallback") },
      description: t("description_fallback"),
      robots: { index: false, follow: false },
      openGraph: {
        type: "article",
        locale: OG_LOCALE[locale],
        images: ["/og-image.png"],
      },
      alternates,
    };
  }

  return {
    // title.absolute — buildEntityTitle already includes brand.
    title: { absolute: buildEntityTitle(entityName, locale) },
    description: groupBuy?.description || t("description_fallback"),
    openGraph: {
      type: "article",
      locale: OG_LOCALE[locale],
      images: groupBuy?.image_url ? [groupBuy.image_url] : ["/og-image.png"],
    },
    alternates,
  };
}

export default async function GroupBuyDetailPage(props) {
  const params = await props.params;
  return <GroupBuyDetailClient id={params.id} />;
}
