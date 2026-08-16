"use client";

/**
 * Module:   admin/name-change-requests/page
 * Purpose:  Admin moderation queue for business-name change requests — old
 *           name and requested name side by side, approve or reject.
 * Touches:  GET /admin/name-change-requests?status=pending (read);
 *           PATCH /admin/name-change-requests/{id} (write — the ONLY path that
 *           moves producers.name).
 * Does NOT: edit the name directly, or expose any other producer field. The
 *           owner-facing filing form is BusinessNameCard in
 *           producer/dashboard/edit/cards.jsx.
 * Related:  app/[locale]/admin/category-requests/page.js (the queue idiom this
 *           mirrors — same status chips, same optimistic-update shape);
 *           backend/app/routers/producer_name_requests.py (the four endpoints).
 * History:  MEH-1872 — backend + schema shipped in PR #2745 with no UI; this is
 *           the missing §3 ("האדמינית רואה את הבקשה בתור").
 *
 * Auth: admin-role guard via the admin layout.
 * RTL: logical properties only — see .claude/rules/rtl.md.
 */

import { useEffect, useState } from "react";
import { useTranslations, useLocale } from "next-intl";
import { formatEventDate } from "@/lib/format-date";
import api from "@/lib/api";
import { showToast } from "@/lib/toast";

export default function AdminNameChangeRequestsPage() {
  const t = useTranslations("admin.name_change_requests");
  const tc = useTranslations("admin");
  const locale = useLocale();
  const [requests, setRequests] = useState([]);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState(null);

  const STATUS_LABELS = {
    pending: t("status.pending"),
    approved: t("status.approved"),
    rejected: t("status.rejected"),
  };

  const STATUS_COLORS = {
    pending: "bg-yellow-100 text-yellow-800",
    approved: "bg-green-100 text-green-700",
    rejected: "bg-red-100 text-red-800",
  };

  useEffect(() => {
    api
      .get("/admin/name-change-requests", { params: { status: "pending" } })
      .then((r) => setRequests(Array.isArray(r.data) ? r.data : []))
      .catch(() => showToast.error(t("load_error")))
      .finally(() => setLoading(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const review = async (requestId, status) => {
    setActionLoading(requestId);
    try {
      await api.patch(`/admin/name-change-requests/${requestId}`, { status });
      // Drop the row rather than recolour it: this queue is filtered to
      // ?status=pending, so a decided request no longer belongs to the list
      // being displayed. Leaving it would show a row the next reload won't.
      setRequests((prev) => prev.filter((r) => r.id !== requestId));
      showToast.success(
        status === "approved" ? t("approved_toast") : t("rejected_toast")
      );
    } catch {
      showToast.error(t("update_error"));
    } finally {
      setActionLoading(null);
    }
  };

  if (loading) return <div className="text-fg-muted">{tc("common.loading_f")}</div>;

  return (
    <div className="space-y-6" dir="rtl">
      <div>
        <h1 className="text-2xl font-bold">{t("title")}</h1>
        <p className="text-muted text-sm mt-1">
          {t("subtitle", { count: requests.length })}
        </p>
      </div>

      {requests.length === 0 && (
        <div
          className="bg-white border border-border rounded-[12px] p-8 text-center text-fg-muted"
          data-testid="name-change-queue-empty"
        >
          {t("empty")}
        </div>
      )}

      {requests.map((r) => (
        <div
          key={r.id}
          className="bg-white border border-border rounded-[12px] p-5 space-y-4"
          data-testid="name-change-queue-row"
        >
          {/* The comparison is the whole point of this screen — old and new
              side by side on desktop, stacked on mobile. `current_name` is the
              value STORED AT FILING, not a live read: producers.name can move
              between filing and review, and the admin must judge the change she
              was actually asked to approve. */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <p className="text-[13px] font-semibold text-fg-muted mb-1">
                {t("current_label")}
              </p>
              <p className="text-base text-text" data-testid="name-change-old">
                {r.current_name}
              </p>
            </div>
            <div>
              <p className="text-[13px] font-semibold text-fg-muted mb-1">
                {t("requested_label")}
              </p>
              <p
                className="text-base font-bold text-primary-dark"
                data-testid="name-change-new"
              >
                {r.requested_name}
              </p>
            </div>
          </div>

          {r.reason && (
            <div>
              <p className="text-[13px] font-semibold text-fg-muted mb-1">
                {t("reason_label")}
              </p>
              <p className="text-sm text-text">{r.reason}</p>
            </div>
          )}

          <div className="flex items-center gap-2 flex-wrap">
            <span
              className={`text-xs px-2 py-1 rounded-full ${STATUS_COLORS[r.status] || ""}`}
            >
              {STATUS_LABELS[r.status] || r.status}
            </span>
            {formatEventDate(r.created_at, locale) && (
              <span className="text-xs text-fg-muted">
                {formatEventDate(r.created_at, locale)}
              </span>
            )}
          </div>

          {r.status === "pending" && (
            <div className="flex gap-3 flex-wrap">
              <button
                type="button"
                onClick={() => review(r.id, "approved")}
                disabled={actionLoading === r.id}
                className="bg-primary text-white rounded-full px-5 py-2.5 text-sm font-semibold disabled:opacity-50 focus-ring"
                data-testid="name-change-approve"
              >
                {t("approve")}
              </button>
              <button
                type="button"
                onClick={() => review(r.id, "rejected")}
                disabled={actionLoading === r.id}
                className="border border-border text-text rounded-full px-5 py-2.5 text-sm font-semibold disabled:opacity-50 focus-ring"
                data-testid="name-change-reject"
              >
                {t("reject")}
              </button>
            </div>
          )}
        </div>
      ))}
    </div>
  );
}
