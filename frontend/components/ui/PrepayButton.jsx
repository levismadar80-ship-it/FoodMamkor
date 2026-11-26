// @ts-check
"use client";

/**
 * Module:   PrepayButton
 * Purpose:  «לתשלום» — opens the business's own prepay link (Bit / PayBox /
 *           its clearing) in a new tab, with the host printed under it so the
 *           buyer sees where she is sent. One look for a surprise bag and a
 *           group buy (MEH-3895, rule of two).
 * Does NOT: decide when a link is shown — the caller passes
 *           lib/payment-info.js prepayLink(info), null = render nothing. Does
 *           not take or check payment: the money goes straight to the business.
 * Related:  components/rescue/RescueConfirmation.jsx · group-buys/[id]/GroupBuyDetailClient.jsx ·
 *           backend/app/schemas/payment_link.py (https-only validation)
 * History:  MEH-3895 (creation)
 */

import { useTranslations } from "next-intl";
import { ArrowSquareOut } from "@phosphor-icons/react";

import { buttonLook } from "@/components/ui/Button";
import { linkHost } from "@/lib/payment-info";

/** @param {{ link: string | null, timing?: string | null, testId?: string }} props */
export default function PrepayButton({ link, timing = "advance", testId = "prepay" }) {
  const t = useTranslations("prepay");
  const host = link ? linkHost(link) : null;
  if (!link || !host) return null;
  return (
    <div className="flex flex-col items-center gap-1" data-testid={testId}>
      <p className="font-body-sm text-sm text-text" data-testid={`${testId}-ask`}>
        {t(timing === "deposit" ? "ask_deposit" : "ask_advance")}
      </p>
      <a
        href={link}
        target="_blank"
        // noopener + noreferrer: the business's page gets no handle on ours
        // and no referrer; nofollow: a paid link is not a recommendation.
        rel="noopener noreferrer nofollow"
        className={buttonLook("primary", "md")}
        data-testid={`${testId}-link`}
      >
        {t("cta")}
        <ArrowSquareOut size={18} aria-hidden="true" />
      </a>
      <p className="font-body-sm text-xs text-fg-muted" data-testid={`${testId}-via`}>
        {t("via", { host })}
      </p>
    </div>
  );
}
