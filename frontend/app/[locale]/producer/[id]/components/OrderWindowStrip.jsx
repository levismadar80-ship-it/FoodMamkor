"use client";

/**
 * Module:   OrderWindowStrip
 * Purpose:  Informational weekly order-acceptance hours on the public producer
 *           page (rendered as "accepting orders: Sun-Thu 9:00-14:00" in the
 *           active locale), plus the context line that sits directly UNDER
 *           the primary CTA, inside ContactCard, while orders are closed.
 * Does NOT: render any status colour or any open/closed verdict — the page's
 *           single status lives in ProducerHeader.jsx and only there
 *           (MEH-1334 / MEH-1546). It also never touches the CTA itself: the
 *           note is a sibling, the button's styling and behaviour are
 *           untouched and it is NEVER disabled.
 * Related:  frontend/lib/orderWindow.js (getOrderWindowRanges +
 *           getOrderWindowStatus — read-only here),
 *           components/ProducerHeader.jsx (the status branch this complements).
 * History:  MEH-1546 — chunk 3/3 of the order-window feature.
 */

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";

import { getOrderWindowRanges, getOrderWindowStatus } from "@/lib/orderWindow";

const DAY_KEYS = ["sun", "mon", "tue", "wed", "thu", "fri", "sat"];

/**
 * "09:00" → "9:00" — drops a leading zero so the strip reads like the mock.
 *
 * NOTE this deliberately differs from `israelTime` in lib/order-status.js,
 * which keeps the zero ("09:00") for the header status line. The strip is a
 * compact weekly summary where the padding is visual noise; the status line
 * states a single precise time. If you align one, align both — and re-capture
 * the qa-artifacts/MEH-1546 screenshots, which document the current pairing.
 */
function trimHour(hhmm) {
  return hhmm.replace(/^0/, "");
}

/**
 * Weekly hours strip. Consecutive days sharing hours are already merged by
 * getOrderWindowRanges; this only renders them. Purely informational — no
 * status colour, no "now" derivation, so it is SSR-safe and needs no guard.
 */
export default function OrderWindowStrip({ orderWindow }) {
  const t = useTranslations();
  const ranges = getOrderWindowRanges(orderWindow);
  if (ranges.length === 0) return null;

  return (
    <p className="mt-2 text-sm text-muted" data-testid="order-window-strip">
      <span>{t("producer.detail.order_window.strip_label")}</span>{" "}
      {ranges.map((r, i) => (
        <span key={`${r.fromDay}-${r.toDay}`}>
          {i > 0 && <span aria-hidden="true" className="opacity-60">{" · "}</span>}
          {/* Compact single-letter day labels, not the full weekday names the
              weekly table uses — the strip is a one-line summary. Own i18n
              namespace rather than reusing events.calendar.days. */}
          <span>
            {r.fromDay === r.toDay
              ? t(`producer.detail.order_window.days_short.${DAY_KEYS[r.fromDay]}`)
              : `${t(`producer.detail.order_window.days_short.${DAY_KEYS[r.fromDay]}`)}–${t(
                  `producer.detail.order_window.days_short.${DAY_KEYS[r.toDay]}`
                )}`}
          </span>{" "}
          {/* Time ranges are inherently LTR numeric. rtl-ok */}
          <span dir="ltr" className="numeric">
            {trimHour(r.open)}–{trimHour(r.close)}
          </span>
        </span>
      ))}
    </p>
  );
}

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
