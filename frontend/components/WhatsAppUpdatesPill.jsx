"use client";

import { ArrowUpLeft, WhatsappLogo } from "@phosphor-icons/react";
import { useTranslations } from "next-intl";
import { trackContactClick } from "@/lib/contact-tracking";

/**
 * Module:   WhatsAppUpdatesPill
 * Purpose:  "עדכונים מבית העסק בוואטסאפ" — the business's WhatsApp updates
 *           link (group or channel, `producer.whatsapp_group`) as a quiet pill
 *           in the delivery section: inside a POSITIVE DeliveryChecker answer,
 *           or under the nationwide badge when no checker renders.
 * Touches:  contact-tracking — one contact-click beacon, method
 *           "whatsapp_group" (opens the first-review gate server-side,
 *           reviews.py MEH-2204).
 * Does NOT: decide WHERE it shows — DeliveryChecker / DeliveryBlock own that.
 *           Not a WhatsApp CTA: it opens a group/channel, not a chat with the
 *           business, so it fires neither pingWhatsAppBeacon nor the local
 *           review unlock (MEH-1426 invariant: those are WA-CTA-only).
 * Related:  components/MiniMap.jsx:618 (nav-pill anatomy copied);
 *           app/[locale]/producer/[id]/components/ContactCard.jsx (the bell —
 *           the other home of the same link).
 * History:  MEH-2626 (creation).
 */

// REUSES: frontend/components/MiniMap.jsx:618 — the Waze/Google nav pill,
// class for class, except `flex-1 flex` → `inline-flex`: those two pills share
// a row, this one stands alone and must hug its label rather than stretch.
const PILL =
  "inline-flex items-center justify-center gap-2 border border-border bg-surface text-text px-4 py-2 min-h-touch rounded-full text-sm font-medium hover:bg-green-50 transition focus-visible:ring-2 focus-visible:ring-primary/40";

/** Trimmed link, or null when the business has none. */
export function whatsappUpdatesHref(producer) {
  const v = producer?.whatsapp_group?.trim();
  return v || null;
}

export default function WhatsAppUpdatesPill({ producer, className = "" }) {
  const t = useTranslations("producer.detail.whatsapp_updates");
  const href = whatsappUpdatesHref(producer);
  if (!href) return null;
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      data-testid="whatsapp-updates-pill"
      onClick={() => trackContactClick(producer.id, "whatsapp_group")}
      className={`${PILL} ${className}`}
    >
      {/* The logo is the only green thing on the pill; the text stays text. */}
      <WhatsappLogo size={18} weight="fill" className="text-whatsapp shrink-0" aria-hidden="true" />
      {t("full")}
      <ArrowUpLeft size={16} className="text-fg-muted shrink-0" aria-hidden="true" />
    </a>
  );
}
