"use client";

import BadgeRow from "@/components/BadgeRow";
import { allBadges } from "@/lib/badges";

/**
 * Module:   ReservistBadgeLine
 * Purpose:  MEH-2693 — shows the «עסק של מילואימניקים» pill (with its
 *           tap-to-explain popover, «לפי הצהרת בית העסק…») on the business
 *           page. MEH-1334 took every attribute badge out of the header; this
 *           claim is about the OWNERS, so it sits in the «אודות» / owner area
 *           instead, which is where a reader looks for who runs the business.
 * Does NOT: decide who earns it (lib/badges.js is the single owner) or show
 *           any other badge — every other earned key is passed as hideKeys, so
 *           the row is this one pill or nothing (BadgeRow returns null).
 * Related:  ProducerSections.jsx (both mount points), ReservistOwnedCard.jsx.
 */
export default function ReservistBadgeLine({ producer, className = "" }) {
  const hideKeys = allBadges(producer)
    .map((b) => b.key)
    .filter((k) => k !== "reservist_owned");
  if (producer?.reservist_owned !== true) return null;
  return (
    <div className={className} data-testid="reservist-badge-line">
      <BadgeRow producer={producer} hideKeys={hideKeys} />
    </div>
  );
}
