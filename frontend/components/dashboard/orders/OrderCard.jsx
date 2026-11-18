// @ts-check
"use client";

/**
 * Module:   OrderCard
 * Purpose:  One on-site order as the business sees it: who, what, when, how
 *           much, and the actions its status allows.
 * Touches:  nothing directly — the actions go through OrderActions.
 * Does NOT: decide which moves are legal (the server's state machine does;
 *           a refused move comes back as a Hebrew 409 and is shown inline).
 * Related:  lib/product-orders.js (formatting), OrderActions.jsx
 * History:  MEH-3316 (creation; stage 4 of MEH-3216)
 */

import { useLocale, useTranslations } from "next-intl";
import { Phone } from "@phosphor-icons/react";

import Badge from "@/components/ui/Badge";
import { dayLabel, hhmm, localPhone, rangeEnds, shekelsText, toPayAgorot } from "@/lib/product-orders";
import OrderActions from "./OrderActions";

/** @param {{ order: any }} props */
function OrderLines({ order }) {
  const t = useTranslations("dashboard.producer.orders.card");
  return (
    <ul className="text-sm text-text space-y-0.5" data-testid="order-lines">
      {order.items.map((line, index) => (
        <li key={`${line.name}-${index}`}>{t("line", { qty: line.qty, name: line.name })}</li>
      ))}
    </ul>
  );
}

/** @param {{ order: any }} props */
function OrderFacts({ order }) {
  const t = useTranslations("dashboard.producer.orders.card");
  const fee = order.delivery_fee_agorot ?? 0;
  return (
    <div className="text-sm text-fg-muted space-y-1">
      <p className="font-medium text-text" data-testid="order-total">
        {t("total", { total: shekelsText(toPayAgorot(order)) })}
      </p>
      {fee > 0 && <p>{t("delivery_fee", { fee: shekelsText(fee) })}</p>}
      {order.has_estimate && (order.final_total_agorot ?? null) === null && <p>{t("estimate")}</p>}
      {order.delivery_address && <p>{t("address", { address: order.delivery_address })}</p>}
      {order.note && <p>{t("note", { note: order.note })}</p>}
      {order.age_declared && <p>{t("age")}</p>}
    </div>
  );
}

/** @param {{ order: any }} props */
function OrderHead({ order }) {
  const t = useTranslations("dashboard.producer.orders");
  const tWindows = useTranslations("dashboard.producer.orders.windows");
  const locale = useLocale();
  return (
    <div className="flex flex-wrap items-start justify-between gap-2">
      <div className="min-w-0">
        <p className="font-bold text-text">{order.customer_name}</p>
        <p className="text-sm text-fg-muted" data-testid="order-slot">
          {t("card.slot", {
            kind: tWindows(order.fulfilment),
            day: dayLabel(order.slot_start, locale),
            ...rangeEnds(order.slot_start, order.slot_end),
          })}
        </p>
      </div>
      <span data-testid="order-status">
        <Badge>{t(`status.${order.status}`)}</Badge>
      </span>
    </div>
  );
}

/** @param {{ order: any, onChanged: (order: any) => void }} props */
export default function OrderCard({ order, onChanged }) {
  const t = useTranslations("dashboard.producer.orders.card");
  const locale = useLocale();
  return (
    <li
      className="rounded-lg border border-border bg-surface p-4 space-y-3"
      data-testid="order-card"
      data-status={order.status}
    >
      <OrderHead order={order} />
      <OrderLines order={order} />
      <OrderFacts order={order} />
      <a
        href={`tel:+${order.customer_phone}`}
        dir="ltr"
        className="inline-flex items-center gap-1.5 min-h-touch text-sm font-medium text-primary focus-ring rounded-sm"
        aria-label={t("phone")}
      >
        <Phone size={16} aria-hidden="true" />
        {localPhone(order.customer_phone)}
      </a>
      {order.status === "change_proposed" && (
        <p className="text-sm text-fg-muted">{t("proposal_sent")}</p>
      )}
      {order.status === "pending" && order.expires_at && (
        <p className="text-sm text-fg-muted">
          {t("expires", { when: `${dayLabel(order.expires_at, locale)} ${hhmm(order.expires_at)}` })}
        </p>
      )}
      <OrderActions order={order} onChanged={onChanged} />
    </li>
  );
}
