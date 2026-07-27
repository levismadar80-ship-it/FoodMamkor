"use client";

import { ChatCircle } from "@phosphor-icons/react";
import { useTranslations } from "next-intl";

import { normalizePhone, getWhatsAppHref } from "@/lib/utils";
import { pingWhatsAppBeacon } from "@/lib/contact-tracking";

/**
 * Module:   CoverageRequestCta
 * Purpose:  "לא מגיעים ל{עיר}?" — the one row that turns the delivery
 *           checker's negative verdict into a question instead of a dead end.
 *           Opens WhatsApp with the city pre-filled; the demand reaches the
 *           business and the decision stays with it (החישוק / Oddbox, Phase A).
 * Touches:  POST /api/producers/{id}/whatsapp-click via pingWhatsAppBeacon —
 *           the SAME existing counter every other WhatsApp CTA pings. No new
 *           endpoint, no schema change.
 * Does NOT: decide WHETHER the city is covered, and does not read the city
 *           from anywhere. Both are the caller's: this renders only when
 *           DeliveryChecker has already answered "no", and the city it shows
 *           is the city that verdict is about. Presentational by design — one
 *           owner for the coverage question (DeliveryChecker.jsx:42), so the
 *           CTA and the verdict above it can never disagree.
 * Related:  frontend/components/DeliveryChecker.jsx (sole mount point, inside
 *           the negative-verdict branch); frontend/lib/contact-tracking.js:51.
 * History:  MEH-1675 (creation).
 */

// MEH-1675 · PHASE-B: the click is counted, the CITY is not. `/whatsapp-click`
// takes no request body — producer_id is the path param and the endpoint reads
// nothing else (contact-tracking.js:51-58). Sending a city would mean a schema
// change, which this ticket forbids, so per-city demand is deferred to MEH-1677.

export default function CoverageRequestCta({ producer = null, city = "" }) {
  const t = useTranslations("group_buys.delivery");
  const tChips = useTranslations("whatsapp.question_chips");

  const digits = normalizePhone(producer?.phone);
  const value = (city || "").trim();
  // No WhatsApp channel, or no city to ask about → nothing to offer.
  if (!digits || !value) return null;

  // REUSES: frontend/components/WhatsAppQuestionChips.jsx:165-171 — prefill
  // body, blank line, then the LOCKED attribution marker on its own final
  // line, so the owner sees the referral source in her own inbox (MEH-1524).
  const href = getWhatsAppHref(
    digits,
    `${t("coverage_cta.prefill", { city: value })}\n\n${tChips("source_line")}`,
  );

  return (
    <p className="mt-2" data-testid="coverage-request-cta">
      <a
        href={href}
        target="_blank"
        rel="noopener noreferrer"
        onClick={() => pingWhatsAppBeacon(producer?.id)}
        data-testid="coverage-request-link"
        className="inline-flex items-center gap-2 min-h-[44px] text-sm text-primary transition hover:underline focus-visible:ring-2 focus-visible:ring-primary/40 rounded"
      >
        <ChatCircle size={16} weight="regular" className="flex-shrink-0" aria-hidden="true" />
        {t("coverage_cta.known_city", { city: value })}
      </a>
    </p>
  );
}
