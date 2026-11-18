// @ts-check
"use client";

/**
 * Module:   admin/audit-log
 * Purpose:  MEH-3306 (screen) — read-only list of every change made from an
 *           admin account: when, who, what, on what, the reduced change.
 * Touches:  GET /admin/audit-log (backend/app/routers/admin_extra.py) only.
 * Does NOT: edit or delete a row (the table is append-only — there is no
 *           route for it), and does not show the stored IP (the API keeps it
 *           out of the list on purpose).
 * Related:  backend/app/services/admin_audit.py (who writes the rows),
 *           whatsapp-failures/page.jsx (the table + empty-state shape).
 * History:  MEH-3306 (server half #4739; this screen).
 */

import { useEffect, useState } from "react";
import { useTranslations, useLocale } from "next-intl";
import { formatDate } from "@/lib/format-date";
import api from "@/lib/api";
import { showToast } from "@/lib/toast";
import { SkeletonList } from "@/components/Skeleton";
import Button from "@/components/ui/Button";

const PAGE_SIZE = 50;

/** "PUT /admin/users/{user_id}/role" → ["PUT", "/admin/users/{user_id}/role"] */
function splitAction(action) {
  const i = action.indexOf(" ");
  return i < 0 ? ["", action] : [action.slice(0, i), action.slice(i + 1)];
}

/** {before:{role:"consumer"}, after:{role:"admin"}} → "role: consumer → admin" */
function describeChange(details) {
  if (!details) return "—";
  const before = details.before || {};
  const after = details.after || {};
  const keys = [...new Set([...Object.keys(before), ...Object.keys(after)])];
  if (keys.length === 0) return "—";
  return keys
    .map((key) => {
      const now = key in after ? String(after[key]) : "—";
      return key in before ? `${key}: ${String(before[key])} → ${now}` : `${key}: ${now}`;
    })
    .join(" · ");
}

/** @param {{ row: any, t: any, locale: string }} props */
function AuditRow({ row, t, locale }) {
  const [method, path] = splitAction(row.action);
  const methodKey = ["POST", "PUT", "PATCH", "DELETE"].includes(method) ? method : "OTHER";
  return (
    <tr className="border-t border-border hover:bg-background-alt/50">
      {/* MEH-3060: Israel time for every admin, whatever her browser's zone. */}
      <td className="px-5 py-3 text-xs text-fg-muted" data-label={t("audit_log.columns.when")}>
        {formatDate(row.created_at, locale, "dateTime")}
      </td>
      <td className="px-5 py-3 text-xs" data-label={t("audit_log.columns.actor")}>
        {row.actor_email || <span className="text-fg-muted">{t("audit_log.deleted_actor")}</span>}
      </td>
      <td className="px-5 py-3" data-label={t("audit_log.columns.action")}>
        <span className="text-xs font-medium">{t(`audit_log.method.${methodKey}`)}</span>
        <span className="block font-mono text-xs text-fg-muted" dir="ltr">{path}</span>
      </td>
      <td className="px-5 py-3 text-xs text-fg-muted" data-label={t("audit_log.columns.target")}>
        {row.target_type ? (
          <span dir="ltr" className="font-mono">{`${row.target_type} ${row.target_id || ""}`.trim()}</span>
        ) : "—"}
      </td>
      <td className="px-5 py-3 text-xs text-fg-muted" data-label={t("audit_log.columns.change")}>
        <span dir="ltr" className="font-mono">{describeChange(row.details)}</span>
      </td>
    </tr>
  );
}

export default function AdminAuditLogPage() {
  const t = useTranslations("admin");
  const locale = useLocale();
  const [rows, setRows] = useState(/** @type {any[]} */ ([]));
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(false);

  // Keyset cursor (created_at, id): a tie on created_at at a page edge is not skipped.
  const fetchPage = (last) =>
    api
      .get("/admin/audit-log", {
        params: last
          ? { limit: PAGE_SIZE, before: last.created_at, before_id: last.id }
          : { limit: PAGE_SIZE },
      })
      .then((res) => {
        const items = res.data?.items || [];
        setRows((prev) => (last ? [...prev, ...items] : items));
        setHasMore(items.length === PAGE_SIZE);
      })
      .catch(() => showToast.error(t("audit_log.load_error")));

  useEffect(() => {
    fetchPage(null).finally(() => setLoading(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const loadMore = () => {
    setLoadingMore(true);
    fetchPage(rows.at(-1)).finally(() => setLoadingMore(false));
  };

  if (loading) return <SkeletonList count={3} label={t("common.loading")} />;

  return (
    <div className="space-y-6" dir="rtl">
      <div>
        <h1 className="text-2xl font-bold">{t("audit_log.title")}</h1>
        <p className="text-muted text-sm mt-1">{t("audit_log.subtitle")}</p>
      </div>

      {rows.length === 0 ? (
        <div className="bg-surface border border-border rounded-md p-8 text-center text-fg-muted">
          {t("audit_log.empty")}
        </div>
      ) : (
        // MEH-2426: one card per row below md (.table-stack).
        <div className="bg-surface border border-border rounded-md overflow-x-auto">
          <table className="table-stack w-full text-sm">
            <thead>
              <tr className="bg-background-alt text-fg-muted text-xs">
                <th className="px-5 py-2 text-start font-medium">{t("audit_log.columns.when")}</th>
                <th className="px-5 py-2 text-start font-medium">{t("audit_log.columns.actor")}</th>
                <th className="px-5 py-2 text-start font-medium">{t("audit_log.columns.action")}</th>
                <th className="px-5 py-2 text-start font-medium">{t("audit_log.columns.target")}</th>
                <th className="px-5 py-2 text-start font-medium">{t("audit_log.columns.change")}</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <AuditRow key={row.id} row={row} t={t} locale={locale} />
              ))}
            </tbody>
          </table>
        </div>
      )}

      {hasMore && (
        <Button variant="outlined" onClick={loadMore} loading={loadingMore} data-testid="audit-log-more">
          {t("audit_log.load_more")}
        </Button>
      )}
    </div>
  );
}
