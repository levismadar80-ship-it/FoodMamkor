// @ts-check
"use client";

/**
 * Module:   OrderCustomersCard
 * Purpose:  «הלקוחות שלכם» in the «הזמנות» tab: who ordered through the site,
 *           how many times and when last, «לקוח חוזר» from two orders, and a
 *           CSV download so the business keeps its own list.
 * Touches:  GET /producers/me/product-orders/customers (lib/order-customers.js).
 * Does NOT: show the phone on screen — each order card already does; the
 *           phone is in the CSV. Does NOT render while the read fails: a
 *           missing list is not shown as «no customers».
 * Related:  backend/app/services/product_order_customers.py (who counts)
 * History:  MEH-3561 (creation)
 */

import { useEffect, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { DownloadSimple } from "@phosphor-icons/react";

import Button from "@/components/ui/Button";
import ShowMore from "@/components/ui/ShowMore";
import { formatDate } from "@/lib/format-date";
import { israelToday } from "@/lib/israel-date";
import { REPEAT_FROM, customersCsv, downloadCsv, loadCustomers } from "@/lib/order-customers";

export const FIRST_ROWS = 10;

export default function OrderCustomersCard() {
  const t = useTranslations("dashboard.producer.orders.customers");
  const locale = useLocale();
  const [customers, setCustomers] = useState(/** @type {import("@/lib/order-customers").Customer[] | null} */ (null));
  const [all, setAll] = useState(false);

  useEffect(() => {
    let live = true;
    loadCustomers()
      .then((rows) => live && setCustomers(rows))
      .catch(() => {}); // the card stays hidden; the orders above still work
    return () => {
      live = false;
    };
  }, []);

  if (customers === null) return null;
  const date = (/** @type {string} */ iso) => formatDate(iso, locale);
  const shown = all ? customers : customers.slice(0, FIRST_ROWS);
  const download = () =>
    downloadCsv(
      customersCsv(customers, [t("csv.name"), t("csv.phone"), t("csv.orders"), t("csv.last")], date),
      // eslint-disable-next-line no-restricted-syntax -- MEH-3861: the file name, built in the download handler
      `customers-${israelToday()}.csv`,
    );

  return (
    <section
      className="rounded-lg border border-border bg-surface p-4 space-y-3"
      aria-labelledby="orders-customers-title"
      data-testid="orders-customers"
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 id="orders-customers-title" className="font-bold text-text">{t("title")}</h2>
        {customers.length > 0 && (
          <Button
            variant="outlined"
            size="sm"
            onClick={download}
            leadingIcon={<DownloadSimple size={18} aria-hidden="true" />}
            data-testid="orders-customers-csv"
          >
            {t("download")}
          </Button>
        )}
      </div>
      {customers.length === 0 ? (
        <p className="text-sm text-fg-muted" data-testid="orders-customers-empty">{t("empty")}</p>
      ) : (
        <>
          <ul id="orders-customers-list" className="divide-y divide-border">
            {shown.map((c) => (
              <li key={c.phone} className="py-2 text-sm text-text flex flex-wrap items-center gap-2" data-testid="orders-customers-row">
                <span>{t("row", { name: c.name, count: c.order_count, date: date(c.last_order_at) })}</span>
                {c.order_count >= REPEAT_FROM && (
                  <span className="rounded-full bg-primary/10 text-primary text-xs font-semibold px-2 py-0.5" data-testid="orders-customers-repeat">
                    {t("repeat")}
                  </span>
                )}
              </li>
            ))}
          </ul>
          {customers.length > FIRST_ROWS && (
            <ShowMore
              size="inline"
              expanded={all}
              onClick={() => setAll(!all)}
              label={all ? t("show_less") : t("show_more", { count: customers.length - FIRST_ROWS })}
              aria-controls="orders-customers-list"
              data-testid="orders-customers-more"
            />
          )}
        </>
      )}
      <p className="text-xs text-fg-muted">{t("note")}</p>
    </section>
  );
}
