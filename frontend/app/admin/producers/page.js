"use client";

import { Suspense, useEffect, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import api from "@/lib/api";
import { producerCompleteness } from "@/lib/producer-completeness";

export default function ProducersPageWrapper() {
  return (
    <Suspense fallback={<div className="text-text-secondary">טוען...</div>}>
      <ProducersAdminPage />
    </Suspense>
  );
}

function ProducersAdminPage() {
  const searchParams = useSearchParams();
  const initialStatus = searchParams.get("status") || "all";

  const [producers, setProducers] = useState([]);
  const [producerSearch, setProducerSearch] = useState("");
  const [producerStatus, setProducerStatus] = useState(initialStatus);
  const [incompleteOnly, setIncompleteOnly] = useState(false);
  const [importPreview, setImportPreview] = useState(null);
  const [importing, setImporting] = useState(false);
  const [importError, setImportError] = useState("");
  const fileInputRef = useRef(null);

  useEffect(() => {
    loadAllProducers();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [producerStatus]);

  const loadAllProducers = (search = producerSearch) => {
    const params = {};
    if (producerStatus && producerStatus !== "all") params.status = producerStatus;
    if (search) params.search = search;
    api.get("/admin/producers", { params }).then((r) => setProducers(r.data)).catch(() => setProducers([]));
  };

  const quickApprove = async (id) => {
    await api.post(`/admin/producers/${id}/approve`);
    loadAllProducers();
  };

  const upgradePlan = async (id) => {
    await api.put(`/admin/producers/${id}`, { plan: "premium" });
    loadAllProducers();
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

  const exportExcel = () => {
    // Build CSV from current visible rows (BOM for Excel UTF-8)
    const headers = ["שם", "עיר", "טלפון", "אינסטגרם", "אתר", "סטטוס", "slug"];
    const rows = producers.map((p) => [
      p.name, p.city || "", p.phone || "", p.instagram || "", p.website || "", p.status, p.slug || "",
    ]);
    const csv = "\uFEFF" + [headers, ...rows]
      .map((r) => r.map((v) => `"${String(v).replace(/"/g, '""')}"`).join(","))
      .join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `producers-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
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

  // Annotate every producer with its completeness report once per render.
  const annotated = producers.map((p) => ({ ...p, _completeness: producerCompleteness(p) }));
  const incompleteCount = annotated.filter((p) => p._completeness.priority !== "green").length;
  const visible = incompleteOnly
    ? annotated.filter((p) => p._completeness.priority !== "green")
    : annotated;

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">בתי עסק</h1>
        <span className="text-sm text-text-secondary">{visible.length} רשומות</span>
      </div>

      {/* Toolbar */}
      <div className="flex flex-col md:flex-row gap-3">
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
        <button onClick={() => loadAllProducers()} className="bg-secondary text-white px-4 py-2 rounded-[12px] text-sm">
          חפש
        </button>
        <button
          onClick={() => setIncompleteOnly((v) => !v)}
          className={`px-4 py-2 rounded-[12px] text-sm border whitespace-nowrap transition ${
            incompleteOnly
              ? "bg-yellow-100 border-yellow-400 text-yellow-800"
              : "bg-white border-border text-text-secondary hover:border-yellow-400"
          }`}
          title="הצג רק עסקים שחסרים להם פרטים נדרשים"
        >
          ⚠️ {incompleteOnly ? "הצג הכל" : "פרטים חסרים"}
          {incompleteCount > 0 && (
            <span className="mr-2 inline-flex items-center justify-center min-w-[1.5rem] h-5 px-1.5 rounded-full bg-yellow-500 text-white text-xs font-bold">
              {incompleteCount}
            </span>
          )}
        </button>
        <button onClick={exportExcel} className="bg-white border border-border px-4 py-2 rounded-[12px] text-sm">
          📤 ייצוא
        </button>
        <button
          onClick={triggerImport}
          disabled={importing}
          className="bg-white border border-primary text-primary px-4 py-2 rounded-[12px] text-sm disabled:opacity-50"
        >
          📥 ייבא מ-Excel
        </button>
        <Link
          href="/admin/producers/new"
          className="bg-primary text-white px-4 py-2 rounded-[12px] text-sm whitespace-nowrap text-center"
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
        <div className="bg-red-50 border border-red-200 text-red-700 rounded-[12px] p-3 text-sm">{importError}</div>
      )}

      {/* Import preview */}
      {importPreview && (
        <div className="bg-white border border-border rounded-[12px] p-5">
          <div className="flex items-center justify-between mb-4">
            <h2 className="font-semibold text-lg">תצוגה מקדימה של הייבוא</h2>
            <div className="flex gap-2">
              <button onClick={confirmImport} disabled={importing} className="bg-primary text-white px-4 py-2 rounded-[12px] text-sm disabled:opacity-50">
                {importing ? "מייבא..." : `אשר ייבוא (${importPreview.imported})`}
              </button>
              <button onClick={() => setImportPreview(null)} className="bg-white border border-border px-4 py-2 rounded-[12px] text-sm">
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
                    className={`border-t ${row.errors.length ? "bg-red-50" : row.warnings.length ? "bg-yellow-50" : ""}`}
                  >
                    <td className="px-3 py-2">{row.row_number}</td>
                    <td className="px-3 py-2">{row.data.name || "—"}</td>
                    <td className="px-3 py-2">{row.data.city || "—"}</td>
                    <td className="px-3 py-2">{row.data.category_name || "—"}</td>
                    <td className="px-3 py-2 font-mono text-xs">{row.data.slug || "—"}</td>
                    <td className="px-3 py-2 text-xs">
                      {row.errors.length > 0 && <span className="text-red-700">{row.errors.join(", ")}</span>}
                      {row.errors.length === 0 && row.warnings.length > 0 && <span className="text-yellow-700">{row.warnings.join(", ")}</span>}
                      {row.errors.length === 0 && row.warnings.length === 0 && <span className="text-primary">✓</span>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Table */}
      <div className="bg-white border border-border rounded-[12px] overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-gray-50">
              <tr>
                <th className="text-right px-4 py-3 font-medium text-text-secondary">שם</th>
                <th className="text-right px-4 py-3 font-medium text-text-secondary">עיר</th>
                <th className="text-right px-4 py-3 font-medium text-text-secondary">קטגוריות</th>
                <th className="text-right px-4 py-3 font-medium text-text-secondary">תגיות</th>
                <th className="text-right px-4 py-3 font-medium text-text-secondary">סטטוס</th>
                <th className="text-right px-4 py-3 font-medium text-text-secondary">פעולות</th>
              </tr>
            </thead>
            <tbody>
              {visible.length === 0 && (
                <tr>
                  <td colSpan={6} className="text-center py-8 text-text-secondary">
                    {incompleteOnly ? "כל בתי העסק שלמים 🎉" : "אין בתי עסק להצגה"}
                  </td>
                </tr>
              )}
              {visible.map((p) => {
                const { missing, priority } = p._completeness;
                const badge =
                  priority === "red" ? (
                    <span
                      title={`חסרים פרטים: ${missing.join(", ")}`}
                      className="inline-flex items-center text-base leading-none cursor-help"
                      aria-label="חסרים פרטים קריטיים"
                    >
                      🔴
                    </span>
                  ) : priority === "yellow" ? (
                    <span
                      title={`חסרים פרטים: ${missing.join(", ")}`}
                      className="inline-flex items-center text-base leading-none cursor-help"
                      aria-label="חסרים פרטים"
                    >
                      🟡
                    </span>
                  ) : (
                    <span
                      title="כל הפרטים מולאו"
                      className="inline-flex items-center text-base leading-none cursor-help opacity-60"
                      aria-label="שלם"
                    >
                      🟢
                    </span>
                  );
                return (
                <tr key={p.id} className="border-t hover:bg-background/50">
                  <td className="px-4 py-3 font-medium">
                    <div className="flex items-center gap-2">
                      {badge}
                      <span>{p.name}</span>
                    </div>
                  </td>
                  <td className="px-4 py-3 text-text-secondary">{p.city || "—"}</td>
                  <td className="px-4 py-3 text-xs">{p.categories?.map((c) => c.name).join(", ") || "—"}</td>
                  <td className="px-4 py-3 text-xs">
                    <div className="flex gap-1 flex-wrap items-center">
                      {p.plan === "premium" ? (
                        <span className="rounded-full px-2 py-0.5 text-xs font-medium bg-primary text-white">פרמיום</span>
                      ) : (
                        <span className="rounded-full px-2 py-0.5 text-xs font-medium bg-gray-200 text-gray-700">חינם</span>
                      )}
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
                    <div className="flex gap-3">
                      {p.status === "pending" && (
                        <button onClick={() => quickApprove(p.id)} className="text-primary hover:underline text-xs font-medium">
                          ✓ אשר
                        </button>
                      )}
                      <Link href={`/admin/producers/${p.id}/edit`} className="text-primary hover:underline text-xs">
                        עריכה
                      </Link>
                      {p.slug && (
                        <Link href={`/${p.slug}`} target="_blank" className="text-text-secondary hover:text-primary text-xs">
                          צפה
                        </Link>
                      )}
                      {p.plan === "free" && p.status === "approved" && (
                        <button onClick={() => upgradePlan(p.id)} className="text-primary hover:underline text-xs font-medium">
                          שדרגי לפרמיום
                        </button>
                      )}
                      {(p.status === "approved" || p.status === "inactive") && (
                        <button onClick={() => toggleStatus(p.id)} className="text-text-secondary hover:text-primary text-xs">
                          {p.status === "approved" ? "השהה" : "הפעל"}
                        </button>
                      )}
                      <button onClick={() => deleteProducer(p.id, p.name)} className="text-red-600 hover:underline text-xs">
                        מחק
                      </button>
                    </div>
                  </td>
                </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
