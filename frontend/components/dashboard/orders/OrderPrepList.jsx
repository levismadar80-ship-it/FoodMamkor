// @ts-check
"use client";

/**
 * Module:   OrderPrepList
 * Purpose:  «מה להכין» at the top of the «היום» list: today's confirmed
 *           orders summed by product, so the business prepares from one list
 *           instead of adding up the cards.
 * Touches:  nothing — derived from the orders the page already loaded.
 * Does NOT: count a request still waiting for her answer or a change the
 *           buyer has not accepted (lib/product-ordering.js PREP_STATUSES).
 *           Renders nothing when there is nothing confirmed today.
 * History:  MEH-3216 gaps (creation)
 */

import { useTranslations } from "next-intl";

import { prepList } from "@/lib/product-ordering";

/** @param {{ todays: any[] }} props */
export default function OrderPrepList({ todays }) {
  const t = useTranslations("dashboard.producer.orders.prep");
  const lines = prepList(todays);
  if (lines.length === 0) return null;
  return (
    <section className="rounded-lg border border-border bg-surface p-4 space-y-2 mb-3" aria-labelledby="orders-prep-title" data-testid="orders-prep">
      <h3 id="orders-prep-title" className="font-bold text-text">{t("title")}</h3>
      <ul className="text-sm text-text space-y-0.5">
        {lines.map((line) => (
          <li key={line.name}>{t("line", { count: line.count, name: line.name })}</li>
        ))}
      </ul>
    </section>
  );
}
