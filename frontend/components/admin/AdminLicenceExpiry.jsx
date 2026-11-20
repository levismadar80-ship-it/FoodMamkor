// @ts-check
"use client";

/**
 * Module:   AdminLicenceExpiry
 * Purpose:  On /admin, the approved businesses whose producer licence runs out
 *           within 30 days, so the admin can chase it before it lapses.
 * Touches:  GET /admin/license-expiry-reminders (admin.py, MEH-2072) — read-only,
 *           nothing is sent.
 * Does NOT: send a reminder (there is no push yet), or list a licence that has
 *           already lapsed (the route leaves those out on purpose).
 * States:   loading → nothing · 0 rows → nothing (the home lists only what needs
 *           a decision) · 1 / many → one row each · failed → one line saying the
 *           list could not be read, never silence (MEH-2096: unknown ≠ empty).
 * History:  MEH-3524 (created — the route had no screen).
 */

import { useEffect, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { IdentificationCard } from "@phosphor-icons/react";
import { Link } from "@/i18n/navigation";
import api from "@/lib/api";
import { formatDate } from "@/lib/format-date";
import { LicenseExpiryRemindersAdminLicenseExpiryRemindersGetResponse as RemindersSchema } from "@/lib/generated/api.zod";

export default function AdminLicenceExpiry() {
  const t = useTranslations("admin.dashboard.licences");
  const locale = useLocale();
  const [rows, setRows] = useState(/** @type {any[] | null} */ (null));
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let live = true;
    api
      .get("/admin/license-expiry-reminders")
      .then((res) => {
        const parsed = RemindersSchema.safeParse(res.data);
        if (!live) return;
        if (parsed.success) setRows(parsed.data.rows);
        else setFailed(true);
      })
      .catch(() => live && setFailed(true));
    return () => {
      live = false;
    };
  }, []);

  if (failed) {
    return (
      <p className="text-sm text-muted" data-testid="admin-home-licences-error">
        {t("error")}
      </p>
    );
  }
  if (!rows || rows.length === 0) return null;

  return (
    <section data-testid="admin-home-licences" className="bg-surface border border-warning-300 rounded-md p-5">
      <h2 className="font-semibold mb-1 flex items-center gap-2">
        <IdentificationCard size={20} aria-hidden="true" className="text-warning-600" />
        {t("heading")}
        <span className="bg-warning-400 text-warning-900 text-xs font-bold px-2 py-0.5 rounded-full leading-none">
          {rows.length}
        </span>
      </h2>
      <p className="text-xs text-muted mb-3">{t("subtitle")}</p>
      <ul className="divide-y divide-border">
        {rows.map((row) => (
          <li key={row.producer_id} className="flex items-center justify-between gap-3 text-sm py-2.5">
            <div className="min-w-0">
              <p className="font-medium truncate">{row.name}</p>
              <p className="text-xs text-muted">
                {row.days_remaining === 0
                  ? t("today", { date: formatDate(row.expires_at, locale) })
                  : t("days_left", { count: row.days_remaining, date: formatDate(row.expires_at, locale) })}
              </p>
            </div>
            <Link
              href={`/admin/producers/${row.producer_id}/edit`}
              className="text-sm text-primary underline decoration-[1.5px] underline-offset-[5px] decoration-primary/35 hover:decoration-current whitespace-nowrap"
            >
              {t("open")}
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}
