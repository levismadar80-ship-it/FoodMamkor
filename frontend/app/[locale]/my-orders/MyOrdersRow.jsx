// @ts-check
"use client";

/**
 * Module:   MyOrdersRow
 * Purpose:  MEH-3698 — one row of «ההזמנות שלי»: what it is (a tag), the
 *           business, the date and the status, linking to the item's own page.
 * Does NOT: decide which section a row is in or its order — lib/my-orders-merge.js.
 * Related:  app/[locale]/my-orders/MyOrdersClient.jsx (the list)
 * History:  MEH-3698 (creation)
 */

import { useLocale, useTranslations } from "next-intl";

import { Link } from "@/i18n/navigation";
import { formatDate } from "@/lib/format-date";
import Badge from "@/components/ui/Badge";

// Per kind: the tag, and the key of each status word. A status with no word
// shows no status, never a wrong one (the MEH-3525 rule). Shared words come
// from their existing keys (messages-hygiene: one string, one key).
const KINDS = {
  order: {
    tag: "my_orders.kind.order",
    status: Object.fromEntries(
      ["pending", "change_proposed", "confirmed", "ready", "handed", "declined", "cancelled", "expired", "no_show"]
        .map((s) => [s, `my_orders.status.${s}`]),
    ),
  },
  group_buy: {
    tag: "home.whats_on.type.group_buy",
    status: Object.fromEntries(["open", "funded", "fulfilled", "cancelled"].map((s) => [s, `my_orders.group_buy_status.${s}`])),
  },
  bag: {
    tag: "home.whats_on.type.rescue",
    status: {
      reserved: "rescue.dashboard.status.reserved",
      cancelled: "rescue.dashboard.status.cancelled",
      handed: "my_orders.bag_status.handed",
      no_show: "my_orders.bag_status.no_show",
      cancelled_by_business: "my_orders.bag_status.cancelled_by_business",
    },
  },
};

/** @param {{ row: import("@/lib/my-orders-merge").MyOrderRow }} props */
export default function MyOrdersRow({ row }) {
  const t = useTranslations("my_orders");
  const tRoot = useTranslations();
  const locale = useLocale();
  const kind = KINDS[row.kind];
  const statusKey = Object.hasOwn(kind.status, row.status) ? kind.status[row.status] : null;
  const date = formatDate(row.when, locale);
  const text = statusKey
    ? t("row", { business: row.business, date, status: tRoot(statusKey) })
    : t("row_no_status", { business: row.business, date });
  return (
    <li>
      <Link href={row.href} className="flex flex-col items-start gap-1 px-4 py-3 min-h-touch hover:bg-background" data-testid="my-orders-row" data-kind={row.kind}>
        <Badge size="sm">{tRoot(kind.tag)}</Badge>
        <span className="text-text">{text}</span>
      </Link>
    </li>
  );
}
