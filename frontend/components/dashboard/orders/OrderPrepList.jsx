// @ts-check
"use client";

/**
 * Module:   OrderPrepList
 * Purpose:  «מה להכין» above the order lists: for each pickup day from today
 *           for a week, how many of each product and size to prepare —
 *           confirmed, and apart from it what still waits for her answer —
 *           with the day's limit when she set one («12 מתוך 20»).
 * Touches:  GET /producers/me/orders/prep (re-read whenever the orders change).
 * Does NOT: count the orders itself — the server does, on the Israel day, with
 *           the same statuses that hold stock (services/product_daily_stock.py).
 *           Renders nothing when no order is booked for the week.
 * Related:  lib/daily-stock-owner.js (the read), OrderProductsCard.jsx (the limits)
 * History:  MEH-3216 gaps (creation: today, confirmed, summed in the browser);
 *           daily stock (27/11/2026: a week of days from the server, waiting
 *           requests apart, limits, sizes)
 */

import { useEffect, useState } from "react";
import { useLocale, useTranslations } from "next-intl";

import Button from "@/components/ui/Button";
import Heading from "@/components/ui/Heading";
import { loadPrepList, prepDayName } from "@/lib/daily-stock-owner";
import { orderLineName } from "@/lib/product-variants";

/** @param {{ line: any }} props */
function PrepLine({ line }) {
  const t = useTranslations("dashboard.producer.orders.prep");
  const total = line.confirmed + line.waiting;
  return (
    <li className="flex flex-wrap items-baseline justify-between gap-x-3" data-testid="orders-prep-line">
      <span className="text-text">{t("line", { count: total, name: orderLineName(line) })}</span>
      <span className="text-xs text-fg-muted">
        {line.waiting > 0 && t("waiting", { count: line.waiting })}
        {line.waiting > 0 && typeof line.limit === "number" && " · "}
        {typeof line.limit === "number" && t("of_limit", { limit: line.limit })}
      </span>
    </li>
  );
}

/** @param {{ orders: any[] }} props  orders: the page's list, read again when it changes */
export default function OrderPrepList({ orders }) {
  const t = useTranslations("dashboard.producer.orders.prep");
  const tOrders = useTranslations("dashboard.producer.orders");
  const locale = useLocale();
  const [days, setDays] = useState(/** @type {any[] | null} */ (null));
  const [picked, setPicked] = useState(/** @type {string | null} */ (null));
  useEffect(() => {
    let live = true;
    loadPrepList()
      .then((rows) => live && setDays(rows))
      .catch(() => live && setDays([]));
    return () => {
      live = false;
    };
  }, [orders]);
  if (!days || days.length === 0) return null;
  const day = days.find((d) => d.day === picked) ?? days[0];
  return (
    <details open className="group rounded-lg border border-border bg-surface p-4 space-y-3" data-testid="orders-prep">
      <summary className="cursor-pointer list-none min-h-touch flex items-center focus-ring rounded-sm [&::-webkit-details-marker]:hidden">
        <Heading level={2} variant="sans" id="orders-prep-title" className="font-bold text-lg text-text">{t("title")}</Heading>
      </summary>
      {days.length > 1 && (
        <div role="group" aria-label={t("days")} className="flex flex-wrap gap-2">
          {days.map((d) => (
            <Button
              key={d.day}
              size="sm"
              variant={d.day === day.day ? "primary" : "outlined"}
              aria-pressed={d.day === day.day}
              onClick={() => setPicked(d.day)}
              data-testid="orders-prep-day"
            >
              {prepDayName(d.day, locale, tOrders)}
            </Button>
          ))}
        </div>
      )}
      {days.length === 1 && <p className="text-sm text-fg-muted">{prepDayName(day.day, locale, tOrders)}</p>}
      <ul className="text-sm space-y-1" aria-labelledby="orders-prep-title">
        {day.lines.map((/** @type {any} */ line) => (
          <PrepLine key={`${line.product_id}-${line.variant_id}-${line.name}`} line={line} />
        ))}
      </ul>
    </details>
  );
}
