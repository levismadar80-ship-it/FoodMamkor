// @ts-check
"use client";

/**
 * Module:   dashboard/orders
 * Purpose:  «הזמנות» — the business's on-site orders (four lists, every
 *           action) and, under them, the settings and the hand-over hours.
 *           Placement approved 14/11 (option B: a dashboard tab with a counter).
 * Touches:  GET /producers/me/order-settings · GET /producers/me/order-windows
 *           · GET /producers/me/product-orders · GET /producers/me (only for
 *           order_window, to prefill an empty week). Once ordering is set up
 *           (on, with a hand-over window) the two settings cards start closed.
 * Does NOT: exist while ordering is off on the server: the settings route
 *           answers 404 and this page renders the site's 404. No build flag.
 * Related:  components/dashboard/orders/* · lib/product-orders.js ·
 *           DashboardLayoutClient.jsx (the tab) · lib/use-orders-tab.js
 * History:  MEH-3316 (creation; stage 4 of MEH-3216) · settings start closed
 *           once set up, 18/11 · MEH-3216 gaps: the products card (its own
 *           read, GET /producers/me/products/ordering) · MEH-3561 (customers card)
 *           · MEH-3746 (the link to the order preview beside the title)
 *           · MEH-3752 («ספרו לנו איך אתם מקבלים הזמנות»: one draft for the
 *           three setup cards, each saved with its own button)
 *           · MEH-3526 (order staff: the orders board alone; the settings,
 *           windows, products and customers routes are the owner's)
 */

import { useCallback, useEffect, useState } from "react";
import { notFound } from "next/navigation";
import { useTranslations } from "next-intl";
import { Eye } from "@phosphor-icons/react";

import Button from "@/components/ui/Button";
import FormFillBox from "@/components/FormFillBox";
import InlineMessage from "@/components/ui/InlineMessage";
import { SkeletonList } from "@/components/Skeleton";
import OrderSetupChecklist from "@/components/dashboard/orders/OrderSetupChecklist";
import OrderProductsCard from "@/components/dashboard/orders/OrderProductsCard";
import OrderSettingsCard from "@/components/dashboard/orders/OrderSettingsCard";
import OrderWindowsCard from "@/components/dashboard/orders/OrderWindowsCard";
import OrdersBoard from "@/components/dashboard/orders/OrdersBoard";
import OrderPrepList from "@/components/dashboard/orders/OrderPrepList";
import OrderCustomersCard from "@/components/dashboard/orders/OrderCustomersCard";
import OrderWeekShareCard from "@/components/dashboard/orders/OrderWeekShareCard";
import api from "@/lib/api";
import useOrdersLive from "@/hooks/useOrdersLive";
import { useAuth } from "@/lib/auth-context";
import { Link } from "@/i18n/navigation";
import { ORDERS_CHANGED_EVENT, isSetUp, loadOrders, loadSettings, loadWindows } from "@/lib/product-orders";

const Skeleton = /** @type {any} */ (SkeletonList);

/** MEH-3526: what order staff see — the orders, nothing the owner sets up. */
async function loadStaff() {
  return { staff: true, orders: await loadOrders() };
}

/** Everything the page shows, in one round. `settings: null` = ordering off. */
async function loadAll() {
  const settings = await loadSettings();
  if (settings === null) return { settings: null };
  const [windows, orders, me] = await Promise.all([
    loadWindows(),
    loadOrders(),
    api.get("/producers/me").then((res) => res.data).catch(() => null),
  ]);
  const setUp = isSetUp(settings, windows);
  // MEH-3931: the name and page link for «מה יש השבוע».
  const business = me ? { name: me.name, slug: me.slug, id: me.id } : null;
  return { settings, windows, orders, orderWindow: me?.order_window ?? null, setUp, business };
}

