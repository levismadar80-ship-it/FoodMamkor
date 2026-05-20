/**
 * Module:   guide-business-story
 * Purpose:  /about/for-businesses/guides/business-story — Guide 1 of 3
 *           linked from the MEH-539 Day-2 onboarding email. Content
 *           approved 16-May-2026 (Drive folder
 *           19yWq0iuNgxr59JHRGUV5KPGTh0LpMzKE — guide-01-business-story.md).
 * Touches:  none.
 * Does NOT: render layout — that lives in GuideArticle.
 * Related:  backend/app/services/onboarding_followup.py:78 (Email 2's
 *           link target).
 * History:  MEH-539 (creation, 2026-05-16) — Phase 2D of MEH-615.
 *           MEH-475 PR-C4b/chunk-5 (i18n, 2026-05-20) — BLOCKS wired to
 *           `guides.business_story.*` namespace; HE verbatim from source.
 */
import { getTranslations, setRequestLocale } from "next-intl/server";
import GuideArticle from "@/components/GuideArticle";
import { BRAND_NAME } from "@/lib/constants";
import { buildAlternates, OG_LOCALE } from "@/lib/i18n-seo";

// MEH-476 PR 3b2: per-page hreflang via buildAlternates; og:locale per locale.
export async function generateMetadata({ params }) {
  const { locale } = await params;
  const t = await getTranslations("guides.business_story");
  const title = `${t("title")} | ${BRAND_NAME}`;
  const description = t("preview");
  return {
    // title.absolute prevents layout's `%s | ${BRAND_NAME}` template appending.
    title: { absolute: title },
    description,
    openGraph: {
      title,
      description,
      type: "article",
      siteName: BRAND_NAME,
      locale: OG_LOCALE[locale],
    },
    alternates: buildAlternates("/about/for-businesses/guides/business-story", locale),
  };
}

const BLOCKS_STRUCTURE = [
  { type: "p", key: "b0" },
  { type: "p", key: "b1" },
  { type: "p", key: "b2" },
  { type: "hr" },
  { type: "h3", key: "b4" },
  { type: "p", key: "b5" },
  { type: "p", key: "b6" },
  { type: "p", key: "b7" },
  { type: "hr" },
  { type: "h3", key: "b9" },
  { type: "p", key: "b10" },
  { type: "p", key: "b11" },
  { type: "p", key: "b12" },
  { type: "ul", key: "b13", count: 3 },
  { type: "p", key: "b14" },
  { type: "p", key: "b15" },
  { type: "p", key: "b16" },
  { type: "p", key: "b17" },
  { type: "ul", key: "b18", count: 3 },
  { type: "p", key: "b19" },
  { type: "p", key: "b20" },
  { type: "p", key: "b21" },
  { type: "p", key: "b22" },
  { type: "p", key: "b23" },
  { type: "hr" },
  { type: "h3", key: "b25" },
  { type: "callout", key: "b26" },
  { type: "p", key: "b27" },
  { type: "blockquote", key: "b28" },
  { type: "p", key: "b29" },
  { type: "ul", key: "b30", count: 4 },
  { type: "p", key: "b31" },
  { type: "blockquote", key: "b32" },
  { type: "p", key: "b33" },
  { type: "ul", key: "b34", count: 5 },
  { type: "hr" },
  { type: "h3", key: "b36" },
  { type: "p", key: "b37" },
  { type: "p", key: "b38" },
  { type: "p", key: "b39" },
  { type: "p", key: "b40" },
  { type: "p", key: "b41" },
  { type: "p", key: "b42" },
  { type: "p", key: "b43" },
  { type: "p", key: "b44" },
  { type: "p", key: "b45" },
  { type: "p", key: "b46" },
  { type: "hr" },
  { type: "h3", key: "b48" },
  { type: "ul", key: "b49", count: 5 },
  { type: "hr" },
  { type: "h3", key: "b51" },
  { type: "p", key: "b52" },
  { type: "p", key: "b53" },
];

function buildBlocks(t) {
  return BLOCKS_STRUCTURE.map((b) => {
    if (b.type === "hr") return b;
    if (b.count !== undefined) {
      return {
        type: b.type,
        items: Array.from({ length: b.count }, (_, i) => t(`body.${b.key}.i${i}`)),
      };
    }
    return { type: b.type, text: t(`body.${b.key}`) };
  });
}

// MEH-476 PR 3b2: async + setRequestLocale + getTranslations enables ● SSG.
export default async function BusinessStoryGuidePage({ params }) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations({ locale, namespace: "guides.business_story" });
  return (
    <GuideArticle
      title={t("title")}
      subtitle={t("subtitle")}
      readMinutes={4}
      blocks={buildBlocks(t)}
    />
  );
}
