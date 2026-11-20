// @ts-check
/**
 * Module:   business-chat-handoff
 * Purpose:  The «ask the business» link under an answer in the business-page
 *           chat (MEH-3513). Yelp and Shopify both hand a question the
 *           assistant cannot settle to the business itself.
 *           WhatsApp → the visitor's question written in, with the same
 *           greeting and «הגעתי דרך מהמקור» line as the page's question chips
 *           (components/WhatsAppQuestionChips.jsx). Any other channel → the
 *           contact button's own href. No channel → null (no button).
 * Does NOT: track the click (the caller fires trackPrimaryCtaClick, the
 *           contact button's own tracking), or render anything.
 * Related:  lib/contact-method.js getResolvedMethod / getPrimaryContactHref.
 * History:  MEH-3513 (creation)
 */

import { getResolvedMethod, getPrimaryContactHref, isPrimaryExternal } from "@/lib/contact-method";
import { getWhatsAppHref, normalizePhone, withReferralParams } from "@/lib/utils";

/**
 * `external` = opens in a new tab, by the contact button's own rule
 * (isPrimaryExternal: website / social / external order, not wa.me, tel or
 * mailto). `isWebsite` = the referral UTM is on the href and the link keeps
 * the referrer (MEH-1525, as PrimaryContactButton.jsx).
 * @typedef {{ method: string, external: boolean, isWebsite: boolean, href: (question?: string) => string | null }} BusinessHandoff
 */

/**
 * @param {any} producer
 * @param {{ greeting: (q: string) => string, sourceLine: string }} copy
 *   greeting(q) = «שלום {name}, {q}». The link only shows under an answer, so
 *   a question always exists; with none, only the source line is written in
 *   (the contact_cta labels belong to the contact button, MEH-3459 guard).
 * @returns {BusinessHandoff | null}
 */
export function businessChatHandoff(producer, copy) {
  const method = getResolvedMethod(producer);
  if (!method) return null;
  if (method === "whatsapp") {
    const digits = normalizePhone(producer.phone);
    if (!digits) return null;
    return {
      method,
      external: false,
      isWebsite: false,
      href: (question) => {
        const q = (question || "").trim();
        const text = q ? `${copy.greeting(q).trim()}\n\n${copy.sourceLine}` : copy.sourceLine;
        return getWhatsAppHref(digits, text);
      },
    };
  }
  const raw = getPrimaryContactHref(producer);
  if (!raw) return null;
  const isWebsite = method === "website";
  // MEH-3513: same referral tagging as the contact button (MEH-1525).
  const href = isWebsite ? withReferralParams(raw) : raw;
  return { method, external: isPrimaryExternal(producer), isWebsite, href: () => href };
}
