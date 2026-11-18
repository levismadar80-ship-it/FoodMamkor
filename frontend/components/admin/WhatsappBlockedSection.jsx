// @ts-check
"use client";

/**
 * Admin: WhatsApp messages the outbound guard dropped outside production
 * (MEH-3402 follow-up). Reads GET /admin/whatsapp/blocked — every row says
 * what the message would have said, so a message to any recipient can be
 * checked on staging without being sent. Production never writes such rows,
 * so there the list is empty and this section renders nothing.
 * Copy approved by Sapir 18/11 («מאשרת מה שתחליט»).
 */

import { useEffect, useState } from "react";
import { useTranslations, useLocale } from "next-intl";
import { formatEventDate } from "@/lib/format-date";
import api from "@/lib/api";

/** @type {Intl.DateTimeFormatOptions} */
const DATE_OPTS = {
  day: "numeric",
  month: "numeric",
  hour: "2-digit",
  minute: "2-digit",
};

export default function WhatsappBlockedSection() {
  const t = useTranslations("admin");
  const locale = useLocale();
  const [rows, setRows] = useState(/** @type {any[]} */ ([]));

  useEffect(() => {
    api
      .get("/admin/whatsapp/blocked")
      .then((r) => setRows(Array.isArray(r.data) ? r.data : []))
      .catch(() => setRows([]));
  }, []);

  if (rows.length === 0) return null;

  return (
    <section className="space-y-3" data-testid="whatsapp-blocked">
      <div>
        <h2 className="text-lg font-bold">{t("whatsapp_failures.blocked.title")}</h2>
        <p className="text-fg-muted text-sm mt-1">{t("whatsapp_failures.blocked.subtitle")}</p>
      </div>
      <div className="bg-surface border border-border rounded-md overflow-x-auto">
        <table className="table-stack w-full text-sm">
          <thead>
            <tr className="bg-surface-card text-fg-muted text-xs">
              <th className="px-5 py-2 text-start font-medium">{t("whatsapp_failures.columns.phone")}</th>
              <th className="px-5 py-2 text-start font-medium">{t("whatsapp_failures.columns.kind")}</th>
              <th className="px-5 py-2 text-start font-medium">{t("whatsapp_failures.blocked.content")}</th>
              <th className="px-5 py-2 text-start font-medium">{t("whatsapp_failures.columns.sent_at")}</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.id} className="border-t border-border">
                <td className="px-5 py-3 font-mono text-xs" data-label={t("whatsapp_failures.columns.phone")}>{row.to_phone}</td>
                <td className="px-5 py-3 text-xs text-fg-muted break-all" data-label={t("whatsapp_failures.columns.kind")}>{row.kind}</td>
                <td className="px-5 py-3 text-xs whitespace-pre-line break-words" data-label={t("whatsapp_failures.blocked.content")}>
                  {row.error_message || "—"}
                </td>
                <td className="px-5 py-3 text-xs text-fg-muted" data-label={t("whatsapp_failures.columns.sent_at")}>
                  {row.created_at ? formatEventDate(row.created_at, locale, DATE_OPTS) : "—"}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
