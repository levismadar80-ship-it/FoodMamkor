"use client";

import { useEffect, useState } from "react";
import { useTranslations, useLocale } from "next-intl";
import { formatEventDate } from "@/lib/format-date";
import api from "@/lib/api";
import { useAdminAction } from "@/lib/use-admin-action";

export default function AdminReportsPage() {
  const t = useTranslations("admin");
  const locale = useLocale();
  const { run, isBusy } = useAdminAction();
  const [reports, setReports] = useState([]);
  // MEH-1266: dialog state replaces the in-memory "ignore" and the native
  // window.prompt. dismissTarget = a producer group.
  const [dismissTarget, setDismissTarget] = useState(null);

  // MEH-1266: reload from the server so closed reports actually disappear
  // (the endpoint returns open reports only) — no more optimistic-only removal.
  const loadReports = () =>
    api.get("/admin/reports").then((r) => setReports(r.data)).catch(() => setReports([]));

  // MEH-1406: the AI-flagged + auto-hidden home-product tabs were removed with
  // the home-products feature (brand LOCK). Only the producer-reports queue
  // remains — no more /admin/home-products fetches here.
  useEffect(() => {
    loadReports();
  }, []);

  // Escape closes the dialog (unless its mutation is mid-flight).
  useEffect(() => {
    if (!dismissTarget) return undefined;
    const onKey = (e) => {
      if (e.key !== "Escape") return;
      if (dismissTarget && !isBusy(`dismiss:${dismissTarget.producer_id}`)) setDismissTarget(null);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [dismissTarget, isBusy]);

  const suspendProducer = (id) =>
    run(`suspend:${id}`, async () => {
      await api.post(`/admin/producers/${id}/toggle-status`);
      setReports(reports.map((r) => (r.producer_id === id ? { ...r, _suspended: true } : r)));
    });

  // MEH-1266: "התעלם" now closes every open report for the producer via the
  // dismiss endpoint (per-producer batch — simpler than a per-report row
  // control, documented in the PR), then reloads so it survives refresh.
  const confirmDismiss = () =>
    run(`dismiss:${dismissTarget.producer_id}`, async () => {
      await Promise.all(dismissTarget.reports.map((rep) => api.post(`/admin/reports/${rep.id}/dismiss`)));
      setDismissTarget(null); // close only on success
      loadReports();
    });

  return (
    <div className="space-y-6">
      <h1 className="font-headline-lg text-3xl font-bold text-text">{t("reports.title")}</h1>

      {/* Producer reports */}
      <section>
        <h2 className="font-semibold text-lg mb-3">{t("reports.section_open")}</h2>
        {reports.length === 0 ? (
          <p className="text-sm text-fg-muted bg-white border border-border rounded-[12px] p-5">
            {t("reports.no_reports")}
          </p>
        ) : (
          <div className="space-y-3">
            {reports
              .slice()
              .sort((a, b) => b.report_count - a.report_count)
              .map((r) => (
                <div
                  key={r.producer_id}
                  className={`bg-white rounded-[12px] p-5 border ${
                    r.auto_flagged ? "border-red-200" : "border-border"
                  }`}
                >
                  <div className="flex items-start justify-between">
                    <div>
                      <div className="flex items-center gap-2">
                        <h3 className="font-semibold">{r.producer_name}</h3>
                        {r.auto_flagged && (
                          <span className="bg-red-100 text-red-700 px-2 py-0.5 rounded-full text-xs font-medium">
                            {t("reports.auto_flag_badge")}
                          </span>
                        )}
                      </div>
                      <p className={`text-sm font-medium ${r.auto_flagged ? "text-red-600" : "text-fg-muted"}`}>
                        {t("reports.report_count", { count: r.report_count })}
                      </p>
                    </div>
                    <div className="flex gap-2">
                      <button
                        onClick={() => suspendProducer(r.producer_id)}
                        disabled={isBusy(`suspend:${r.producer_id}`)}
                        className="bg-yellow-500 text-white px-3 py-1.5 rounded-[12px] text-xs disabled:opacity-50 disabled:cursor-not-allowed"
                      >
                        {t("reports.actions.suspend")}
                      </button>
                      <button
                        onClick={() => setDismissTarget(r)}
                        className="bg-white border border-border px-3 py-1.5 rounded-[12px] text-xs"
                      >
                        {t("reports.actions.ignore")}
                      </button>
                    </div>
                  </div>
                  <ul className="mt-3 space-y-2">
                    {r.reports.map((rep) => (
                      <li
                        key={rep.id}
                        className={`rounded-[8px] p-2 text-xs ${r.auto_flagged ? "bg-red-50" : "bg-gray-50"}`}
                      >
                        <p>{rep.reason}</p>
                        <p className="text-fg-muted mt-1">
                          {formatEventDate(rep.created_at, locale, { day: "numeric", month: "numeric", year: "numeric" })}
                        </p>
                      </li>
                    ))}
                  </ul>
                </div>
              ))}
          </div>
        )}
      </section>

      {/* MEH-1266: dismiss-all confirm dialog (content/page.js precedent) */}
      {dismissTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="dismiss-title"
            className="bg-white rounded-[16px] shadow-xl p-6 max-w-sm w-full mx-4 text-start space-y-4"
          >
            <p id="dismiss-title" className="font-medium text-base">
              {t("reports.actions.dismiss_confirm", { name: dismissTarget.producer_name })}
            </p>
            <div className="flex gap-3 justify-start">
              <button
                disabled={isBusy(`dismiss:${dismissTarget.producer_id}`)}
                onClick={confirmDismiss}
                className="px-4 py-2 rounded-[10px] text-sm font-medium text-white transition bg-red-600 hover:bg-red-700 disabled:opacity-50"
              >
                {isBusy(`dismiss:${dismissTarget.producer_id}`)
                  ? t("reports.actions.dismissing")
                  : t("reports.actions.ignore")}
              </button>
              <button
                disabled={isBusy(`dismiss:${dismissTarget.producer_id}`)}
                onClick={() => setDismissTarget(null)}
                className="px-4 py-2 rounded-[10px] text-sm border border-border text-muted hover:bg-gray-50 transition disabled:opacity-50"
              >
                {t("common.cancel")}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
