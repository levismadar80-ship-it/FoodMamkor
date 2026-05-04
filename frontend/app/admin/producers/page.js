"use client";

import React, { Suspense, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import { Cow, Leaf, Package, Seal, Truck } from "@phosphor-icons/react";
import api from "@/lib/api";
import { producerCompleteness } from "@/lib/producer-completeness";
import Pagination from "@/components/Pagination";
import { clampPage } from "@/lib/pagination";
import StoryCardCanvas from "@/components/StoryCardCanvas";
import { exportProducersToCSV } from "@/lib/admin-producers-export";
import AdminProducersImportPreview from "./AdminProducersImportPreview";
import AdminProducersToolbar from "./AdminProducersToolbar";

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
  // MEH-23 — client-side pagination on the admin producers table.
  const [page, setPage] = useState(1);
  const [perPage, setPerPage] = useState(25);
  const [importPreview, setImportPreview] = useState(null);
  const [importing, setImporting] = useState(false);
  const [importError, setImportError] = useState("");
  // MEH-53: which producer's story-card panel is open
  const [storyCardOpenId, setStoryCardOpenId] = useState(null);

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

  const toggleStatus = async (id) => {
    await api.post(`/admin/producers/${id}/toggle-status`);
    loadAllProducers();
  };

  const deleteProducer = async (id, name) => {
    if (!confirm(`למחוק את "${name}"? פעולה זו אינה הפיכה.`)) return;
    await api.delete(`/admin/producers/${id}`);
    loadAllProducers();
  };

  const toggleAmbassador = async (id, current) => {
    await api.post(`/admin/producers/${id}/set-ambassador`, { ambassador: !current });
    loadAllProducers();
  };

  const exportExcel = () => exportProducersToCSV(producers);

  // ----- Excel import -----
  const handleImportFile = async (file) => {
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
      pending_whatsapp: { label: "ממתין — וואטסאפ", cls: "bg-orange-100 text-orange-800" },
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
  // MEH-23 — paginate the filtered list. Re-clamp whenever visible or
  // perPage changes so a filter reducing the list doesn't leave the
  // user stranded on an out-of-range page.
  const totalPages = Math.max(1, Math.ceil(visible.length / perPage));
  const safePage = clampPage(page, totalPages);
  const pagedVisible = visible.slice(
    (safePage - 1) * perPage,
    safePage * perPage,
  );

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">בתי עסק</h1>
        <span className="text-sm text-text-secondary">{visible.length} רשומות</span>
      </div>

      <AdminProducersToolbar
        producerSearch={producerSearch}
        setProducerSearch={setProducerSearch}
        producerStatus={producerStatus}
        setProducerStatus={setProducerStatus}
        incompleteOnly={incompleteOnly}
        setIncompleteOnly={setIncompleteOnly}
        incompleteCount={incompleteCount}
        importing={importing}
        onSearch={loadAllProducers}
        onExport={exportExcel}
        onImportFile={handleImportFile}
      />

      {importError && (
        <div className="bg-red-50 border border-red-200 text-red-700 rounded-[12px] p-3 text-sm">{importError}</div>
      )}

      {importPreview && (
        <AdminProducersImportPreview
          preview={importPreview}
          importing={importing}
          onConfirm={confirmImport}
          onCancel={() => setImportPreview(null)}
        />
      )}

      {/* Table */}
      <div className="bg-white border border-border rounded-[12px] overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-gray-50">
              <tr>
                <th className="text-end px-4 py-3 font-medium text-text-secondary">שם</th>
                <th className="text-end px-4 py-3 font-medium text-text-secondary">עיר</th>
                <th className="text-end px-4 py-3 font-medium text-text-secondary">קטגוריות</th>
                <th className="text-end px-4 py-3 font-medium text-text-secondary">תגיות</th>
                <th className="text-end px-4 py-3 font-medium text-text-secondary">סטטוס</th>
                <th className="text-end px-4 py-3 font-medium text-text-secondary">פעולות</th>
              </tr>
            </thead>
            <tbody>
              {pagedVisible.length === 0 && (
                <tr>
                  <td colSpan={6} className="text-center py-8 text-text-secondary">
                    {incompleteOnly ? "כל בתי העסק שלמים 🎉" : "אין בתי עסק להצגה"}
                  </td>
                </tr>
              )}
              {pagedVisible.map((p) => {
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
                <React.Fragment key={p.id}>
                <tr className="border-t hover:bg-background/50">
                  <td className="px-4 py-3 font-medium">
                    <div className="flex items-center gap-2">
                      {badge}
                      <span>{p.name}</span>
                    </div>
                  </td>
                  <td className="px-4 py-3 text-text-secondary">{p.city || "—"}</td>
                  <td className="px-4 py-3 text-xs">{p.categories?.map((c) => c.name).join(", ") || "—"}</td>
                  <td className="px-4 py-3 text-xs">
                    <div className="flex gap-1 flex-wrap">
                      {p.is_verified && <span title="מאומת"><Seal size={16} weight="fill" className="text-primary" aria-hidden="true" /></span>}
                      {p.organic_certified && <span title="אורגני מוסמך"><Leaf size={16} weight="duotone" className="text-primary" aria-hidden="true" /></span>}
                      {p.grass_fed && <span title="גראס פד"><Cow size={16} weight="duotone" className="text-primary" aria-hidden="true" /></span>}
                      {p.has_delivery && <span title="משלוחים"><Truck size={16} weight="duotone" className="text-primary" aria-hidden="true" /></span>}
                      {p.pickup_points && <span title="נקודות איסוף"><Package size={16} weight="duotone" className="text-primary" aria-hidden="true" /></span>}
                      {p.kosher && <span title={p.kosher}>✡️</span>}
                    </div>
                  </td>
                  <td className="px-4 py-3">{statusBadge(p.status)}</td>
                  <td className="px-4 py-3">
                    <div className="flex gap-3 flex-wrap">
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
                      {(p.status === "approved" || p.status === "inactive") && (
                        <button onClick={() => toggleStatus(p.id)} className="text-text-secondary hover:text-primary text-xs">
                          {p.status === "approved" ? "השהה" : "הפעל"}
                        </button>
                      )}
                      {p.status === "approved" && (
                        <button
                          onClick={() => toggleAmbassador(p.id, p.ambassador)}
                          className={`text-xs ${p.ambassador ? "text-amber-700 hover:text-amber-900" : "text-site-muted hover:text-primary"}`}
                          title={p.ambassador ? "הסר תפקיד שגרירה" : "הגדר כשגרירה"}
                        >
                          {p.ambassador ? "⭐ שגרירה" : "☆ שגריר"}
                        </button>
                      )}
                      {p.status === "approved" && p.slug && (
                        <button
                          onClick={() => setStoryCardOpenId((prev) => prev === p.id ? null : p.id)}
                          className="text-[#4cb08b] hover:underline text-xs"
                          title="צור כרטיס אינסטגרם"
                        >
                          📸 סטורי
                        </button>
                      )}
                      <button onClick={() => deleteProducer(p.id, p.name)} className="text-red-600 hover:underline text-xs">
                        מחק
                      </button>
                    </div>
                  </td>
                </tr>
                {storyCardOpenId === p.id && (
                  <tr>
                    <td colSpan={6} className="px-6 pb-5 bg-background/60">
                      <StoryCardCanvas
                        producer={p}
                        onUploaded={(url) => {
                          setProducers((prev) =>
                            prev.map((pr) => pr.id === p.id ? { ...pr, story_card_url: url } : pr)
                          );
                        }}
                      />
                    </td>
                  </tr>
                )}
                </React.Fragment>
                );
              })}
            </tbody>
          </table>
        </div>
        {/* MEH-23 — numbered pagination + per-page selector. */}
        {visible.length > perPage && (
          <div className="px-4 py-3 border-t border-border">
            <Pagination
              page={safePage}
              totalPages={totalPages}
              onChange={setPage}
              perPage={perPage}
              onPerPageChange={(n) => {
                setPerPage(n);
                setPage(1);
              }}
            />
          </div>
        )}
      </div>
    </div>
  );
}