export default function OrdersPage() {
  const t = useTranslations("dashboard.producer.orders");
  // MEH-3526: the layout already sends staff here and nowhere else.
  const { user } = useAuth();
  const staffOf = user?.role !== "producer" ? user?.staff_of ?? null : null;
  const [data, setData] = useState(/** @type {any} */ (null));
  const [failed, setFailed] = useState(false);

  const [attempt, setAttempt] = useState(0);
  // MEH-3216: what the «מה חסר» checklist needs beyond the settings.
  const [products, setProducts] = useState(/** @type {{ orderable: number, total: number } | null} */ (null));
  const [windowsCount, setWindowsCount] = useState(/** @type {number | null} */ (null));
  // MEH-3931: a product switched on, off or sold out re-reads «מה יש השבוע».
  const [productsSeen, setProductsSeen] = useState(0);
  const countProducts = useCallback((/** @type {any[]} */ rows) => {
    setProducts({ orderable: rows.filter((p) => p.is_orderable).length, total: rows.length });
    setProductsSeen((n) => n + 1);
  }, []);
  // A failed products read counts as none, so the step points to «עריכה».
  const noProducts = useCallback(() => setProducts({ orderable: 0, total: 0 }), []);
  // MEH-3752: the last order-setup draft; each card fills from it and opens.
  const [draft, setDraft] = useState(/** @type {Record<string, unknown> | null} */ (null));

  useEffect(() => {
    let live = true;
    (staffOf ? loadStaff() : loadAll())
      .then((loaded) => live && setData(loaded))
      .catch(() => live && setFailed(true));
    return () => {
      live = false;
    };
  }, [attempt, staffOf]);
  const retry = () => {
    setFailed(false);
    setAttempt((n) => n + 1);
  };

  // MEH-3964: an open tab picks up a new order; the layout's badge and
  // «(N) » title prefix follow through ORDERS_CHANGED_EVENT, as replace() does.
  const fresh = useCallback((/** @type {any[]} */ orders) => {
    setData((/** @type {any} */ old) => (old ? { ...old, orders } : old));
    window.dispatchEvent(new Event(ORDERS_CHANGED_EVENT));
  }, []);
  useOrdersLive(data?.orders ?? null, fresh);

  if (data && data.settings === null) notFound();
  // Until ordering is set up the settings are the first thing to do, so they
  // start open; after, closed (isSetUp). Decided at load only (loadAll), so
  // saving never snaps a card shut under her hand.
  const setUp = Boolean(data?.setUp);
  const folded = setUp && !draft;
  const replace = (/** @type {any} */ updated) => {
    window.dispatchEvent(new Event(ORDERS_CHANGED_EVENT));
    return setData((/** @type {any} */ old) => ({
      ...old,
      orders: old.orders.map((/** @type {any} */ o) => (o.id === updated.id ? updated : o)),
    }));
  };

  return (
    <div className="max-w-3xl mx-auto px-4 py-8 space-y-6" data-testid="orders-page">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="font-headline-md text-xl font-black text-text">{t("title")}</h1>
        {/* MEH-3746: the order form as a buyer sees it, before ordering is on. */}
        {!staffOf && <Link
          href="/producer/dashboard/orders/preview"
          data-testid="orders-preview-link"
          className="inline-flex items-center gap-1.5 min-h-touch px-3 rounded-full text-sm font-medium bg-transparent hover:bg-primary/5 text-action-primary border border-action-primary transition-colors focus-ring"
        >
          <Eye size={16} aria-hidden="true" />
          {t("preview_link")}
        </Link>}
      </div>
      {staffOf && <p data-testid="orders-staff-note" className="text-sm text-fg-muted">{t("staff_note", { name: staffOf.name })}</p>}
      {failed && (
        <div className="space-y-2">
          <InlineMessage tone="error">{t("load_error")}</InlineMessage>
          <Button variant="outlined" size="sm" onClick={retry}>{t("retry")}</Button>
        </div>
      )}
      {!data && !failed && <Skeleton count={3} testId="orders-loading" />}
      {/* Daily stock (27/11): the week's «מה להכין», above the lists — what she
          bakes from, staff included. */}
      {data && !failed && <OrderPrepList orders={data.orders} />}
      {data?.staff && <OrdersBoard orders={data.orders} onChanged={replace} />}
      {data?.settings && (
        <>
          <OrderSetupChecklist
            settings={data.settings}
            windowsCount={windowsCount ?? data.windows.length}
            orderableCount={products?.orderable ?? null}
            hasProducts={Boolean(products?.total)}
          />
          <OrdersBoard orders={data.orders} onChanged={replace} />
          {/* MEH-3216 gaps: the products' two daily switches sit right under
              the orders — «אזל כרגע» is flipped mid-day, the settings are not. */}
          <OrderProductsCard setUp={setUp} onChange={countProducts} onError={noProducts} draft={draft} />
          {/* MEH-3931: «מה יש השבוע», once ordering is set up; a link to an
              off ordering would open a page that takes no orders. */}
          {setUp && <OrderWeekShareCard business={data.business} refresh={productsSeen} />}
          {/* MEH-3561: who ordered and who came back, with a CSV download. */}
          <OrderCustomersCard />
          {/* MEH-3752: beside the one-time setup it fills, not above the
              daily orders. A draft opens the setup cards. */}
          <FormFillBox form="order_setup" title={t("fill.title")} intro={t("fill.intro")} onDraft={(next) => setDraft({ ...next })} />
          <OrderSettingsCard settings={data.settings} onSaved={(settings) => setData({ ...data, settings })} collapsed={folded} draft={draft} />
          <OrderWindowsCard windows={data.windows} orderWindow={data.orderWindow} collapsed={folded} onSaved={(saved) => setWindowsCount(saved.length)} draft={draft} />
        </>
      )}
    </div>
  );
}
