"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { X } from "@phosphor-icons/react";
import Link from "next/link";

/**
 * Module:   DeliveryContextBanner
 * Purpose:  MEH-2046 PR-6 — the day-bridge context banner. Renders only in
 *           the Option C REFINED state (משלוח chip on AND a city is set),
 *           reminds the reader that a /map pin marks the business's OWN
 *           location and not its delivery area, then bridges to /producers
 *           (the day-filter surface, MEH-1825/MEH-2036) with the same city
 *           already applied.
 * Does NOT: change the active filter — dismiss is local component state
 *           only, the businesses shown on /map never move because of this
 *           banner. Does NOT render day pills or dim/gray any pin — MEH-2046
 *           decision 11 excludes both from this chain; changing that needs a
 *           separate, formal decision.
 * Related:  frontend/app/[locale]/map/components/FilterChipsBar.jsx (parent
 *           — joins the PR-2 explanation-line cluster, one chrome block, not
 *           a floating element); frontend/components/ProducersClient.jsx:106
 *           (the `city` URL param /producers hydrates from — MEH-1826
 *           documents that the backend's `delivery_city` and the URL's
 *           `city` are NOT the same name, verified before wiring this href).
 * History:  MEH-2046 PR-6.
 */
export default function DeliveryContextBanner({ city }) {
  const t = useTranslations();
  const [dismissed, setDismissed] = useState(false);

  if (dismissed) return null;

  return (
    <div
      dir="rtl"
      role="status"
      data-testid="delivery-context-banner"
      className="mt-2 rounded-md border border-border bg-background-alt px-3 py-2"
    >
      <div className="flex items-start justify-between gap-2">
        <p className="text-[11px] text-fg-muted">
          {t("map.filter.delivery_context_banner", { city })}
        </p>
        {/* rtl-ok: geometry comes from DOM order in a dir="rtl" flex row —
            the second child lands at the inline-end (visual left), the same
            outcome the MEH-2038 end-* rule produces for absolutely
            positioned close buttons; no physical class involved. */}
        <button
          type="button"
          onClick={() => setDismissed(true)}
          aria-label={t("map.filter.banner_dismiss_aria")}
          className="shrink-0 w-11 h-11 -my-2.5 -me-1 rounded-full hover:bg-primary/10 flex items-center justify-center transition"
        >
          <X size={14} weight="bold" aria-hidden="true" />
        </button>
      </div>
      <Link
        href={`/producers?city=${encodeURIComponent(city)}`}
        className="mt-1 inline-block text-[11px] text-primary underline underline-offset-2 hover:opacity-80 transition"
      >
        {t("map.filter.day_bridge_cta")}
      </Link>
    </div>
  );
}
