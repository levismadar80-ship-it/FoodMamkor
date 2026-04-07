"use client";

import { Suspense, useEffect, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { useAuth } from "@/lib/auth-context";
import api from "@/lib/api";

export default function AdminPageWrapper() {
  return (
    <Suspense fallback={<div className="max-w-7xl mx-auto px-4 py-8">טוען...</div>}>
      <AdminPage />
    </Suspense>
  );
}

function AdminPage() {
  const { user, loading: authLoading } = useAuth();
  const router = useRouter();
  const searchParams = useSearchParams();
  const initialTab = searchParams.get("tab") || "producers";
  const [tab, setTab] = useState(initialTab);

  // Producers tab state
  const [producers, setProducers] = useState([]);
  const [producerSearch, setProducerSearch] = useState("");
  const [producerStatus, setProducerStatus] = useState("all");

  // Other tabs
  const [pendingProducers, setPendingProducers] = useState([]);
  const [reports, setReports] = useState([]);
  const [hiddenListings, setHiddenListings] = useState([]);
  const [stats, setStats] = useState(null);
  const [rejectReason, setRejectReason] = useState({});

  // Import state
  const [importPreview, setImportPreview] = useState(null);
  const [importing, setImporting] = useState(false);
  const [importError, setImportError] = useState("");
  const fileInputRef = useRef(null);

  useEffect(() => {
    if (!authLoading && (!user || user.role !== "admin")) router.push("/login");
  }, [user, authLoading, router]);

  useEffect(() => {
    if (!user || user.role !== "admin") return;
    if (tab === "producers") loadAllProducers();
    else if (tab === "pending") loadPendingProducers();
    else if (tab === "reports") loadReports();
    else if (tab === "hidden") loadHidden();
    else if (tab === "stats") loadStats();
  }, [tab, user, producerStatus]);

  const loadAllProducers = (search = producerSearch) => {
    const params = {};
    if (producerStatus && producerStatus !== "all") params.status = producerStatus;
    if (search) params.search = search;
    api
      .get("/admin/producers", { params })
      .then((r) => setProducers(r.data))
      .catch(() => setProducers([]));
  };

  const loadPendingProducers = () => {
    api.get("/admin/producers?status=pending").then((r) => setPendingProducers(r.data)).catch(() => setPendingProducers([]));
  };

  const loadReports = () => {
    api.get("/admin/reports").then((r) => setReports(r.data)).catch(() => setReports([]));
  };

  const loadHidden = () => {
    api.get("/admin/home-products/hidden").then((r) => setHiddenListings(r.data)).catch(() => setHiddenListings([]));
  };

  const loadStats = () => {
    api.get("/admin/stats").then((r) => setStats(r.data)).catch(() => {});
  };

  const approve = async (id) => {
    await api.post(`/admin/producers/${id}/approve`);
    loadPendingProducers();
  };

  const reject = async (id) => {
    await api.post(`/admin/producers/${id}/reject`, { reason: rejectReason[id] || "" });
    setRejectReason({ ...rejectReason, [id]: "" });
    loadPendingProducers();
  };

  const toggleStatus = async (id) => {
    await api.post(`/admin/producers/${id}/toggle-status`);
    loadAllProducers();
  };

  const deleteProducer = async (id, name) => {
    if (!confirm(`למחוק את "${name}"? פעולה זו אינה הפיכה.`)) return;
    await api.delete(`/admin/producers/${id}`);
    loadAllProducers();
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

  // ----- Excel import -----
  const triggerImport = () => fileInputRef.current?.click();

  const handleImportFile = async (e) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    setImportError("");
    setImporting(true);
    try {
      const fd = new FormData();
      fd.append("file", file);
      const r = await api.post("/admin/producers/import?dry_run=true", fd, {
        headers: { "Content-Type": "multipart/form-data" },
      });
      setImportPreview({ ...r.data, _file: file });
    } catch (err) {
      setImportError(err.response?.data?.detail || "שגיאה בקריאת הקובץ");
    } finally {
      setImporting(false);
    }
  };

  const confirmImport = async () => {
    if (!importPreview?._file) return;
    setImporting(true);
    setImportError("");
    try {
      const fd = new FormData();
      fd.append("file", importPreview._file);
      await api.post("/admin/producers/import?dry_run=false", fd, {
        headers: { "Content-Type": "multipart/form-data" },
      });
      setImportPreview(null);
      loadAllProducers();
    } catch (err) {
      setImportError(err.response?.data?.detail || "שגיאה בייבוא");
    } finally {
      setImporting(false);
    }
  };

  if (authLoading || !user) return null;

  const tabs = [
    { id: "producers", label: "בתי עסק" },
    { id: "pending", label: "ממתינים" },
    { id: "reports", label: "דיווחים" },
    { id: "hidden", label: "מוסתרים" },
    { id: "stats", label: "סטטיסטיקה" },
  ];

  const statusBadge = (status) => {
    const map = {
      approved: { label: "פעיל", cls: "bg-primary text-white" },
      pending: { label: "ממתין", cls: "bg-yellow-100 text-yellow-800" },
      rejected: { label: "נדחה", cls: "bg-red-100 text-red-700" },
      inactive: { label: "מושהה", cls: "bg-gray-200 text-gray-700" },
    };
    const m = map[status] || { label: status, cls: "bg-gray-100" };
    return <span className={`text-xs px-2 py-1 rounded-full ${m.cls}`}>{m.label}</span>;
  };

  return (
    <div className="max-w-7xl mx-auto px-4 py-8">
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

      {/* Producers Tab */}
      {tab === "producers" && (
        <div>
          <div className="flex flex-col md:flex-row gap-3 mb-4">
            <input
              placeholder="חיפוש לפי שם או עיר..."
              value={producerSearch}
              onChange={(e) => setProducerSearch(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && loadAllProducers()}
              className="flex-1 border border-border rounded-[12px] px-3 py-2"
            />
            <select
              value={producerStatus}
              onChange={(e) => setProducerStatus(e.target.value)}
              className="border border-border rounded-[12px] px-3 py-2 bg-white"
            >
              <option value="all">כל הסטטוסים</option>
              <option value="approved">פעילים</option>
              <option value="pending">ממתינים</option>
              <option value="inactive">מושהים</option>
              <option value="rejected">נדחו</option>
            </select>
            <button
              onClick={() => loadAllProducers()}
              className="bg-secondary text-white px-4 py-2 rounded-[12px] hover:bg-secondary-light transition text-sm"
            >
              חפש
            </button>
            <button
              onClick={triggerImport}
              disabled={importing}
              className="bg-white border border-primary text-primary px-4 py-2 rounded-[12px] hover:bg-accent transition text-sm disabled:opacity-50"
            >
              📥 ייבא מ-Excel
            </button>
            <Link
              href="/admin/producers/new"
              className="bg-primary text-white px-4 py-2 rounded-[12px] hover:bg-primary-light transition text-sm whitespace-nowrap"
            >
              + בית עסק חדש
            </Link>
            <input
              ref={fileInputRef}
              type="file"
              accept=".xlsx,.xls,.csv"
              onChange={handleImportFile}
              className="hidden"
            />
          </div>

          {importError && (
            <div className="bg-red-50 border border-red-200 text-red-700 rounded-[12px] p-3 text-sm mb-4">
              {importError}
            </div>
          )}

          {/* Import Preview */}
          {importPreview && (
            <div className="bg-white border border-border rounded-[12px] p-5 mb-6">
              <div className="flex items-center justify-between mb-4">
                <h2 className="font-semibold text-lg">תצוגה מקדימה של הייבוא</h2>
                <div className="flex gap-2">
                  <button
                    onClick={confirmImport}
                    disabled={importing}
                    className="bg-primary text-white px-4 py-2 rounded-[12px] text-sm disabled:opacity-50"
                  >
                    {importing ? "מייבא..." : `אשר ייבוא (${importPreview.imported})`}
                  </button>
                  <button
                    onClick={() => setImportPreview(null)}
                    className="bg-white border border-border px-4 py-2 rounded-[12px] text-sm"
                  >
                    ביטול
                  </button>
                </div>
              </div>
              <div className="grid grid-cols-3 gap-3 mb-4 text-center">
                <div className="bg-green-50 rounded-[12px] p-3">
                  <p className="text-2xl font-bold text-primary">{importPreview.imported}</p>
                  <p className="text-xs text-text-secondary">לייבוא</p>
                </div>
                <div className="bg-yellow-50 rounded-[12px] p-3">
                  <p className="text-2xl font-bold text-yellow-700">{importPreview.skipped}</p>
                  <p className="text-xs text-text-secondary">דולגו</p>
                </div>
                <div className="bg-red-50 rounded-[12px] p-3">
                  <p className="text-2xl font-bold text-red-700">{importPreview.errors}</p>
                  <p className="text-xs text-text-secondary">שגיאות</p>
                </div>
              </div>
              <div className="overflow-x-auto max-h-96 overflow-y-auto border border-border rounded-[8px]">
                <table className="w-full text-sm">
                  <thead className="bg-gray-50 sticky top-0">
                    <tr>
                      <th className="text-right px-3 py-2">שורה</th>
                      <th className="text-right px-3 py-2">שם</th>
                      <th className="text-right px-3 py-2">עיר</th>
                      <th className="text-right px-3 py-2">קטגוריה</th>
                      <th className="text-right px-3 py-2">slug</th>
                      <th className="text-right px-3 py-2">סטטוס</th>
                    </tr>
                  </thead>
                  <tbody>
                    {importPreview.rows.map((row) => (
                      <tr
                        key={row.row_number}
                        className={`border-t ${
                          row.errors.length
                            ? "bg-red-50"
                            : row.warnings.length
                            ? "bg-yellow-50"
                            : ""
                        }`}
                      >
                        <td className="px-3 py-2">{row.row_number}</td>
                        <td className="px-3 py-2">{row.data.name || "—"}</td>
                        <td className="px-3 py-2">{row.data.city || "—"}</td>
                        <td className="px-3 py-2">{row.data.category_name || "—"}</td>
                        <td className="px-3 py-2 font-mono text-xs">{row.data.slug || "—"}</td>
                        <td className="px-3 py-2 text-xs">
                          {row.errors.length > 0 && (
                            <span className="text-red-700">{row.errors.join(", ")}</span>
                          )}
                          {row.errors.length === 0 && row.warnings.length > 0 && (
                            <span className="text-yellow-700">{row.warnings.join(", ")}</span>
                          )}
                          {row.errors.length === 0 && row.warnings.length === 0 && (
                            <span className="text-primary">✓</span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* Producers Table */}
          <div className="bg-white border border-border rounded-[12px] overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="text-right px-4 py-3 font-medium text-text-secondary">שם</th>
                    <th className="text-right px-4 py-3 font-medium text-text-secondary">עיר</th>
                    <th className="text-right px-4 py-3 font-medium text-text-secondary">טלפון</th>
                    <th className="text-right px-4 py-3 font-medium text-text-secondary">קטגוריות</th>
                    <th className="text-right px-4 py-3 font-medium text-text-secondary">תגיות</th>
                    <th className="text-right px-4 py-3 font-medium text-text-secondary">סטטוס</th>
                    <th className="text-right px-4 py-3 font-medium text-text-secondary">פעולות</th>
                  </tr>
                </thead>
                <tbody>
                  {producers.length === 0 && (
                    <tr>
                      <td colSpan={7} className="text-center py-8 text-text-secondary">
                        אין בתי עסק להצגה
                      </td>
                    </tr>
                  )}
                  {producers.map((p) => (
                    <tr key={p.id} className="border-t hover:bg-background/50">
                      <td className="px-4 py-3 font-medium">{p.name}</td>
                      <td className="px-4 py-3 text-text-secondary">{p.city || "—"}</td>
                      <td className="px-4 py-3 text-text-secondary text-xs">{p.phone || "—"}</td>
                      <td className="px-4 py-3 text-xs">
                        {p.categories?.map((c) => c.name).join(", ") || "—"}
                      </td>
                      <td className="px-4 py-3 text-xs">
                        <div className="flex gap-1 flex-wrap">
                          {p.is_verified && <span title="מאומת">✅</span>}
                          {p.organic_certified && <span title="אורגני מוסמך">🌿</span>}
                          {p.grass_fed && <span title="גראס פד">🐄</span>}
                          {p.has_delivery && <span title="משלוחים">🚚</span>}
                          {p.pickup_points && <span title="נקודות איסוף">📦</span>}
                          {p.kosher && <span title={p.kosher}>✡️</span>}
                        </div>
                      </td>
                      <td className="px-4 py-3">{statusBadge(p.status)}</td>
                      <td className="px-4 py-3">
                        <div className="flex gap-2">
                          <Link
                            href={`/admin/producers/${p.id}/edit`}
                            className="text-primary hover:underline text-xs"
                          >
                            עריכה
                          </Link>
                          {(p.status === "approved" || p.status === "inactive") && (
                            <button
                              onClick={() => toggleStatus(p.id)}
                              className="text-text-secondary hover:text-primary text-xs"
                            >
                              {p.status === "approved" ? "השהה" : "הפעל"}
                            </button>
                          )}
                          <button
                            onClick={() => deleteProducer(p.id, p.name)}
                            className="text-red-600 hover:underline text-xs"
                          >
                            מחק
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* Pending Producers (legacy approval flow) */}
      {tab === "pending" && (
        <div className="space-y-4">
          {pendingProducers.length === 0 && (
            <p className="text-text-secondary text-center py-8">אין יצרנים בקטגוריה זו</p>
          )}
          {pendingProducers.map((p) => (
            <div key={p.id} className="bg-white rounded-[12px] p-6 border">
              <div className="flex items-start justify-between">
                <div>
                  <h3 className="font-semibold text-lg">{p.name}</h3>
                  <p className="text-text-secondary text-sm">
                    {p.city} | {p.phone || "ללא טלפון"}
                  </p>
                  <p className="text-sm mt-1">{p.description}</p>
                  <div className="flex gap-1 mt-2">
                    {p.categories?.map((c) => (
                      <span key={c.id} className="text-xs bg-gray-100 px-2 py-1 rounded-full">
                        {c.emoji} {c.name}
                      </span>
                    ))}
                  </div>
                </div>
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
                    <p className="text-text-secondary text-xs mt-1">
                      {new Date(rep.created_at).toLocaleDateString("he-IL")}
                    </p>
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
          {hiddenListings.length === 0 && (
            <p className="text-text-secondary text-center py-8">אין מוצרים מוסתרים</p>
          )}
          {hiddenListings.map((hp) => (
            <div key={hp.id} className="bg-white rounded-[12px] p-6 border border-yellow-200">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="font-semibold">{hp.title}</h3>
                  <p className="text-sm text-text-secondary">
                    {hp.seller_name} | {hp.city}
                  </p>
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
