/**
 * Module:   guide-product-photography
 * Purpose:  /about/for-businesses/guides/product-photography — Guide 2 of 3
 *           linked from the MEH-539 Day-5 onboarding email. Content
 *           approved 16-May-2026 (Drive folder
 *           19yWq0iuNgxr59JHRGUV5KPGTh0LpMzKE — guide-02-product-photography.md).
 * Touches:  none.
 * Does NOT: render layout — that lives in GuideArticle.
 * Related:  backend/app/services/onboarding_followup.py:117 (Email 3's
 *           link target).
 * History:  MEH-539 (creation, 2026-05-16) — Phase 2D of MEH-615.
 *           MEH-475 PR-C4b/chunk-5 (i18n, 2026-05-20) — BLOCKS wired to
 *           `guides.product_photography.*` namespace; HE verbatim from source.
 */
import { getTranslations } from "next-intl/server";
import { useTranslations } from "next-intl";
import GuideArticle from "@/components/GuideArticle";
import { BRAND_NAME } from "@/lib/constants";

export async function generateMetadata() {
  const t = await getTranslations("guides.product_photography");
  const title = `${t("title")} | ${BRAND_NAME}`;
  const description = t("preview");
  return {
    title,
    description,
    openGraph: {
      title,
      description,
      type: "article",
      siteName: BRAND_NAME,
      locale: "he_IL",
    },
    alternates: {
      canonical: "/about/for-businesses/guides/product-photography",
    },
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
  { type: "ol", key: "b7", count: 3 },
  { type: "p", key: "b8" },
  { type: "hr" },
  { type: "h3", key: "b10" },
  { type: "p", key: "b11" },
  { type: "p", key: "b12" },
  { type: "p", key: "b13" },
  { type: "ul", key: "b14", count: 3 },
  { type: "p", key: "b15" },
  { type: "hr" },
  { type: "p", key: "b17" },
  { type: "p", key: "b18" },
  { type: "p", key: "b19" },
  { type: "p", key: "b20" },
  { type: "ul", key: "b21", count: 3 },
  { type: "p", key: "b22" },
  { type: "ul", key: "b23", count: 4 },
  { type: "hr" },
  { type: "p", key: "b25" },
  { type: "p", key: "b26" },
  { type: "p", key: "b27" },
  { type: "ol", key: "b28", count: 3 },
  { type: "p", key: "b29" },
  { type: "p", key: "b30" },
  { type: "hr" },
  { type: "p", key: "b32" },
  { type: "p", key: "b33" },
  { type: "ul", key: "b34", count: 3 },
  { type: "p", key: "b35" },
  { type: "hr" },
  { type: "p", key: "b37" },
  { type: "p", key: "b38" },
  { type: "ul", key: "b39", count: 7 },
  { type: "p", key: "b40" },
  { type: "p", key: "b41" },
  { type: "hr" },
  { type: "h3", key: "b43" },
  { type: "p", key: "b44" },
  { type: "ol", key: "b45", count: 3 },
  { type: "hr" },
  { type: "h3", key: "b47" },
  { type: "p", key: "b48" },
  { type: "ul", key: "b49", count: 3 },
  { type: "p", key: "b50" },
  { type: "ul", key: "b51", count: 5 },
  { type: "p", key: "b52" },
  { type: "hr" },
  { type: "h3", key: "b54" },
  { type: "p", key: "b55" },
  { type: "ol", key: "b56", count: 4 },
  { type: "p", key: "b57" },
  { type: "hr" },
  { type: "h3", key: "b59" },
  { type: "p", key: "b60" },
  { type: "ol", key: "b61", count: 3 },
  { type: "hr" },
  { type: "h3", key: "b63" },
  { type: "p", key: "b64" },
  { type: "p", key: "b65" },
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

export default function ProductPhotographyGuidePage() {
  const t = useTranslations("guides.product_photography");
  return (
    <GuideArticle
      title={t("title")}
      subtitle={t("subtitle")}
      readMinutes={5}
      blocks={buildBlocks(t)}
    />
  );
}
