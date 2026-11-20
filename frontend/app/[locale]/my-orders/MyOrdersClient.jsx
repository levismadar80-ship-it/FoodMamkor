// @ts-check
"use client";

/**
 * Module:   MyOrdersClient
 * Purpose:  «ההזמנות שלי»: the signed-in buyer's on-site orders, newest first.
 *           Each row opens the order's existing status page.
 * Touches:  GET /users/me/product-orders (product_order_buyer.py).
 * Does NOT: show an order's details or act on it — /order/[id] does
 *           (OrderStatusClient.jsx), and reads it by id for its owner.
 *           Registrations and rescue bags are not here: they are separate
 *           products with their own links.
 * Related:  lib/use-my-orders-nav-gate.js (the menu link), lib/nav-registry.js
 * History:  MEH-3525 (creation). The route had no screen since MEH-3216 —
 *           found by the unwired-route guard (MEH-3523).
 */

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useLocale, useTranslations } from "next-intl";
import { Receipt } from "@phosphor-icons/react";

import { Link } from "@/i18n/navigation";
import api from "@/lib/api";
import { useAuth } from "@/lib/auth-context";
import { formatDate } from "@/lib/format-date";
import { loginHrefBackHere } from "@/lib/safe-redirect";
import { ListOwnOrdersUsersMeProductOrdersGetResponse } from "@/lib/generated/api.zod";
import EmptyState from "@/components/ui/EmptyState";
import Button from "@/components/ui/Button";
import InlineMessage from "@/components/ui/InlineMessage";
import { SkeletonList } from "@/components/Skeleton";

const Skeleton = /** @type {any} */ (SkeletonList);
const STATUSES = ["pending", "change_proposed", "confirmed", "ready", "handed", "declined", "cancelled", "expired", "no_show"];

export default function MyOrdersClient() {
  const t = useTranslations("my_orders");
  const tRoot = useTranslations();
  const locale = useLocale();
  const router = useRouter();
  const { user, loading: authLoading } = useAuth();
  const [orders, setOrders] = useState(/** @type {any[] | null} */ (null));
  const [failed, setFailed] = useState(false);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    if (authLoading) return;
    if (!user) {
      router.push(loginHrefBackHere());
      return;
    }
    let live = true;
    setFailed(false);
    api
      .get("/users/me/product-orders")
      .then((r) => {
        // Rule 19: parse before render; a bad body is an error, not a list.
        const parsed = ListOwnOrdersUsersMeProductOrdersGetResponse.safeParse(r.data);
        if (!live) return;
        if (parsed.success) setOrders(parsed.data.orders);
        else setFailed(true);
      })
      .catch((err) => {
        if (!live) return;
        // 404 = on-site ordering is off: nobody has orders, so the empty state.
        if (err?.response?.status === 404) setOrders([]);
        else setFailed(true);
      });
    return () => { live = false; };
  }, [user, authLoading, router, attempt]);

  return (
    <main className="max-w-2xl mx-auto px-4 py-8" data-testid="my-orders">
      <h1 className="text-2xl font-bold text-text mb-6">{t("title")}</h1>
      {failed ? (
        <div data-testid="my-orders-error" className="space-y-3">
          <InlineMessage>{t("load_error")}</InlineMessage>
          <Button variant="outlined" size="sm" onClick={() => setAttempt((a) => a + 1)} data-testid="my-orders-error-retry">
            {tRoot("error.retry")}
          </Button>
        </div>
      ) : orders === null ? (
        <Skeleton />
      ) : orders.length === 0 ? (
        <EmptyState icon={Receipt} title={t("empty")} ctaLabel={t("empty_cta")} ctaHref="/producers" />
      ) : (
        <ul className="divide-y divide-border bg-surface border border-border rounded-md" data-testid="my-orders-list">
          {orders.map((o) => (
            <li key={o.id}>
              <Link href={`/order/${o.id}`} className="block px-4 py-3 min-h-touch hover:bg-background" data-testid="my-orders-row">
                {/* A status this page has no word for shows no status, never a wrong one. */}
                {STATUSES.includes(o.status)
                  ? t("row", { business: o.producer_name, date: formatDate(o.created_at, locale), status: t(`status.${o.status}`) })
                  : t("row_no_status", { business: o.producer_name, date: formatDate(o.created_at, locale) })}
              </Link>
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}
