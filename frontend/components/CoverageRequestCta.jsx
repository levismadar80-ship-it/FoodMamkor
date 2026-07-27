"use client";

import { useCallback, useState } from "react";
import { ChatCircle } from "@phosphor-icons/react";
import { useTranslations } from "next-intl";

import { normalizePhone, getWhatsAppHref } from "@/lib/utils";
import { pingWhatsAppBeacon } from "@/lib/contact-tracking";
import { useUserCity } from "@/lib/use-user-city";
import { matchDeliveryCity } from "@/components/DeliveryChecker";
import CityPickerModal from "@/app/[locale]/map/components/CityPickerModal";

/**
 * Module:   CoverageRequestCta
 * Purpose:  "לא מגיעים ל{עיר}?" — a visitor whose city is NOT in the business's
 *           delivery list gets a way to ask instead of a dead end. Opens
 *           WhatsApp with her city pre-filled; the demand reaches the business
 *           and the decision stays with it (החישוק / Oddbox pattern, Phase A).
 * Touches:  POST /api/producers/{id}/whatsapp-click via pingWhatsAppBeacon —
 *           the SAME existing counter every other WhatsApp CTA pings. No new
 *           endpoint, no schema change.
 * Does NOT: own the coverage question itself — `matchDeliveryCity` in
 *           DeliveryChecker.jsx:42 is the single matcher, reused verbatim so
 *           the CTA and the checker can never disagree about one city. Does not
 *           persist the picked city (the picker is a one-shot for the prefill),
 *           and does not report the city to the backend — see PHASE-B below.
 * Related:  frontend/components/DeliveryBlock.jsx (mount point, below the city
 *           list); frontend/components/DeliveryChecker.jsx:42,99 (matcher +
 *           the render gate this mirrors); frontend/lib/use-user-city.js:45
 *           (localStorage user_city, MEH-1485); frontend/lib/contact-tracking.js:51
 *           (beacon); frontend/app/[locale]/map/components/CityPickerModal.jsx:34
 *           (city picker, reused unmodified).
 * History:  MEH-1675 (creation).
 */

// MEH-1675 · PHASE-B: the click is counted, the CITY is not. `/whatsapp-click`
// takes no request body — producer_id is the path param and the endpoint reads
// nothing else (contact-tracking.js:51-58 documents the same). Sending a city
// would mean a schema change, which this ticket forbids outright, so the click
// lands count-only and per-city demand is deferred to the Phase B card.

// REUSES: frontend/components/WhatsAppQuestionChips.jsx:165-171 — prefill body,
// blank line, then the LOCKED attribution marker on its own final line, so the
// business owner sees the referral source in her own inbox (MEH-1524/1535).
function buildPrefill(t, tChips, city) {
  return `${t("coverage_cta.prefill", { city })}\n\n${tChips("source_line")}`;
}

export default function CoverageRequestCta({
  producer = null,
  nationwide = false,
  excluded = [],
  areas = [],
}) {
  const t = useTranslations("group_buys.delivery");
  const tChips = useTranslations("whatsapp.question_chips");
  const { city: userCity } = useUserCity();
  const [pickerOpen, setPickerOpen] = useState(false);

  const digits = normalizePhone(producer?.phone);

  // Open WhatsApp for a city the visitor just committed through the picker.
  // window.open (not an href) because the navigation happens one tick after the
  // chip click; it stays inside that user gesture, so no popup block.
  const openForCity = useCallback(
    (picked) => {
      setPickerOpen(false);
      const value = (picked || "").trim();
      if (!value || !digits) return;
      pingWhatsAppBeacon(producer?.id);
      window.open(
        getWhatsAppHref(digits, buildPrefill(t, tChips, value)),
        "_blank",
        "noopener,noreferrer",
      );
    },
    [digits, producer?.id, t, tChips],
  );

  // Gate 1 — no WhatsApp channel, nothing to ask through.
  if (!digits) return null;

  // Gate 2 — mirrors DeliveryChecker.jsx:98-100 verbatim in intent: the CTA only
  // exists where a city LIST exists to be absent from. Nationwide with no
  // exclusions covers everyone (nobody is "not reached"), and a producer with no
  // areas renders "משלוחים בתיאום מראש" instead of a list — asking "לא מגיעים
  // לאזור שלך?" under either would be a claim the section does not make.
  const hasExclusions = nationwide && excluded.length > 0;
  const hasList = hasExclusions || (!nationwide && areas.length > 0);
  if (!hasList) return null;

  // Gate 3 — the coverage answer itself, from the ONE matcher. Only a hard "no"
  // earns the CTA: a covered city (or a nationwide yes) must not see it.
  // No user_city → no verdict → the generic variant opens the picker first.
  const verdict = userCity
    ? matchDeliveryCity({ city: userCity, nationwide, excluded, areas })
    : null;
  if (verdict && verdict.status !== "no") return null;

  const knownCity = verdict?.status === "no" ? verdict.city : null;

  return (
    <>
      <p className="mb-4" data-testid="coverage-request-cta">
        {knownCity ? (
          <a
            href={getWhatsAppHref(digits, buildPrefill(t, tChips, knownCity))}
            target="_blank"
            rel="noopener noreferrer"
            onClick={() => pingWhatsAppBeacon(producer?.id)}
            data-testid="coverage-request-link"
            className="inline-flex items-center gap-2 min-h-[44px] text-sm text-primary transition hover:underline focus-visible:ring-2 focus-visible:ring-primary/40 rounded"
          >
            <ChatCircle size={16} weight="regular" className="flex-shrink-0" aria-hidden="true" />
            {t("coverage_cta.known_city", { city: knownCity })}
          </a>
        ) : (
          <button
            type="button"
            onClick={() => setPickerOpen(true)}
            data-testid="coverage-request-picker-trigger"
            className="inline-flex items-center gap-2 min-h-[44px] text-sm text-primary transition hover:underline focus-visible:ring-2 focus-visible:ring-primary/40 rounded"
          >
            <ChatCircle size={16} weight="regular" className="flex-shrink-0" aria-hidden="true" />
            {t("coverage_cta.no_city")}
          </button>
        )}
      </p>

      {/* Reused unmodified (props only): heading/chips/search all come from the
          picker's own keys. Selecting a chip or committing the search field
          returns a canonical city name — the MEH-1504 axis — which is what the
          prefill and the matcher above both compare on. */}
      <CityPickerModal
        open={pickerOpen}
        onClose={() => setPickerOpen(false)}
        onSelectCity={openForCity}
      />
    </>
  );
}
