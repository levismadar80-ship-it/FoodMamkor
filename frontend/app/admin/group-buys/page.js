"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import api from "@/lib/api";

const STATUS_LABELS = {
  open: { label: "פתוחה", cls: "bg-blue-50 text-blue-700" },
  funded: { label: "ממומנת", cls: "bg-[#EAF3DE] text-primary" },
  cancelled: { label: "בוטלה", cls: "bg-gray-100 text-gray-500" },
  fulfilled: { label: "הושלמה", cls: "bg-light text-primary" },
};

const STATUS_OPTIONS = ["open", "funded", "cancelled", "fulfilled"];

export default function AdminGroupBuysPage() {
  const [items, setItems] = useState(null);
  const [statusFilter, setStatusFilter] = useState("");
  const [updating, setUpdating] = useState(null);
  const [error, setError] = useState("");

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [statusFilter]);

  const load = async () => {
    try {
      const params = statusFilter ? { status: statusFilter } : {};
      const r = await api.get("/admin/group-buys", { params });
      setItems(r.data);
    } catch (err) {
      setError(err.response?.data?.detail || "שגיאה בטעינת נתונים");
    }
  };

  const updateStatus = async (id, newStatus) => {
    setUpdating(id);
    try {
      await api.patch(`/admin/group-buys/${id}/status`, null, { params: { status: newStatus } });
      await load();
    } catch (err) {
      setError(err.response?.data?.detail || "שגיאה בעדכון סטטוס");
    } finally {
      setUpdating(null);
    }
  };

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <Link href="/admin" className="text-sm text-primary hover:underline">
            ← לוח אדמין
          </Link>
          <h1 className="font-headline text-2xl font-bold text-site-text mt-1">
            קבוצות רכש
          </h1>
        </div>
      </div>

      {error && (
        <div className="bg-red-50 border border-red-200 text-red-700 rounded-[10px] px-4 py-3 mb-4 text-sm">
          {error}
        </div>
      )}

      {/* Status filter */}
      <div className="flex gap-2 mb-6 flex-wrap">
        <button
          onClick={() => setStatusFilter("")}
          className={`px-4 py-1.5 rounded-full text-sm border transition ${
            !statusFilter ? "bg-primary text-white border-primary" : "bg-white text-site-muted border-border"
          }`}
        >
          הכל
        </button>
        {STATUS_OPTIONS.map((s) => (
          <button
            key={s}
            onClick={() => setStatusFilter(s)}
            className={`px-4 py-1.5 rounded-full text-sm border transition ${
              statusFilter === s ? "bg-primary text-white border-primary" : "bg-white text-site-muted border-border"
            }`}
          >
            {STATUS_LABELS[s]?.label || s}
          </button>
        ))}
      </div>

      {items === null ? (
        <div className="text-center py-16 text-site-muted">טוענת...</div>
      ) : items.length === 0 ? (
        <div className="text-center py-16 text-site-muted">
          <p className="text-4xl mb-3">🛒</p>
          <p>אין קבוצות רכש</p>
        </div>
      ) : (
        <div className="space-y-4">
          {items.map((gb) => {
            const s = STATUS_LABELS[gb.status] || { label: gb.status, cls: "bg-gray-100 text-gray-600" };
            const pct = Math.min(100, Math.round((gb.commits_count / gb.min_participants) * 100));
            return (
              <div key={gb.id} className="bg-white rounded-[14px] border border-border p-5">
                <div className="flex items-start justify-between gap-3 mb-2">
                  <div>
                    <h2 className="font-semibold text-site-text">{gb.title}</h2>
                    <p className="text-xs text-site-muted">{gb.producer_name} · {gb.city}</p>
                  </div>
                  <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${s.cls}`}>
                    {s.label}
                  </span>
                </div>

                <div className="flex items-center gap-4 text-sm mb-3">
                  <span className="font-bold text-primary">₪{Number(gb.price_per_unit_group).toFixed(0)}</span>
                  <span className="text-site-muted line-through">₪{Number(gb.price_per_unit_regular).toFixed(0)}</span>
                  <span className="text-site-muted">|</span>
                  <span className="text-site-muted">
                    {gb.commits_count} / {gb.min_participants} · {pct}%
                  </span>
                  <span className="text-site-muted">|</span>
                  <span className="text-site-muted text-xs">
                    עד {new Date(gb.deadline).toLocaleDateString("he-IL")}
                  </span>
                </div>

                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-xs text-site-muted me-2">שנה סטטוס:</span>
                  {STATUS_OPTIONS.filter((opt) => opt !== gb.status).map((opt) => (
                    <button
                      key={opt}
                      onClick={() => updateStatus(gb.id, opt)}
                      disabled={updating === gb.id}
                      className="text-xs border border-border px-3 py-1 rounded-full hover:border-primary hover:text-primary transition disabled:opacity-50"
                    >
                      {STATUS_LABELS[opt]?.label || opt}
                    </button>
                  ))}
                  <Link
                    href={`/group-buys/${gb.id}`}
                    target="_blank"
                    className="text-xs text-primary hover:underline ms-auto"
                  >
                    צפי בדף ←
                  </Link>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
