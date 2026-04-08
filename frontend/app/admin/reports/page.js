"use client";

import { useEffect, useState } from "react";
import api from "@/lib/api";

export default function AdminReportsPage() {
  const [reports, setReports] = useState([]);
  const [hidden, setHidden] = useState([]);

  useEffect(() => {
    api.get("/admin/reports").then((r) => setReports(r.data)).catch(() => setReports([]));
    api.get("/admin/home-products/hidden").then((r) => setHidden(r.data)).catch(() => setHidden([]));
  }, []);

  const suspendProducer = async (id) => {
    await api.post(`/admin/producers/${id}/toggle-status`);
    setReports(reports.map((r) => (r.producer_id === id ? { ...r, _suspended: true } : r)));
  };

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold">דיווחים ובעיות</h1>

      <section>
        <h2 className="font-semibold text-lg mb-3">בתי עסק עם 3+ דיווחים</h2>
        {reports.length === 0 ? (
          <p className="text-sm text-text-secondary bg-white border border-border rounded-[12px] p-5">אין דיווחים פתוחים 🎉</p>
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
                      <p className="text-red-600 text-sm font-medium">{r.report_count} דיווחים</p>
                    </div>
                    <div className="flex gap-2">
                      <button
                        onClick={() => suspendProducer(r.producer_id)}
                        className="bg-yellow-500 text-white px-3 py-1.5 rounded-[12px] text-xs"
                      >
                        ⏸️ השהה עסק
                      </button>
                      <button
                        onClick={() => setReports(reports.filter((x) => x.producer_id !== r.producer_id))}
                        className="bg-white border border-border px-3 py-1.5 rounded-[12px] text-xs"
                      >
                        התעלם
                      </button>
                    </div>
                  </div>
                  <ul className="mt-3 space-y-2">
                    {r.reports.map((rep) => (
                      <li key={rep.id} className="bg-red-50 rounded-[8px] p-2 text-xs">
                        <p>{rep.reason}</p>
                        <p className="text-text-secondary mt-1">
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

      <section>
        <h2 className="font-semibold text-lg mb-3">מוצרים ביתיים מוסתרים אוטומטית</h2>
        {hidden.length === 0 ? (
          <p className="text-sm text-text-secondary bg-white border border-border rounded-[12px] p-5">
            אין מוצרים מוסתרים
          </p>
        ) : (
          <div className="space-y-2">
            {hidden.map((hp) => (
              <div key={hp.id} className="bg-white border border-yellow-200 rounded-[12px] p-4 flex items-center justify-between">
                <div>
                  <p className="font-medium">{hp.title}</p>
                  <p className="text-xs text-text-secondary">{hp.seller_name} · {hp.city}</p>
                </div>
                <button
                  onClick={async () => {
                    await api.post(`/admin/home-products/${hp.id}/restore`);
                    setHidden(hidden.filter((x) => x.id !== hp.id));
                  }}
                  className="text-xs bg-primary text-white px-3 py-1.5 rounded-[12px]"
                >
                  שחזר
                </button>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
