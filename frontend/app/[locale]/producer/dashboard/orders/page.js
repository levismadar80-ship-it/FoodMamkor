// @ts-check
"use client";

/**
 * Module:   dashboard/orders
 * Purpose:  «הזמנות» — the business's on-site orders (four lists, every
 *           action) and, under them, the settings and the hand-over hours.
 *           Placement approved 14/11 (option B: a dashboard tab with a counter).
 * Touches:  GET /producers/me/order-settings · GET /producers/me/order-windows
 *           · GET /producers/me/product-orders · GET /producers/me (only for
 *           order_window, to prefill an empty week).
 * Does NOT: exist while ordering is off on the server: the settings route
 *           answers 404 and this page renders the site's 404. No build flag.
 * Related:  components/dashboard/orders/* · lib/product-orders.js ·
 *           DashboardLayoutClient.jsx (the tab) · lib/use-orders-tab.js
 * History:  MEH-3316 (creation; stage 4 of MEH-3216)
 */

import { useEffect, useState } from "react";
import { notFound } from "next/navigation";
import { useTranslations } from "next-intl";

import Button from "@/components/ui/Button";
import InlineMessage from "@/components/ui/InlineMessage";
import { SkeletonList } from "@/components/Skeleton";
import OrderSettingsCard from "@/components/dashboard/orders/OrderSettingsCard";
import OrderWindowsCard from "@/components/dashboard/orders/OrderWindowsCard";
import OrdersBoard from "@/components/dashboard/orders/OrdersBoard";
import api from "@/lib/api";
import { loadOrders, loadSettings, loadWindows } from "@/lib/product-orders";

const Skeleton = /** @type {any} */ (SkeletonList);

/** Everything the page shows, in one round. `settings: null` = ordering off. */
async function loadAll() {
  const settings = await loadSettings();
  if (settings === null) return { settings: null };
  const [windows, orders, me] = await Promise.all([
    loadWindows(),
    loadOrders(),
    api.get("/producers/me").then((res) => res.data).catch(() => null),
  ]);
  return { settings, windows, orders: orders.orders, orderWindow: me?.order_window ?? null };
}

export default function OrdersPage() {
  const t = useTranslations("dashboard.producer.orders");
  const [data, setData] = useState(/** @type {any} */ (null));
  const [failed, setFailed] = useState(false);

  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let live = true;
    loadAll()
      .then((loaded) => live && setData(loaded))
      .catch(() => live && setFailed(true));
    return () => {
      live = false;
    };
  }, [attempt]);
  const retry = () => {
    setFailed(false);
    setAttempt((n) => n + 1);
  };

  if (data && data.settings === null) notFound();
  const replace = (/** @type {any} */ updated) =>
    setData((/** @type {any} */ old) => ({
      ...old,
      orders: old.orders.map((/** @type {any} */ o) => (o.id === updated.id ? updated : o)),
    }));

  return (
    <div className="max-w-3xl mx-auto px-4 py-8 space-y-6" data-testid="orders-page">
      <h1 className="font-headline-md text-xl font-black text-text">{t("title")}</h1>
      {failed && (
        <div className="space-y-2">
          <InlineMessage tone="error" role="alert">{t("load_error")}</InlineMessage>
          <Button variant="outlined" size="sm" onClick={retry}>{t("retry")}</Button>
        </div>
      )}
      {!data && !failed && <Skeleton count={3} testId="orders-loading" />}
      {data?.settings && (
        <>
          <OrdersBoard orders={data.orders} onChanged={replace} />
          <OrderSettingsCard settings={data.settings} onSaved={(settings) => setData({ ...data, settings })} />
          <OrderWindowsCard windows={data.windows} orderWindow={data.orderWindow} />
        </>
      )}
    </div>
  );
}
