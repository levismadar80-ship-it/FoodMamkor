"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/lib/auth-context";
import api from "@/lib/api";

export default function AdminPage() {
  const { user, loading: authLoading } = useAuth();
  const router = useRouter();
  const [tab, setTab] = useState("pending");
  const [producers, setProducers] = useState([]);
  const [reports, setReports] = useState([]);
  const [hiddenListings, setHiddenListings] = useState([]);
  const [stats, setStats] = useState(null);
  const [rejectReason, setRejectReason] = useState({});

  useEffect(() => {
    if (!authLoading && (!user || user.role !== "admin")) {
      router.push("/login");
    }
  }, [user, authLoading, router]);

  useEffect(() => {
    if (!user || user.role !== "admin") return;
    if (tab === "pending") loadProducers("pending");
    else if (tab === "approved") loadProducers("approved");
    else if (tab === "reports") loadReports();
    else if (tab === "hidden") loadHidden();
    else if (tab === "stats") loadStats();
  }, [tab, user]);

  const loadProducers = (status) => {
    api.get(`/admin/producers?status=${status}`).then((r) => setProducers(r.data));
  };

  const loadReports = () => {
    api.get("/admin/reports").then((r) => setReports(r.data));
  };

  const loadHidden = () => {
    api.get("/admin/home-products/hidden").then((r) => setHiddenListings(r.data));
  };

  const loadStats = () => {
    api.get("/admin/stats").then((r) => setStats(r.data));
  };

  const approve = async (id) => {
    await api.post(`/admin/producers/${id}/approve`);
    loadProducers("pending");
  };

  const reject = async (id) => {
    await api.post(`/admin/producers/${id}/reject`, { reason: rejectReason[id] || "" });
    setRejectReason({ ...rejectReason, [id]: "" });
    loadProducers("pending");
  };

  const restoreListing = async (id) => {
    await api.post(`/admin/home-products/${id}/restore`);
    loadHidden();
  };

  const deleteListing = async (id) => {
    if (!confirm("למחוק את המוצר?")) return;
    await api.delete(`/admin/home-products/${id}`);
    loadHidden();
  };

  if (authLoading || !user) return null;

  const tabs = [
    { id: "pending", label: "ממתינים" },
    { id: "approved", label: "מאושרים" },
    { id: "reports", label: "דיווחים" },
    { id: "hidden", label: "מוסתרים" },
    { id: "stats", label: "סטטיסטיקה" },
  ];

  return (
    <div className="max-w-6xl mx-auto px-4 py-8">
      <h1 className="text-2xl font-bold mb-6">פאנל ניהול</h1>

      {/* Tabs */}
      <div className="flex gap-2 mb-6 overflow-x-auto">
        {tabs.map((t) => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            className={`px-4 py-2 rounded-[12px] text-sm whitespace-nowrap transition ${
              tab === t.id ? "bg-primary text-white" : "bg-white text-text-secondary hover:bg-gray-50"
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* Pending / Approved Producers */}
      {(tab === "pending" || tab === "approved") && (
        <div className="space-y-4">
          {producers.length === 0 && <p className="text-text-secondary text-center py-8">אין יצרנים בקטגוריה זו</p>}
          {producers.map((p) => (
            <div key={p.id} className="bg-white rounded-[12px] p-6 border">
              <div className="flex items-start justify-between">
                <div>
                  <h3 className="font-semibold text-lg">{p.name}</h3>
                  <p className="text-text-secondary text-sm">{p.city} | {p.phone || "ללא טלפון"}</p>
                  <p className="text-sm mt-1">{p.description}</p>
                  <div className="flex gap-1 mt-2">
                    {p.categories?.map((c) => (
                      <span key={c.id} className="text-xs bg-gray-100 px-2 py-1 rounded-full">{c.emoji} {c.name}</span>
                    ))}
                  </div>
                </div>
                {tab === "pending" && (
                  <div className="flex flex-col gap-2 mr-4">
                    <button
                      onClick={() => approve(p.id)}
                      className="bg-primary text-white px-4 py-2 rounded-[12px] text-sm hover:bg-primary-light"
                    >
                      אשר ✓
                    </button>
                    <input
                      placeholder="סיבת דחייה..."
                      value={rejectReason[p.id] || ""}
                      onChange={(e) => setRejectReason({ ...rejectReason, [p.id]: e.target.value })}
                      className="border rounded-[12px] px-2 py-1 text-sm w-40"
                    />
                    <button
                      onClick={() => reject(p.id)}
                      className="bg-red-500 text-white px-4 py-2 rounded-[12px] text-sm hover:bg-red-600"
                    >
                      דחה ✗
                    </button>
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Reports */}
      {tab === "reports" && (
        <div className="space-y-4">
          {reports.length === 0 && <p className="text-text-secondary text-center py-8">אין דיווחים</p>}
          {reports.map((r) => (
            <div key={r.producer_id} className="bg-white rounded-[12px] p-6 border border-red-200">
              <h3 className="font-semibold text-lg">{r.producer_name}</h3>
              <p className="text-red-500 font-medium">{r.report_count} דיווחים</p>
              <div className="mt-3 space-y-2">
                {r.reports.map((rep) => (
                  <div key={rep.id} className="bg-red-50 rounded-[12px] p-3 text-sm">
                    <p>{rep.reason}</p>
                    <p className="text-text-secondary text-xs mt-1">{new Date(rep.created_at).toLocaleDateString("he-IL")}</p>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Hidden Listings */}
      {tab === "hidden" && (
        <div className="space-y-4">
          {hiddenListings.length === 0 && <p className="text-text-secondary text-center py-8">אין מוצרים מוסתרים</p>}
          {hiddenListings.map((hp) => (
            <div key={hp.id} className="bg-white rounded-[12px] p-6 border border-yellow-200">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="font-semibold">{hp.title}</h3>
                  <p className="text-sm text-text-secondary">{hp.seller_name} | {hp.city}</p>
                </div>
                <div className="flex gap-2">
                  <button
                    onClick={() => restoreListing(hp.id)}
                    className="bg-primary text-white px-4 py-2 rounded-[12px] text-sm"
                  >
                    שחזר
                  </button>
                  <button
                    onClick={() => deleteListing(hp.id)}
                    className="bg-red-500 text-white px-4 py-2 rounded-[12px] text-sm"
                  >
                    מחק
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Stats */}
      {tab === "stats" && stats && (
        <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
          {[
            { label: "יצרנים", value: stats.total_producers },
            { label: "ממתינים", value: stats.pending_producers },
            { label: "מאושרים", value: stats.approved_producers },
            { label: "משתמשים", value: stats.total_users },
            { label: "מוצרים ביתיים", value: stats.total_home_products },
            { label: "מוסתרים", value: stats.hidden_home_products },
          ].map((s) => (
            <div key={s.label} className="bg-white rounded-[12px] p-6 text-center border">
              <p className="text-3xl font-bold text-primary">{s.value}</p>
              <p className="text-text-secondary text-sm mt-1">{s.label}</p>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
