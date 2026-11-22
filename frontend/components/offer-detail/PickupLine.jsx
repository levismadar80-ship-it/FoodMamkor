// @ts-check
/**
 * Module:   PickupLine
 * Purpose:  The pickup time as one line right under an offer's title (clock,
 *           bold label, the window): the first thing a buyer decides on, and
 *           on a phone the «where» section starts below the fold. One line
 *           for the group buy and the rescue bag (MEH-3610).
 * Does NOT: format the time — the page passes it ready (pickupWindowText,
 *           lib/group-buy-pickup.js; israelTime, lib/rescue.js).
 * Related:  app/[locale]/rescue/[offerId]/RescueOfferPage.jsx (the bag's line,
 *           MEH-3586, which this copies)
 * History:  MEH-3610 (creation)
 *
 * @param {{ label: string, text: string, testId?: string, className?: string }} props
 */
import { Clock } from "@phosphor-icons/react";

export default function PickupLine({ label, text, testId, className = "" }) {
  return (
    <p className={`flex items-start gap-1.5 text-base text-text ${className}`} data-testid={testId}>
      <Clock aria-hidden="true" size={18} className="text-primary shrink-0 mt-1" />
      <span className="min-w-0">
        <b className="font-semibold">{label} </b>
        <span className="numeric">{text}</span>
      </span>
    </p>
  );
}
