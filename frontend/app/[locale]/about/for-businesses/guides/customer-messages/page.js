/**
 * Module:   guide-customer-messages
 * Purpose:  /about/for-businesses/guides/customer-messages — Guide 3 of 3
 *           linked from the MEH-539 Day-10 onboarding email. Content
 *           approved 16-May-2026 (Drive folder
 *           19yWq0iuNgxr59JHRGUV5KPGTh0LpMzKE — guide-03-customer-messages.md).
 * Touches:  none.
 * Does NOT: render layout — that lives in GuideArticle.
 * Related:  backend/app/services/onboarding_followup.py:157 (Email 4's
 *           link target).
 * History:  MEH-539 (creation, 2026-05-16) — Phase 2D of MEH-615.
 *           MEH-475 PR-C4b/chunk-5 (i18n, 2026-05-20) — BLOCKS wired to
 *           `guides.customer_messages.*` namespace; HE verbatim from source.
 */
import { getTranslations } from "next-intl/server";
import { useTranslations } from "next-intl";
import GuideArticle from "@/components/GuideArticle";
import { BRAND_NAME } from "@/lib/constants";

export async function generateMetadata() {
  const t = await getTranslations("guides.customer_messages");
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
      canonical: "/about/for-businesses/guides/customer-messages",
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
  { type: "p", key: "b7" },
  { type: "hr" },
  { type: "h3", key: "b9" },
  { type: "p", key: "b10" },
  { type: "p", key: "b11" },
  { type: "p", key: "b12" },
  { type: "ul", key: "b13", count: 3 },
  { type: "p", key: "b14" },
  { type: "hr" },
  { type: "p", key: "b16" },
  { type: "p", key: "b17" },
  { type: "blockquote", key: "b18" },
  { type: "p", key: "b19" },
  { type: "p", key: "b20" },
  { type: "blockquote", key: "b21" },
  { type: "p", key: "b22" },
  { type: "hr" },
  { type: "p", key: "b24" },
  { type: "p", key: "b25" },
  { type: "p", key: "b26" },
  { type: "p", key: "b27" },
  { type: "p", key: "b28" },
  { type: "p", key: "b29" },
  { type: "p", key: "b30" },
  { type: "ul", key: "b31", count: 3 },
  { type: "hr" },
  { type: "p", key: "b33" },
  { type: "p", key: "b34" },
  { type: "p", key: "b35" },
  { type: "p", key: "b36" },
  { type: "p", key: "b37" },
  { type: "p", key: "b38" },
  { type: "ol", key: "b39", count: 3 },
  { type: "p", key: "b40" },
  { type: "hr" },
  { type: "p", key: "b42" },
  { type: "p", key: "b43" },
  { type: "p", key: "b44" },
  { type: "p", key: "b45" },
  { type: "p", key: "b46" },
  { type: "ul", key: "b47", count: 2 },
  { type: "p", key: "b48" },
  { type: "hr" },
  { type: "h3", key: "b50" },
  { type: "p", key: "b51" },
  { type: "p", key: "b52" },
  { type: "blockquote", key: "b53" },
  { type: "p", key: "b54" },
  { type: "blockquote", key: "b55" },
  { type: "p", key: "b56" },
  { type: "blockquote", key: "b57" },
  { type: "p", key: "b58" },
  { type: "blockquote", key: "b59" },
  { type: "p", key: "b60" },
  { type: "blockquote", key: "b61" },
  { type: "hr" },
  { type: "h3", key: "b63" },
  { type: "ul", key: "b64", count: 5 },
  { type: "hr" },
  { type: "h3", key: "b66" },
  { type: "p", key: "b67" },
  { type: "p", key: "b68" },
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

export default function CustomerMessagesGuidePage() {
  const t = useTranslations("guides.customer_messages");
  return (
    <GuideArticle
      title={t("title")}
      subtitle={t("subtitle")}
      readMinutes={6}
      blocks={buildBlocks(t)}
    />
  );
}
