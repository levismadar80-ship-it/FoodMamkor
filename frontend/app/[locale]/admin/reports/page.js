"use client";

import { useEffect, useState } from "react";
import { useTranslations, useLocale } from "next-intl";
import { formatEventDate } from "@/lib/format-date";
import { CheckCircle, Warning, Lightbulb } from "@phosphor-icons/react";
import api from "@/lib/api";
// MEH-1140: canonical shekel format ("35₪") — one owner in lib/utils.
import { formatPrice } from "@/lib/utils";
import { useAdminAction } from "@/lib/use-admin-action";

export default function AdminReportsPage() {
  const t = useTranslations("admin");
  const locale = useLocale();
  const { run, isBusy } = useAdminAction();
  const [tab, setTab] = useState("reports");
  const [reports, setReports] = useState([]);
  const [flagged, setFlagged] = useState([]);
  const [hidden, setHidden] = useState([]);
  // MEH-1266: dialog state replaces the in-memory "ignore" and the native
  // window.prompt. dismissTarget = a producer group; removeTarget = a flagged
  // home product (+ its reason text).
  const [dismissTarget, setDismissTarget] = useState(null);
  const [removeTarget, setRemoveTarget] = useState(null);

  const TABS = [
    { key: "reports", label: t("reports.tabs.reports") },
    { key: "flagged", label: t("reports.tabs.flagged") },
    { key: "hidden", label: t("reports.tabs.hidden") },
  ];

  // MEH-1266: reload from the server so closed reports actually disappear
  // (the endpoint returns open reports only) — no more optimistic-only removal.
  const loadReports = () =>
    api.get("/admin/reports").then((r) => setReports(r.data)).catch(() => setReports([]));

  useEffect(() => {
    loadReports();
    api.get("/admin/home-products/hidden").then((r) => setHidden(r.data)).catch(() => setHidden([]));
    api.get("/admin/home-products/flagged").then((r) => setFlagged(r.data)).catch(() => setFlagged([]));
  }, []);

  // Escape closes whichever dialog is open (unless its mutation is mid-flight).
  useEffect(() => {
    if (!dismissTarget && !removeTarget) return undefined;
    const onKey = (e) => {
      if (e.key !== "Escape") return;
      if (dismissTarget && !isBusy(`dismiss:${dismissTarget.producer_id}`)) setDismissTarget(null);
      if (removeTarget && !isBusy(`remove:${removeTarget.id}`)) setRemoveTarget(null);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [dismissTarget, removeTarget, isBusy]);

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

  const approveFlagged = (id) =>
    run(`approve:${id}`, async () => {
      await api.post(`/admin/home-products/${id}/approve`);
      setFlagged(flagged.filter((hp) => hp.id !== id));
    });

  // MEH-1266: reason capture moved from window.prompt to a modal (content
  // page precedent). The DELETE only fires from confirmRemove.
  const confirmRemove = () =>
    run(`remove:${removeTarget.id}`, async () => {
      await api.post(`/admin/home-products/${removeTarget.id}/remove`, { reason: removeTarget.reason });
      setFlagged(flagged.filter((hp) => hp.id !== removeTarget.id));
      setRemoveTarget(null); // close only on success
    });

  return (
    <div className="space-y-6">
      <h1 className="font-headline-lg text-3xl font-bold text-text">{t("reports.title")}</h1>

      {/* Tabs */}
      <div className="flex gap-2 border-b border-border">
        {TABS.map((tt) => {
          const count = tt.key === "reports" ? reports.length : tt.key === "flagged" ? flagged.length : hidden.length;
          return (
            <button
              key={tt.key}
              onClick={() => setTab(tt.key)}
              className={`px-4 py-2 text-sm transition border-b-2 ${
                tab === tt.key
                  ? "border-primary text-primary font-semibold"
                  : "border-transparent text-fg-muted hover:text-text"
              }`}
              aria-current={tab === tt.key ? "page" : undefined}
            >
              {tt.label}
              {count > 0 && (
                <span className="me-2 bg-green-50 text-primary px-2 py-0.5 rounded-full text-xs">{count}</span>
              )}
            </button>
          );
        })}
      </div>

      {/* Tab 1: producer reports */}
      {tab === "reports" && (
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
      )}

      {/* Tab 2: AI-flagged home products */}
      {tab === "flagged" && (
        <section>
          <h2 className="font-semibold text-lg mb-3">{t("reports.flagged.heading")}</h2>
          <p className="text-sm text-fg-muted mb-4">
            {t("reports.flagged.subtitle")}
          </p>
          {flagged.length === 0 ? (
            <p className="text-sm text-fg-muted bg-white border border-border rounded-[12px] p-5">
              {t("reports.flagged.empty")}
            </p>
          ) : (
            <div className="space-y-3">
              {flagged.map((hp) => (
                <div key={hp.id} className="bg-white rounded-[12px] p-5 border border-yellow-300">
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex-1">
                      <h3 className="font-semibold text-text">{hp.title}</h3>
                      <p className="text-xs text-fg-muted mt-1">
                        {hp.seller_name} · {hp.city}
                        {hp.price != null && <> · {formatPrice(hp.price)}</>}
                      </p>
                      {hp.description && (
                        <p className="text-sm text-text/85 mt-2 whitespace-pre-line">{hp.description}</p>
                      )}
                      <div
                        className="mt-3 rounded-[8px] p-3 text-sm"
                        style={{ background: "#FFF9E6", border: "1px solid #F0C040", color: "#946A00" }}
                      >
                        <p className="font-medium"><Warning size={16} weight="fill" className="inline align-[-2px]" aria-hidden="true" /> {hp.moderation_reason || t("reports.flagged.default_reason")}</p>
                        {hp.moderation_suggestion && (
                          <p className="mt-1 opacity-80"><Lightbulb size={14} weight="fill" className="inline align-[-2px]" aria-hidden="true" /> {hp.moderation_suggestion}</p>
                        )}
                      </div>
                    </div>
                    <div className="flex flex-col gap-2 shrink-0">
                      <button
                        onClick={() => approveFlagged(hp.id)}
                        disabled={isBusy(`approve:${hp.id}`)}
                        className="bg-primary text-white px-3 py-1.5 rounded-[8px] text-xs hover:bg-primary-dark transition disabled:opacity-50 disabled:cursor-not-allowed"
                      >
                        <CheckCircle size={16} weight="fill" className="inline align-[-2px]" aria-hidden="true" /> {t("reports.flagged.approve")}
                      </button>
                      <button
                        onClick={() => setRemoveTarget({ id: hp.id, reason: "" })}
                        disabled={isBusy(`remove:${hp.id}`)}
                        className="bg-white border border-red-400 text-red-600 px-3 py-1.5 rounded-[8px] text-xs hover:bg-red-50 transition disabled:opacity-50 disabled:cursor-not-allowed"
                      >
                        {t("reports.flagged.remove")}
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>
      )}

      {/* Tab 3: auto-hidden by negative ratings */}
      {tab === "hidden" && (
        <section>
          <h2 className="font-semibold text-lg mb-3">{t("reports.hidden.heading")}</h2>
          {hidden.length === 0 ? (
            <p className="text-sm text-fg-muted bg-white border border-border rounded-[12px] p-5">
              {t("reports.hidden.empty")}
            </p>
          ) : (
            <div className="space-y-2">
              {hidden.map((hp) => (
                <div key={hp.id} className="bg-white border border-yellow-200 rounded-[12px] p-4 flex items-center justify-between">
                  <div>
                    <p className="font-medium">{hp.title}</p>
                    <p className="text-xs text-fg-muted">{hp.seller_name} · {hp.city}</p>
                  </div>
                  <button
                    onClick={() =>
                      run(`restore:${hp.id}`, async () => {
                        await api.post(`/admin/home-products/${hp.id}/restore`);
                        setHidden(hidden.filter((x) => x.id !== hp.id));
                      })
                    }
                    disabled={isBusy(`restore:${hp.id}`)}
                    className="text-xs bg-primary text-white px-3 py-1.5 rounded-[12px] disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {t("reports.hidden.restore")}
                  </button>
                </div>
              ))}
            </div>
          )}
        </section>
      )}

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

      {/* MEH-1266: remove-reason dialog replaces window.prompt */}
      {removeTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="remove-title"
            className="bg-white rounded-[16px] shadow-xl p-6 max-w-sm w-full mx-4 text-start space-y-4"
          >
            <label id="remove-title" htmlFor="remove-reason" className="font-medium text-base block">
              {t("reports.remove_reason_prompt")}
            </label>
            <textarea
              id="remove-reason"
              autoFocus
              rows={3}
              value={removeTarget.reason}
              onChange={(e) => setRemoveTarget({ ...removeTarget, reason: e.target.value })}
              className="w-full border border-border rounded-[10px] px-3 py-2 text-sm"
            />
            <div className="flex gap-3 justify-start">
              <button
                disabled={isBusy(`remove:${removeTarget.id}`)}
                onClick={confirmRemove}
                className="px-4 py-2 rounded-[10px] text-sm font-medium text-white transition bg-red-600 hover:bg-red-700 disabled:opacity-50"
              >
                {isBusy(`remove:${removeTarget.id}`)
                  ? t("reports.flagged.removing")
                  : t("reports.flagged.remove")}
              </button>
              <button
                disabled={isBusy(`remove:${removeTarget.id}`)}
                onClick={() => setRemoveTarget(null)}
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
