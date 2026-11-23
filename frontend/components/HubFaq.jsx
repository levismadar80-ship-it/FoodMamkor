// @ts-check
/**
 * Module:   HubFaq
 * Purpose:  A short «שאלות נפוצות» block at the bottom of a hub list
 *           (/group-buys, /rescue): closed <details> rows and the matching
 *           FAQPage JSON-LD, both built from the same message keys.
 * Touches:  nothing — a server component that reads messages.
 * Does NOT: own the business FAQ on /about/for-businesses (its own page code,
 *           with categories and pricing values); edit questions from the admin.
 * Related:  frontend/app/[locale]/about/for-businesses/page.js (the same
 *           <details> + JSON-LD pattern) · lib/seo.js serializeJsonLd
 * History:  MEH-3737 (creation, Sapir 23/11: «שאלות ותשובות לסלי הפתעה…
 *           וגם לקבוצות רכישה»).
 */
import { getTranslations } from "next-intl/server";
import { CaretDown } from "@phosphor-icons/react/ssr";
import SectionHeading from "@/components/ui/SectionHeading";
import { SITE_URL, serializeJsonLd } from "@/lib/seo";

/**
 * @param {{ namespace: string, keys: string[], anchor: string, path: string }} props
 *   namespace: messages root holding `items.<key>.q|a`. The heading is the
 *   shared «שאלות נפוצות» (diet_pages.faq_heading), not a copy of it.
 */
export default async function HubFaq({ namespace, keys, anchor, path }) {
  const t = await getTranslations(namespace);
  const tHeading = await getTranslations("diet_pages");
  const items = keys.map((k) => ({ key: k, q: t(`items.${k}.q`), a: t(`items.${k}.a`) }));
  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    "@id": `${SITE_URL}${path}#${anchor}`,
    mainEntity: items.map((i) => ({ "@type": "Question", name: i.q, acceptedAnswer: { "@type": "Answer", text: i.a } })),
  };
  return (
    <section id={anchor} aria-labelledby={`${anchor}-title`} className="max-w-5xl mx-auto px-4 pb-16" data-testid="hub-faq">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: serializeJsonLd(jsonLd) }} />
      <SectionHeading id={`${anchor}-title`} size="content" className="mb-3">
        {tHeading("faq_heading")}
      </SectionHeading>
      <div className="space-y-2">
        {items.map((i) => (
          <details key={i.key} className="group rounded-lg border border-border bg-surface">
            <summary className="cursor-pointer list-none flex items-start justify-between gap-4 px-4 py-3 font-semibold text-text focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary rounded-lg">
              <span>{i.q}</span>
              <CaretDown aria-hidden="true" size={18} weight="bold" className="shrink-0 mt-1 transition-transform group-open:rotate-180 text-primary" />
            </summary>
            <p className="px-4 pb-4 pt-1 text-base leading-relaxed text-text/90">{i.a}</p>
          </details>
        ))}
      </div>
    </section>
  );
}
