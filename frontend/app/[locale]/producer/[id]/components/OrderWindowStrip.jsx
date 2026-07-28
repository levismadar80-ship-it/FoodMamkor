"use client";

/**
 * Module:   OrderWindowStrip
 * Purpose:  The order-window context line that sits directly UNDER the primary
 *           CTA, inside ContactCard, while orders are closed.
 * Does NOT: render any status colour or any open/closed verdict — the page's
 *           single status lives in ProducerHeader.jsx and only there
 *           (MEH-1334 / MEH-1546). It also never touches the CTA itself: the
 *           note is a sibling, the button's styling and behaviour are
 *           untouched and it is NEVER disabled.
 *           It also no longer renders a weekly schedule — see History/MEH-1691.
 * Related:  frontend/lib/orderWindow.js (getOrderWindowStatus — read-only here),
 *           components/ProducerHeader.jsx (the status branch this complements).
 * History:  MEH-1546 — chunk 3/3 of the order-window feature.
 *           MEH-1691 — the default-export weekly strip was deleted. It restated
 *           the order window a second time, as an unheaded, uncontained line
 *           floating between the reviews block and "אודות". The window is now
 *           said exactly once, as ProducerHeader's derived meta-line status
 *           (MEH-1305 A: "the day is said exactly once"). The filename is kept
 *           because ContactCard imports OrderWindowCtaNote from this path.
 *           DO NOT re-add a weekly-schedule render here — relocating the
 *           schedule to a proper Info block is a separate, unmade decision.
 */

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";

import { getOrderWindowStatus } from "@/lib/orderWindow";

/**
 * The one context line under the primary CTA while orders are closed: it tells
 * the visitor the message will WAIT for the business until orders reopen.
 * Wolt's pre-order pattern adapted to an asynchronous channel — never block
 * the send, just set the expectation.
 *
 * MEH-1649: it describes what the message does, not what the business will do.
 * The earlier "היא תיענה" promised a reply on the business's behalf, which the
 * platform cannot guarantee (same principle as the dashboard copy-honesty
 * fixes). Mounted by ContactCard, once, directly below the CTA — NOT by
 * ContactSidebar or ProducerDetail, where it used to float outside the card.
 *
 * Time-derived, so it is mounted-guarded exactly like the header status:
 * renders nothing on the server pass, which also keeps a null-window producer
 * byte-identical (zero layout shift).
 */
export function OrderWindowCtaNote({ orderWindow }) {
  const t = useTranslations();
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  if (!mounted) return null;
  const status = getOrderWindowStatus(orderWindow);
  if (status?.state !== "closed") return null;

  return (
    <p className="mt-2 text-xs text-muted" data-testid="order-window-cta-note">
      {t("producer.detail.order_window.cta_note")}
    </p>
  );
}
