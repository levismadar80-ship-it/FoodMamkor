// @ts-check
"use client";

/**
 * Module:   MyOrdersClient
 * Purpose:  «ההזמנות שלי»: everything the signed-in buyer ordered on the site —
 *           product orders, group buys and surprise bags — in one list, split
 *           into «פעילות» and «קודמות». Each row opens the item's own page.
 * Touches:  GET /users/me/product-orders (product_order_buyer.py),
 *           GET /users/me/group-buys (group_buy_mine.py),
 *           GET /rescue/orders/history (rescue.py) — in parallel.
 * Does NOT: show an item's details or act on it — /order/[id], /group-buys/[id]
 *           and /rescue/[offerId] do. Event and workshop registrations are not
 *           here: they are a separate product with their own links.
 * Related:  lib/my-orders-merge.js (sections and order), MyOrdersRow.jsx,
 *           lib/use-my-orders-nav-gate.js (the menu link), lib/nav-registry.js
 * History:  MEH-3525 (creation). MEH-3698: one list for all three kinds;
 *           /my-group-buys redirects here.
 */

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { Receipt } from "@phosphor-icons/react";

import api from "@/lib/api";
import { useAuth } from "@/lib/auth-context";
import { israelToday } from "@/lib/israel-date";
import { mergeMyOrders } from "@/lib/my-orders-merge";
import { loginHrefBackHere } from "@/lib/safe-redirect";
import {
  ListMyReservationHistoryRescueOrdersHistoryGetResponse,
  ListOwnGroupBuysUsersMeGroupBuysGetResponse,
  ListOwnOrdersUsersMeProductOrdersGetResponse,
} from "@/lib/generated/api.zod";
import EmptyState from "@/components/ui/EmptyState";
import Button from "@/components/ui/Button";
import InlineMessage from "@/components/ui/InlineMessage";
import { SkeletonList } from "@/components/Skeleton";
import MyOrdersRow from "./MyOrdersRow";

const Skeleton = /** @type {any} */ (SkeletonList);

// Each source: where it is read, and how its rows come out of a parsed body.
// Rule 19: a body that does not parse is that source failing, not a list.
// Each read is a literal `api.get("…")`: scripts/check_api_contract.py finds
// callers by that shape.
const SOURCES = [
  { key: "orders", read: () => api.get("/users/me/product-orders"), schema: ListOwnOrdersUsersMeProductOrdersGetResponse, rows: (/** @type {any} */ d) => d.orders },
  { key: "groupBuys", read: () => api.get("/users/me/group-buys"), schema: ListOwnGroupBuysUsersMeGroupBuysGetResponse, rows: (/** @type {any} */ d) => d.group_buys },
  { key: "bags", read: () => api.get("/rescue/orders/history"), schema: ListMyReservationHistoryRescueOrdersHistoryGetResponse, rows: (/** @type {any} */ d) => d },
];

/**
 * One source. 404 = that feature is off: nobody has any, so an empty list.
 * @param {typeof SOURCES[number]} source
 * @returns {Promise<any[] | null>} null = this source failed
 */
async function readSource(source) {
  try {
    const r = await source.read();
    const parsed = source.schema.safeParse(r.data);
    return parsed.success ? source.rows(parsed.data) : null;
  } catch (err) {
    return /** @type {any} */ (err)?.response?.status === 404 ? [] : null;
  }
}

/** @returns {Promise<{ lists: Record<string, any[]>, failed: number }>} */
async function readAll() {
  const results = await Promise.all(SOURCES.map(readSource));
  /** @type {Record<string, any[]>} */
  const lists = {};
  SOURCES.forEach((s, i) => { lists[s.key] = results[i] ?? []; });
  return { lists, failed: results.filter((r) => r === null).length };
}

/** @param {{ title: string, rows: any[], testId: string }} props */
function Section({ title, rows, testId }) {
  if (rows.length === 0) return null;
  return (
    <section className="mb-6" data-testid={testId}>
      <h2 className="text-lg font-semibold text-text mb-2">{title}</h2>
      <ul className="divide-y divide-border bg-surface border border-border rounded-md" data-testid="my-orders-list">
        {rows.map((row) => <MyOrdersRow key={`${row.kind}-${row.id}`} row={row} />)}
      </ul>
    </section>
  );
}

export default function MyOrdersClient() {
  const t = useTranslations("my_orders");
  const tRoot = useTranslations();
  const router = useRouter();
  const { user, loading: authLoading } = useAuth();
  const [state, setState] = useState(/** @type {{ lists: Record<string, any[]>, failed: number } | null} */ (null));
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    if (authLoading) return;
    if (!user) {
      router.push(loginHrefBackHere());
      return;
    }
    let live = true;
    readAll().then((next) => { if (live) setState(next); });
    return () => { live = false; };
  }, [user, authLoading, router, attempt]);

  const retry = () => { setState(null); setAttempt((a) => a + 1); };
  const allFailed = state?.failed === SOURCES.length;
  const now = new Date();
  const merged = state && !allFailed ? mergeMyOrders(state.lists, { now, today: israelToday(now) }) : null;
  const empty = merged && merged.active.length === 0 && merged.past.length === 0;

  return (
    <main className="max-w-2xl mx-auto px-4 py-8" data-testid="my-orders">
      <h1 className="text-2xl font-bold text-text mb-6">{t("title")}</h1>
      {allFailed || (empty && state.failed > 0) ? (
        <div data-testid="my-orders-error" className="space-y-3">
          <InlineMessage>{t("load_error")}</InlineMessage>
          <Button variant="outlined" size="sm" onClick={retry} data-testid="my-orders-error-retry">
            {tRoot("error.retry")}
          </Button>
        </div>
      ) : !merged ? (
        <Skeleton />
      ) : empty ? (
        <EmptyState icon={Receipt} title={t("empty")} ctaLabel={t("empty_cta")} ctaHref="/producers" />
      ) : (
        <>
          {state.failed > 0 && (
            <div data-testid="my-orders-partial" className="mb-4 space-y-2">
              <InlineMessage>{t("partial_error")}</InlineMessage>
              <Button variant="outlined" size="sm" onClick={retry}>{tRoot("error.retry")}</Button>
            </div>
          )}
          <Section title={t("section_active")} rows={merged.active} testId="my-orders-active" />
          <Section title={t("section_past")} rows={merged.past} testId="my-orders-past" />
        </>
      )}
    </main>
  );
}
