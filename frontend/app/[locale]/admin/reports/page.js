"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { CheckCircle, Warning } from "@phosphor-icons/react";
import api from "@/lib/api";

export default function AdminReportsPage() {
  const t = useTranslations("admin");
  const [tab, setTab] = useState("reports");
  const [reports, setReports] = useState([]);
  const [flagged, setFlagged] = useState([]);
  const [hidden, setHidden] = useState([]);

  const TABS = [
    { key: "reports", label: t("reports.tabs.reports") },
    { key: "flagged", label: t("reports.tabs.flagged") },
    { key: "hidden", label: t("reports.tabs.hidden") },
  ];

  useEffect(() => {
    api.get("/admin/reports").then((r) => setReports(r.data)).catch(() => setReports([]));
    api.get("/admin/home-products/hidden").then((r) => setHidden(r.data)).catch(() => setHidden([]));
    api.get("/admin/home-products/flagged").then((r) => setFlagged(r.data)).catch(() => setFlagged([]));
  }, []);

  const suspendProducer = async (id) => {
    await api.post(`/admin/producers/${id}/toggle-status`);
    setReports(reports.map((r) => (r.producer_id === id ? { ...r, _suspended: true } : r)));
  };

  const approveFlagged = async (id) => {
    await api.post(`/admin/home-products/${id}/approve`);
    setFlagged(flagged.filter((hp) => hp.id !== id));
  };

  const removeFlagged = async (id) => {
    const reason = window.prompt(t("reports.remove_reason_prompt"), "");
    if (reason === null) return;
    await api.post(`/admin/home-products/${id}/remove`, { reason });
    setFlagged(flagged.filter((hp) => hp.id !== id));
  };

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
          <h2 className="font-semibold text-lg mb-3">{t("reports.section_3plus")}</h2>
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
                  <div key={r.producer_id} className="bg-white rounded-[12px] p-5 border border-red-200">
                    <div className="flex items-start justify-between">
                      <div>
                        <h3 className="font-semibold">{r.producer_name}</h3>
                        <p className="text-red-600 text-sm font-medium">{t("reports.report_count", { count: r.report_count })}</p>
                      </div>
                      <div className="flex gap-2">
                        <button
                          onClick={() => suspendProducer(r.producer_id)}
                          className="bg-yellow-500 text-white px-3 py-1.5 rounded-[12px] text-xs"
                        >
                          {t("reports.actions.suspend")}
                        </button>
                        <button
                          onClick={() => setReports(reports.filter((x) => x.producer_id !== r.producer_id))}
                          className="bg-white border border-border px-3 py-1.5 rounded-[12px] text-xs"
                        >
                          {t("reports.actions.ignore")}
                        </button>
                      </div>
                    </div>
                    <ul className="mt-3 space-y-2">
                      {r.reports.map((rep) => (
                        <li key={rep.id} className="bg-red-50 rounded-[8px] p-2 text-xs">
                          <p>{rep.reason}</p>
                          <p className="text-fg-muted mt-1">
                            {new Date(rep.created_at).toLocaleDateString("he-IL")}
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
                        {hp.price != null && <> · ₪{hp.price}</>}
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
                          <p className="mt-1 opacity-80">💡 {hp.moderation_suggestion}</p>
                        )}
                      </div>
                    </div>
                    <div className="flex flex-col gap-2 shrink-0">
                      <button
                        onClick={() => approveFlagged(hp.id)}
                        className="bg-primary text-white px-3 py-1.5 rounded-[8px] text-xs hover:bg-primary-dark transition"
                      >
                        <CheckCircle size={16} weight="fill" className="inline align-[-2px]" aria-hidden="true" /> {t("reports.flagged.approve")}
                      </button>
                      <button
                        onClick={() => removeFlagged(hp.id)}
                        className="bg-white border border-red-400 text-red-600 px-3 py-1.5 rounded-[8px] text-xs hover:bg-red-50 transition"
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
                    onClick={async () => {
                      await api.post(`/admin/home-products/${hp.id}/restore`);
                      setHidden(hidden.filter((x) => x.id !== hp.id));
                    }}
                    className="text-xs bg-primary text-white px-3 py-1.5 rounded-[12px]"
                  >
                    {t("reports.hidden.restore")}
                  </button>
                </div>
              ))}
            </div>
          )}
        </section>
      )}
    </div>
  );
}
