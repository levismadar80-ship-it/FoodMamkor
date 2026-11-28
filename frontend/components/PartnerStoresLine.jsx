// @ts-check
"use client";

/**
 * Module:   PartnerStoresLine
 * Purpose:  On the business page, name the other stores that sell its
 *           products (MEH-3977): «המוצרים נמכרים גם דרך פארמרים, הענתיות ועלה
 *           הביתה». Under the delivery section when there is one; its own
 *           «איפה קונים» section when there is not.
 * Does NOT: link to the stores (names only — no URL is collected).
 * Related:  components/PartnerStoresField.jsx (the editor),
 *           lib/quick-answers.js hasPartnerStores (the gate).
 * History:  MEH-3977 (creation).
 */

import { useLocale, useTranslations } from "next-intl";
import { Storefront } from "@phosphor-icons/react";
import SectionHeading from "@/components/ui/SectionHeading";
import FactLine from "@/components/ui/FactLine";

/**
 * @param {{ producer: { partner_stores?: string[], has_physical_location?: boolean, offers_delivery?: boolean }, standalone?: boolean }} props
 */
export default function PartnerStoresLine({ producer, standalone = false }) {
  const t = useTranslations("partner_stores");
  const locale = useLocale();
  const stores = producer.partner_stores || [];
  if (stores.length === 0) return null;
  const list = new Intl.ListFormat(locale, { type: "conjunction" }).format(stores);
  const also = producer.has_physical_location !== false || !!producer.offers_delivery;
  const line = (
    <FactLine icon={Storefront} className="text-sm text-text" data-testid="partner-stores-line">
      {t(also ? "page_line_also" : "page_line", { stores: list })}
    </FactLine>
  );
  if (!standalone) return <div className="mt-4">{line}</div>;
  return (
    <section className="mt-12">
      <SectionHeading size="content" className="mb-4">
        {t("page_heading")}
      </SectionHeading>
      {line}
    </section>
  );
}
