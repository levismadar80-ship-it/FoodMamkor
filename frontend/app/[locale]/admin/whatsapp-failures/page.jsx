"use client";

/**
 * Admin: undelivered outbound WhatsApp messages — MEH-771 Chunk C.
 *
 * Reads GET /admin/whatsapp/failed and lists rows where Meta confirmed
 * the message did NOT reach the recipient (status: 'failed' or
 * 'window_expired') in the last 7 days. List-only — no resend / retry
 * actions in this chunk (intentional; see admin_whatsapp.py docstring).
 *
 * Mirrors the table+empty-state shape of /admin/category-requests with
 * no new visual design.
 */

import { useEffect, useState } from "react";
import { useTranslations, useLocale } from "next-intl";
import { formatEventDate } from "@/lib/format-date";
import api from "@/lib/api";
import { showToast } from "@/lib/toast";

const STATUS_COLORS = {
  failed: "bg-red-100 text-red-800",
  window_expired: "bg-yellow-100 text-yellow-800",
};

export default function AdminWhatsappFailuresPage() {
  const t = useTranslations("admin");
  const locale = useLocale();
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api
      .get("/admin/whatsapp/failed")
      .then((r) => setRows(r.data))
      .catch(() => showToast.error(t("whatsapp_failures.load_error")))
      .finally(() => setLoading(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (loading) return <div className="text-fg-muted">{t("common.loading_f")}</div>;

  return (
    <div className="space-y-6" dir="rtl">
      <div>
        <h1 className="text-2xl font-bold">{t("whatsapp_failures.title")}</h1>
        <p className="text-muted text-sm mt-1">{t("whatsapp_failures.subtitle")}</p>
      </div>

      {rows.length === 0 ? (
        <div className="bg-white border border-border rounded-[12px] p-8 text-center text-fg-muted">
          {t("whatsapp_failures.empty")}
        </div>
      ) : (
        <div className="bg-white border border-border rounded-[12px] overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-gray-50 text-fg-muted text-xs">
                <th className="px-5 py-2 text-start font-medium">{t("whatsapp_failures.columns.phone")}</th>
                <th className="px-5 py-2 text-start font-medium">{t("whatsapp_failures.columns.kind")}</th>
                <th className="px-5 py-2 text-start font-medium">{t("whatsapp_failures.columns.status")}</th>
                <th className="px-5 py-2 text-start font-medium">{t("whatsapp_failures.columns.error_code")}</th>
                <th className="px-5 py-2 text-start font-medium">{t("whatsapp_failures.columns.error_message")}</th>
                <th className="px-5 py-2 text-start font-medium">{t("whatsapp_failures.columns.sent_at")}</th>
                <th className="px-5 py-2 text-start font-medium">{t("whatsapp_failures.columns.updated_at")}</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.id} className="border-t border-border hover:bg-gray-50/50">
                  <td className="px-5 py-3 font-mono text-xs">{row.to_phone}</td>
                  <td className="px-5 py-3 text-xs text-fg-muted">{row.kind}</td>
                  <td className="px-5 py-3">
                    <span
                      className={`text-xs font-medium px-2 py-0.5 rounded-full ${
                        STATUS_COLORS[row.status] || "bg-gray-100 text-gray-700"
                      }`}
                    >
                      {t(`whatsapp_failures.status.${row.status}`)}
                    </span>
                  </td>
                  <td className="px-5 py-3 text-xs text-fg-muted font-mono">
                    {row.error_code ?? "—"}
                  </td>
                  <td className="px-5 py-3 text-xs text-fg-muted">
                    {row.error_message || "—"}
                  </td>
                  <td className="px-5 py-3 text-xs text-fg-muted">
                    {row.created_at
                      ? formatEventDate(row.created_at, locale, {
                          day: "numeric",
                          month: "numeric",
                          year: "numeric",
                          hour: "2-digit",
                          minute: "2-digit",
                        })
                      : "—"}
                  </td>
                  <td className="px-5 py-3 text-xs text-fg-muted">
                    {row.updated_at
                      ? formatEventDate(row.updated_at, locale, {
                          day: "numeric",
                          month: "numeric",
                          year: "numeric",
                          hour: "2-digit",
                          minute: "2-digit",
                        })
                      : "—"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
