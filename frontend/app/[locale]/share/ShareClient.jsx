"use client";

import { useTranslations } from "next-intl";
import ShareSiteActions from "@/components/ShareSiteActions";

/**
 * Module:   ShareClient
 * Purpose:  The «ספרו עלינו» section: heading, intro, and the shared site
 *           share actions. Since MEH-2827 PR 5 it lives on /recommend (under
 *           the form, and under the thank-you panel after a send) — one
 *           «help us grow» page instead of two. /share redirects there.
 * Does NOT: hold share logic (components/ShareSiteActions.jsx) or any
 *           donation/payment element (MEH-1159).
 * Related:  app/[locale]/recommend/RecommendClient.jsx (the only consumer) ·
 *           app/[locale]/share/route.js (the 308 to #share)
 * History:  MEH-1160 (creation, /share page body) · MEH-2827 PR 5 (became a
 *           section; actions extracted to ShareSiteActions)
 */
export default function ShareClient() {
  const t = useTranslations("share_page");
  return (
    <section
      id="share"
      aria-labelledby="share-heading"
      data-testid="recommend-share"
      className="mt-12 border-t border-border pt-8 scroll-mt-24"
    >
      <h2 id="share-heading" className="font-headline-md font-bold text-primary-dark text-2xl">
        {t("h1")}
      </h2>
      <p className="mt-2 text-base leading-relaxed text-fg-muted">{t("intro")}</p>
      <ShareSiteActions layout="full" className="mt-5" />
    </section>
  );
}
