// @ts-check
"use client";

/**
 * Module:   OrderRepeatControl
 * Purpose:  On the business's order card, for an order of a weekly repeat
 *           (MEH-3933): the day and time it repeats on, and the stop button.
 * Touches:  POST /producers/me/product-orders/{id}/repeat/stop via
 *           lib/order-repeat.js.
 * Does NOT: show the «הזמנה קבועה» badge (OrderCard's head does), or touch
 *           this order's own status.
 * Related:  components/dashboard/orders/OrderCard.jsx, components/OrderRepeatStop.jsx
 * History:  MEH-3933 (creation, 27/11/2026)
 */

import { useTranslations } from "next-intl";

import OrderRepeatStop from "@/components/OrderRepeatStop";
import { repeatWhen, stopRepeatAsBusiness } from "@/lib/order-repeat";

/** @param {{ order: any, onChanged: (order: any) => void }} props */
export default function OrderRepeatControl({ order, onChanged }) {
  const t = useTranslations("order_repeat");
  const tDays = useTranslations("product_weekdays");
  if (order.repeat !== "active") return null;
  return (
    <div className="space-y-2" data-testid="order-repeat-control">
      <p className="text-sm text-fg-muted">{t("business_line", repeatWhen(order.slot_start, tDays("days_long")))}</p>
      <OrderRepeatStop variant="ghost" onStop={() => stopRepeatAsBusiness(order.id)} onDone={onChanged} />
    </div>
  );
}
