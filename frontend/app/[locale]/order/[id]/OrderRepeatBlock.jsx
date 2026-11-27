// @ts-check
"use client";

/**
 * Module:   OrderRepeatBlock
 * Purpose:  On the buyer's status page, for an order of a weekly repeat
 *           (MEH-3933): the day and time it repeats on, and the stop button.
 *           Once stopped, it says so.
 * Touches:  POST /product-orders/status/repeat/stop via lib/order-repeat.js.
 * Does NOT: cancel this order: stopping the repeat leaves every order already
 *           sent, this one included, as it is.
 * Related:  app/[locale]/order/[id]/OrderStatusClient.jsx, components/OrderRepeatStop.jsx
 * History:  MEH-3933 (creation, 27/11/2026)
 */

import { useTranslations } from "next-intl";

import OrderRepeatStop from "@/components/OrderRepeatStop";
import { repeatWhen, stopRepeatAsBuyer } from "@/lib/order-repeat";

/** @param {{ order: any, onChange: (order: any) => void, refOf: () => object }} props */
export default function OrderRepeatBlock({ order, onChange, refOf }) {
  const t = useTranslations("order_repeat");
  const tDays = useTranslations("product_weekdays");
  if (!order.repeat) return null;
  if (order.repeat === "stopped") {
    return <p className="text-sm text-fg-muted" data-testid="order-repeat-stopped">{t("status_stopped")}</p>;
  }
  return (
    <div className="rounded-lg border border-border bg-surface p-4 space-y-3" data-testid="order-repeat">
      <p className="text-sm text-text">{t("status_active", repeatWhen(order.slot_start, tDays("days_long")))}</p>
      <OrderRepeatStop onStop={() => stopRepeatAsBuyer(refOf())} onDone={onChange} />
    </div>
  );
}
