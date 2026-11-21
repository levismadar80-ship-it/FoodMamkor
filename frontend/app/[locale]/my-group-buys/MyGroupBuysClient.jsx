// @ts-check
"use client";

/**
 * Module:   MyGroupBuysClient
 * Purpose:  «הקבוצות שלי»: the group buys the signed-in person joined, so she
 *           can get back to one without the email link. Running ones first.
 * Touches:  GET /users/me/group-buys (routers/group_buy_mine.py).
 * Does NOT: join, leave or change a quantity — the group's own page does
 *           (group-buys/[id]), and each row opens it.
 * Related:  app/[locale]/my-orders/MyOrdersClient.jsx (the same shape),
 *           lib/nav-registry.js `myGroupBuys` (the menu link)
 * History:  MEH-3609 (creation; reads through lib/use-api.js, so it shares no
 *           hand-written fetch effect with my-orders — clone-ratchet)
 */

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useLocale, useTranslations } from "next-intl";
import { UsersThree } from "@phosphor-icons/react";

import { Link } from "@/i18n/navigation";
import { useUserApi } from "@/lib/use-api";
import { useAuth } from "@/lib/auth-context";
import { formatDate } from "@/lib/format-date";
import { parseNaiveUtc } from "@/lib/dates";
import { pickupWindowText } from "@/lib/group-buy-pickup";
import { loginHrefBackHere } from "@/lib/safe-redirect";
import { ListOwnGroupBuysUsersMeGroupBuysGetResponse } from "@/lib/generated/api.zod";
import EmptyState from "@/components/ui/EmptyState";
import Button from "@/components/ui/Button";
import InlineMessage from "@/components/ui/InlineMessage";
import { SkeletonList } from "@/components/Skeleton";

const Skeleton = /** @type {any} */ (SkeletonList);
const STATUSES = ["open", "funded", "fulfilled", "cancelled"];

/** @param {{ gb: any }} props */
function Row({ gb }) {
  const t = useTranslations("my_group_buys");
  const tCard = useTranslations("group_buys.card");
  const locale = useLocale();
  // The server already drops the time on a delivery-only group (MEH-3597
  // rule); a cancelled group has no pickup to go to.
  const when = gb.status === "cancelled" ? null : pickupWindowText(gb.pickup_starts_at, gb.pickup_ends_at, locale);
  // An "open" group past its deadline waits for the expiry job: no date that
  // reads as still ahead.
  const stillOpen = gb.status === "open" && parseNaiveUtc(gb.deadline) > new Date();
  const qty = gb.unit
    ? t("quantity_unit", { count: gb.quantity, unit: gb.unit })
    : t("quantity", { count: gb.quantity });
  return (
    <li>
      <Link href={`/group-buys/${gb.id}`} className="block px-4 py-3 min-h-touch hover:bg-background" data-testid="my-group-buys-row">
        <span className="block font-semibold text-text">{gb.title}</span>
        <span className="block text-sm text-fg-muted">
          {/* bdi: a Latin business name beside Hebrew keeps its own order. */}
          {gb.producer_name && <bdi>{gb.producer_name}</bdi>}
          {gb.producer_name && " · "}
          {qty}
        </span>
        <span className="block text-sm text-fg-muted" data-testid="my-group-buys-row-state">
          {/* A status this page has no word for shows no status, never a wrong one. */}
          {[
            STATUSES.includes(gb.status) ? t(`status.${gb.status}`) : null,
            when ? tCard("pickup_when", { when }) : null,
            !when && stillOpen
              ? t("deadline", { date: formatDate(parseNaiveUtc(gb.deadline), locale) })
              : null,
          ].filter(Boolean).join(" · ")}
        </span>
      </Link>
    </li>
  );
}

/**
 * Rule 19: parse before render; a bad body is an error, not a list.
 * @param {unknown} body
 */
function parseRows(body) {
  const parsed = ListOwnGroupBuysUsersMeGroupBuysGetResponse.safeParse(body);
  if (!parsed.success) throw parsed.error;
  return parsed.data.group_buys;
}

export default function MyGroupBuysClient() {
  const t = useTranslations("my_group_buys");
  const tRoot = useTranslations();
  const router = useRouter();
  const { user, loading: authLoading } = useAuth();
  // MEH-3536: the one client read layer; the account id is in the key.
  const { data: rows, error, mutate } = useUserApi("/users/me/group-buys", {
    transform: parseRows,
    view: "my-group-buys-rows",
  });
  const failed = Boolean(error);

  useEffect(() => {
    if (!authLoading && !user) router.push(loginHrefBackHere());
  }, [user, authLoading, router]);

  return (
    <main className="max-w-2xl mx-auto px-4 py-8" data-testid="my-group-buys">
      <h1 className="text-2xl font-bold text-text mb-6">{t("title")}</h1>
      {failed ? (
        <div data-testid="my-group-buys-error" className="space-y-3">
          <InlineMessage>{t("load_error")}</InlineMessage>
          <Button variant="outlined" size="sm" onClick={() => mutate()} data-testid="my-group-buys-error-retry">
            {tRoot("error.retry")}
          </Button>
        </div>
      ) : !rows ? (
        <Skeleton />
      ) : rows.length === 0 ? (
        <EmptyState icon={UsersThree} title={t("empty")} ctaLabel={t("empty_cta")} ctaHref="/group-buys" />
      ) : (
        <ul className="divide-y divide-border bg-surface border border-border rounded-md" data-testid="my-group-buys-list">
          {rows.map((gb) => <Row key={gb.id} gb={gb} />)}
        </ul>
      )}
    </main>
  );
}
