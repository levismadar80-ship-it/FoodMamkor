// @ts-check
"use client";

/**
 * Module:   OrdersBoard
 * Purpose:  The four order lists of the «הזמנות» tab — מחכות לטיפול /
 *           מאושרות / היום / הסתיימו — with a count on each tab, and the
 *           empty states: no order ever (approved copy) and an empty list.
 * Touches:  nothing — the page loads the orders; a changed order comes back
 *           through onChanged and moves list by itself (grouping is derived).
 * Related:  lib/product-orders.js (groupOrders), OrderCard.jsx
 * History:  MEH-3316 (creation; stage 4 of MEH-3216)
 */

import { useState } from "react";
import { useTranslations } from "next-intl";
import { Basket } from "@phosphor-icons/react";

import EmptyState from "@/components/ui/EmptyState";
import { LIST_KEYS, groupOrders } from "@/lib/product-orders";
import OrderCard from "./OrderCard";

const Empty = /** @type {any} */ (EmptyState);

/** @param {{ lists: Record<string, any[]>, current: string, onPick: (key: string) => void }} props */
function ListTabs({ lists, current, onPick }) {
  const t = useTranslations("dashboard.producer.orders.tabs");
  return (
    <div role="tablist" aria-label={t("aria")} className="flex gap-1 overflow-x-auto border-b border-border">
      {LIST_KEYS.map((key) => (
        <button
          key={key}
          type="button"
          role="tab"
          aria-selected={current === key}
          data-testid={`orders-tab-${key}`}
          onClick={() => onPick(key)}
          className={`shrink-0 min-h-touch px-3 text-sm font-medium border-b-2 focus-ring ${
            current === key ? "border-primary text-primary" : "border-transparent text-fg-muted"
          }`}
        >
          {`${t(key)} (${lists[key].length})`}
        </button>
      ))}
    </div>
  );
}

/** @param {{ orders: any[], onChanged: (order: any) => void }} props */
export default function OrdersBoard({ orders, onChanged }) {
  const t = useTranslations("dashboard.producer.orders");
  const lists = groupOrders(orders);
  const [current, setCurrent] = useState(lists.waiting.length || !lists.confirmed.length ? "waiting" : "confirmed");

  if (orders.length === 0) {
    return <Empty icon={Basket} circle title={t("title")} description={t("empty")} />;
  }
  const shown = lists[current];
  return (
    <section className="space-y-3" data-testid="orders-board">
      <ListTabs lists={lists} current={current} onPick={setCurrent} />
      {shown.length === 0 ? (
        <p className="text-sm text-fg-muted py-6 text-center" data-testid="orders-empty-list">{t("empty_list")}</p>
      ) : (
        <ul className="space-y-3" role="tabpanel">
          {shown.map((order) => (
            <OrderCard key={order.id} order={order} onChanged={onChanged} />
          ))}
        </ul>
      )}
    </section>
  );
}
