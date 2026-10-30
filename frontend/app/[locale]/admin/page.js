"use client";

import Link from "next/link";
import { useTranslations } from "next-intl";
import { CheckCircle, HourglassSimple } from "@phosphor-icons/react";
import { detailToMessage } from "@/lib/errors";
import { QUEUES, queueCount } from "./queues";
import { useAdminDashboard } from "./dashboard-data";
import { SkeletonTiles } from "@/components/Skeleton";

/**
 * /admin — «מה מחכה לטיפול» (MEH-2359).
 *
 * Purpose:  The admin's job before launch is ONE thing — approving businesses
 *           (Sapir, 26/10). The home page therefore shows only what needs a
 *           decision: the pending businesses, then every secondary queue that
 *           has items. Nothing else: the stat cards, both charts, DAU, top
 *           cities, the activity feed and the server-health panel that used
 *           to live here are either on /admin/analytics already (monthly
 *           growth, top cities, map) or were per-process noise (server health
 *           "resets on every deploy", by its own footnote). Pattern: a CMS
 *           dashboard is a statement of priorities — editors arrive with a
 *           task, so the login screen is where "needs attention" belongs
 *           (Four Kitchens; Django Monitor's pending-counts summary; Shopify
 *           Home).
 * Touches:  GET /admin/dashboard via the layout's shared fetch
 *           (admin/dashboard-data.js, MEH-2399 — one request, not one per
 *           consumer); reads `stats` + `pending_producers`, the preview list
 *           the endpoint already ships.
 * Does NOT: fetch anything new, decide approvals (that is the table on
 *           /admin/producers), or list queues the sidebar does not — both
 *           read admin/queues.js.
 */
export default function AdminHome() {
  const t = useTranslations("admin");
  const { data, loadError, errorDetail } = useAdminDashboard();
  const error = loadError ? detailToMessage(errorDetail) || t("common.error_loading") : "";

  if (error) {
    return <div className="bg-red-50 border border-red-200 text-red-700 rounded-[12px] p-4">{error}</div>;
  }
  if (!data) {
    return <SkeletonTiles count={4} label={t("common.loading")} />;
  }

  const stats = data.stats || {};
  // A non-number count is unknown, not zero (MEH-2096): the panel then says
  // the count could not be read instead of «אין עסקים ממתינים».
  const pendingCount = typeof stats.pending_producers === "number" ? stats.pending_producers : null;
  const pending = data.pending_producers || [];
  // Secondary queues with something in them. `queueCount` returns null when a
  // key is missing (a stats payload without the MEH-2359 keys — a frontend
  // deployed ahead of its backend). A null is "unknown", never "empty": the
  // rows below list only known-busy queues, and the all-clear line renders
  // only when EVERY count is known (MEH-2096 — an unknown state must not read
  // as a verified-empty one). Whenever any count is unknown the block says so
  // in one line, under the known-busy rows if there are any. The sidebar
  // stays the fail-visible surface for navigation.
  const counted = QUEUES.map((q) => ({ ...q, count: queueCount(stats, q) }));
  const busyQueues = counted.filter((q) => q.count !== null && q.count > 0);
  const countsUnknown = counted.some((q) => q.count === null);

  return (
    <div className="space-y-6 max-w-3xl">
      <div>
        <h1 className="text-2xl font-bold">{t("dashboard.title")}</h1>
        <p className="text-muted text-sm mt-1">{t("dashboard.subtitle")}</p>
      </div>

      {/* 1. Pending businesses — the job. 0 / 1 / many share one frame; the
          count is in the heading so the empty state is explicit, not blank. */}
      <section
        data-testid="admin-home-pending"
        className={`bg-white border rounded-[12px] p-5 ${
          pendingCount > 0 ? "border-yellow-300" : "border-border"
        }`}
      >
        <div className="flex items-center justify-between mb-3 gap-3">
          <h2 className="font-semibold flex items-center gap-2">
            <HourglassSimple
              size={20}
              aria-hidden="true"
              className={pendingCount > 0 ? "text-yellow-600" : "text-muted"}
            />
            {t("dashboard.pending_panel.heading")}
            {pendingCount > 0 && (
              <span className="bg-yellow-400 text-yellow-900 text-xs font-bold px-2 py-0.5 rounded-full leading-none">
                {pendingCount}
              </span>
            )}
          </h2>
          <Link href="/admin/producers?status=pending" className="text-primary text-sm hover:underline whitespace-nowrap">
            {t("dashboard.pending_panel.view_all")}
          </Link>
        </div>
        {pending.length === 0 && pendingCount === null ? (
          <p className="text-sm text-muted" data-testid="admin-home-pending-unknown">
            {t("common.error_loading")}
          </p>
        ) : pending.length === 0 ? (
          <p className="text-sm text-muted">{t("dashboard.pending_panel.empty")}</p>
        ) : (
          <ul className="divide-y divide-border">
            {pending.map((p) => (
              <li key={p.id} className="flex items-center justify-between gap-3 text-sm py-2.5">
                <div className="min-w-0">
                  <p className="font-medium truncate">{p.name}</p>
                  <p className="text-xs text-muted">{p.city || "—"}</p>
                </div>
                <Link
                  href={`/admin/producers/${p.id}/edit`}
                  className="text-sm text-primary hover:underline whitespace-nowrap"
                >
                  {t("dashboard.pending_panel.check")}
                </Link>
              </li>
            ))}
          </ul>
        )}
        {pendingCount !== null && pendingCount > pending.length && (
          <p className="text-xs text-muted mt-3">
            {t("dashboard.pending_panel.more", { count: pendingCount - pending.length })}
          </p>
        )}
      </section>

      {/* 2. Every other queue — one row per non-empty queue; none → one line. */}
      <section data-testid="admin-home-queues" className="bg-white border border-border rounded-[12px] p-5">
        <h2 className="font-semibold mb-3">{t("dashboard.queues.heading")}</h2>
        {busyQueues.length === 0 && !countsUnknown ? (
          <p className="text-sm text-muted flex items-center gap-2">
            <CheckCircle size={18} weight="fill" aria-hidden="true" className="text-primary" />
            {t("dashboard.queues.all_clear")}
          </p>
        ) : busyQueues.length > 0 && (
          <ul className="divide-y divide-border">
            {busyQueues.map((q) => (
              <li key={q.href}>
                <Link
                  href={q.href}
                  className="flex items-center justify-between gap-3 text-sm py-2.5 hover:text-primary transition"
                >
                  <span className="flex items-center gap-2">
                    <q.Icon size={18} aria-hidden="true" className="text-primary" />
                    {t(`layout.nav.${q.key}`)}
                  </span>
                  <span className="bg-yellow-400 text-yellow-900 text-xs font-bold px-2 py-0.5 rounded-full leading-none">
                    {q.count}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        )}
        {countsUnknown && (
          <p className={`text-sm text-muted ${busyQueues.length > 0 ? "mt-3" : ""}`} data-testid="admin-home-queues-unknown">
            {t("common.error_loading")}
          </p>
        )}
      </section>

      <p className="text-xs text-muted">
        <Link href="/admin/analytics" className="hover:underline">
          {t("dashboard.analytics_link")}
        </Link>
      </p>
    </div>
  );
}
