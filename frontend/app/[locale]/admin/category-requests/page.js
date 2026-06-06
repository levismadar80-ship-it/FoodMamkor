"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import api from "@/lib/api";
import { showToast } from "@/lib/toast";

export default function AdminCategoryRequestsPage() {
  const t = useTranslations("admin");
  const [groups, setGroups] = useState([]);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState(null);

  const STATUS_LABELS = {
    pending: t("category_requests.status.pending"),
    approved: t("category_requests.status.approved"),
    rejected: t("category_requests.status.rejected"),
    merged: t("category_requests.status.merged"),
  };

  const STATUS_COLORS = {
    pending: "bg-yellow-100 text-yellow-800",
    approved: "bg-green-100 text-green-700",
    rejected: "bg-red-100 text-red-800",
    merged: "bg-blue-100 text-blue-800",
  };

  useEffect(() => {
    api
      .get("/admin/category-requests")
      .then((r) => setGroups(r.data))
      .catch(() => showToast.error(t("category_requests.load_error")))
      .finally(() => setLoading(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const updateStatus = async (requestId, status, adminNotes = null) => {
    setActionLoading(requestId);
    try {
      await api.patch(`/admin/category-requests/${requestId}`, { status, admin_notes: adminNotes });
      setGroups((prev) =>
        prev.map((g) => ({
          ...g,
          requests: g.requests.map((r) =>
            r.id === requestId ? { ...r, status } : r
          ),
        }))
      );
      showToast.success(t("category_requests.status_updated"));
    } catch {
      showToast.error(t("category_requests.update_error"));
    } finally {
      setActionLoading(null);
    }
  };

  if (loading) return <div className="text-fg-muted">{t("common.loading_f")}</div>;

  return (
    <div className="space-y-6" dir="rtl">
      <div>
        <h1 className="text-2xl font-bold">{t("category_requests.title")}</h1>
        <p className="text-muted text-sm mt-1">
          {t("category_requests.subtitle", { count: groups.length })}
        </p>
      </div>

      {groups.length === 0 && (
        <div className="bg-white border border-border rounded-[12px] p-8 text-center text-fg-muted">
          {t("category_requests.empty")}
        </div>
      )}

      {groups.map((group) => (
        <div
          key={group.requested_name}
          className="bg-white border border-border rounded-[12px] overflow-hidden"
        >
          <div className="px-5 py-4 border-b border-border flex items-center justify-between">
            <div>
              <span className="font-semibold text-text">{group.requested_name}</span>
              <span className="ms-2 bg-primary/10 text-primary text-xs font-bold px-2 py-0.5 rounded-full">
                {group.count} {group.count === 1 ? t("category_requests.request_one") : t("category_requests.request_many")}
              </span>
            </div>
            {group.examples.length > 0 && (
              <p className="text-xs text-fg-muted max-w-xs truncate">
                {group.examples.join(" · ")}
              </p>
            )}
          </div>

          <table className="w-full text-sm">
            <thead>
              <tr className="bg-gray-50 text-fg-muted text-xs">
                <th className="px-5 py-2 text-start font-medium">{t("category_requests.columns.id")}</th>
                <th className="px-5 py-2 text-start font-medium">{t("category_requests.columns.business")}</th>
                <th className="px-5 py-2 text-start font-medium">{t("category_requests.columns.date")}</th>
                <th className="px-5 py-2 text-start font-medium">{t("category_requests.columns.status")}</th>
                <th className="px-5 py-2 text-start font-medium">{t("category_requests.columns.actions")}</th>
              </tr>
            </thead>
            <tbody>
              {group.requests.map((req) => (
                <tr key={req.id} className="border-t border-border hover:bg-gray-50/50">
                  <td className="px-5 py-3 text-xs text-fg-muted font-mono">
                    {req.id.slice(0, 8)}…
                  </td>
                  <td className="px-5 py-3 text-xs text-fg-muted">
                    {req.producer_id ? req.producer_id.slice(0, 8) + "…" : "—"}
                  </td>
                  <td className="px-5 py-3 text-xs text-fg-muted">
                    {new Date(req.created_at).toLocaleDateString("he-IL")}
                  </td>
                  <td className="px-5 py-3">
                    <span
                      className={`text-xs font-medium px-2 py-0.5 rounded-full ${
                        STATUS_COLORS[req.status] || "bg-gray-100 text-gray-700"
                      }`}
                    >
                      {STATUS_LABELS[req.status] || req.status}
                    </span>
                  </td>
                  <td className="px-5 py-3">
                    <div className="flex gap-2">
                      {req.status === "pending" && (
                        <>
                          <button
                            onClick={() => updateStatus(req.id, "approved")}
                            disabled={actionLoading === req.id}
                            className="text-xs bg-green-50 text-green-700 border border-green-300 px-2 py-1 rounded-[8px] hover:bg-green-100 transition disabled:opacity-50"
                          >
                            {t("category_requests.actions.approve")}
                          </button>
                          <button
                            onClick={() => updateStatus(req.id, "rejected")}
                            disabled={actionLoading === req.id}
                            className="text-xs bg-red-50 text-red-700 border border-red-200 px-2 py-1 rounded-[8px] hover:bg-red-100 transition disabled:opacity-50"
                          >
                            {t("category_requests.actions.reject")}
                          </button>
                          <button
                            onClick={() => updateStatus(req.id, "merged")}
                            disabled={actionLoading === req.id}
                            className="text-xs bg-blue-50 text-blue-700 border border-blue-200 px-2 py-1 rounded-[8px] hover:bg-blue-100 transition disabled:opacity-50"
                          >
                            {t("category_requests.actions.merge")}
                          </button>
                        </>
                      )}
                      {req.status !== "pending" && (
                        <button
                          onClick={() => updateStatus(req.id, "pending")}
                          disabled={actionLoading === req.id}
                          className="text-xs text-fg-muted hover:text-text transition"
                        >
                          {t("category_requests.actions.reset")}
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ))}
    </div>
  );
}
