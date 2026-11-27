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
 * History:  MEH-3316 (creation; stage 4 of MEH-3216); MEH-3216 gaps («מה
 *           להכין» above the «היום» list); daily stock (27/11: «מה להכין» moved
 *           above the board as a week, OrderPrepList.jsx); MEH-3962 (the
 *           «לא שולמו» filter, shown only while an order is owed for)
 */

import { useState } from "react";
import { useTranslations } from "next-intl";
import { Basket } from "@phosphor-icons/react";

import EmptyState from "@/components/ui/EmptyState";
import Button from "@/components/ui/Button";
import { LIST_KEYS, groupOrders } from "@/lib/product-orders";
import { owedOrders } from "@/lib/order-paid";  // MEH-3962
import OrderCard from "./OrderCard";

const Empty = /** @type {any} */ (EmptyState);
const PANEL_ID = "orders-panel";
const tabId = (/** @type {string} */ key) => `orders-tab-btn-${key}`;

/** @param {{ lists: Record<string, any[]>, current: string, onPick: (key: string) => void }} props */
function ListTabs({ lists, current, onPick }) {
  const t = useTranslations("dashboard.producer.orders.tabs");
  // Roving tabindex (WAI-ARIA tabs): arrows move between tabs. The page is
  // RTL, so ArrowLeft is the NEXT tab.
  const onKeyDown = (/** @type {React.KeyboardEvent<HTMLDivElement>} */ e) => {
    const at = LIST_KEYS.indexOf(/** @type {any} */ (current));
    const last = LIST_KEYS.length - 1;
    const moves = { ArrowLeft: at + 1, ArrowRight: at - 1, Home: 0, End: last };
    const to = /** @type {Record<string, number>} */ (moves)[e.key];
    if (to === undefined) return;
    e.preventDefault();
    const key = LIST_KEYS[(to + LIST_KEYS.length) % LIST_KEYS.length];
    onPick(key);
    document.getElementById(tabId(key))?.focus();
  };
  return (
    <div role="tablist" aria-label={t("aria")} onKeyDown={onKeyDown} className="flex gap-1 overflow-x-auto border-b border-border">
      {LIST_KEYS.map((key) => (
        <button
          key={key}
          id={tabId(key)}
          type="button"
          role="tab"
          aria-selected={current === key}
          aria-controls={PANEL_ID}
          tabIndex={current === key ? 0 : -1}
          data-testid={`orders-tab-${key}`}
          onClick={() => onPick(key)}
          className={`flex-1 min-w-0 min-h-touch px-1.5 text-sm leading-tight font-medium border-b-2 focus-ring ${
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
function OrderList({ orders, onChanged }) {
  return (
    <ul className="space-y-3">
      {orders.map((order) => (
        <OrderCard key={order.id} order={order} onChanged={onChanged} />
      ))}
    </ul>
  );
}

/** MEH-3962: «לא שולמו (N)» — on: only the orders still owed for. Hidden at 0.
 * @param {{ count: number, on: boolean, onToggle: () => void }} props */
function OwedFilter({ count, on, onToggle }) {
  const t = useTranslations("dashboard.producer.orders.paid");
  if (count === 0) return null;
  return (
    <Button variant={on ? "secondary" : "outlined"} size="sm" aria-pressed={on} onClick={onToggle} data-testid="orders-owed-filter">
      {on ? t("filter_off") : t("filter", { count })}
    </Button>
  );
}

/** @param {{ orders: any[], onChanged: (order: any) => void }} props */
export default function OrdersBoard({ orders, onChanged }) {
  const t = useTranslations("dashboard.producer.orders");
  const lists = groupOrders(orders);
  const owed = owedOrders(orders);
  const [current, setCurrent] = useState(lists.waiting.length || !lists.confirmed.length ? "waiting" : "confirmed");
  const [owedOnly, setOwedOnly] = useState(false);

  if (orders.length === 0) {
    return <Empty icon={Basket} circle title={t("title")} description={t("empty")} />;
  }
  // The last owed order marked paid ends the filter by itself.
  const filtering = owedOnly && owed.length > 0;
  const shown = lists[current];
  return (
    <section className="space-y-3" data-testid="orders-board">
      <OwedFilter count={owed.length} on={filtering} onToggle={() => setOwedOnly(!filtering)} />
      {filtering ? (
        <div data-testid="orders-owed-list">
          <OrderList orders={owed} onChanged={onChanged} />
        </div>
      ) : (
        <>
          <ListTabs lists={lists} current={current} onPick={setCurrent} />
          <div role="tabpanel" id={PANEL_ID} aria-labelledby={tabId(current)}>
            {shown.length === 0 ? (
              <p className="text-sm text-fg-muted py-6 text-center" data-testid="orders-empty-list">{t("empty_list")}</p>
            ) : (
              <OrderList orders={shown} onChanged={onChanged} />
            )}
          </div>
        </>
      )}
    </section>
  );
}
