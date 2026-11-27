// @ts-check
"use client";
/**
 * Module:   HubFaqLink
 * Purpose:  One short link to a hub's «שאלות נפוצות» (HubFaq). The questions
 *           sit under the list, and the list has no pages, so with many group
 *           buys or bags nobody scrolls down to them. The link sits above the
 *           list (variant "list") and on the offer
 *           page (variant "detail"), where the questions
 *           come up.
 * Does NOT: render the questions (HubFaq does), or move them.
 * Related:  components/HubFaq.jsx · lib/hub-faq.js (paths and the anchor)
 * History:  MEH-3949 (creation, Sapir 27/11 «שני קישורים», for group buys
 *           and for bags).
 *
 * @param {{ hub: "groupBuys" | "rescue", variant: "list" | "detail", className?: string }} props
 */
import { useTranslations } from "next-intl";
import Link from "@/components/ui/Link";
import { HUB_FAQ, HUB_FAQ_ANCHOR } from "@/lib/hub-faq";

export default function HubFaqLink({ hub, variant, className = "" }) {
  const tLink = useTranslations("hub_faq");
  const { path } = hub === "rescue" ? HUB_FAQ.rescue : HUB_FAQ.groupBuys;
  // One href for both: on the hub page itself Next scrolls to the hash with
  // no fetch, and from an offer page it opens the hub at the questions.
  const detailKey = hub === "rescue" ? "detail_rescue" : "detail_groupBuys";
  // Own key, not diet_pages.faq_heading: that namespace is server-only and
  // never reaches the client (lib/client-messages.js).
  const label = tLink(variant === "list" ? "list_link" : detailKey);
  const link = (
    <Link href={`${path}#${HUB_FAQ_ANCHOR}`} className="font-semibold" data-testid={`hub-faq-link-${variant}`}>
      {label}
    </Link>
  );
  if (variant === "list") return link;
  return <p className={`text-base ${className}`}>{link}</p>;
}
