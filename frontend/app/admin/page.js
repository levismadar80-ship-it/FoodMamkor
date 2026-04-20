"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import api from "@/lib/api";

export default function AdminDashboard() {
  const [data, setData] = useState(null);
  const [error, setError] = useState("");

  useEffect(() => {
    api.get("/admin/dashboard")
      .then((r) => setData(r.data))
      .catch((e) => setError(e.response?.data?.detail || "שגיאה בטעינת המידע"));
  }, []);

  if (error) {
    return <div className="bg-red-50 border border-red-200 text-red-700 rounded-[12px] p-4">{error}</div>;
  }
  if (!data) {
    return <div className="text-text-secondary">טוען...</div>;
  }

  const s = data.stats;
  const cards = [
    { label: "סה״כ בתי עסק",      value: s.total_producers,     icon: "🏪", href: "/admin/producers" },
    { label: "ממתינים לאישור",   value: s.pending_producers,   icon: "⏳", href: "/admin/producers?status=pending", warn: s.pending_producers > 0 },
    { label: "משתמשים רשומים",   value: s.total_users,         icon: "👥", href: "/admin/users" },
    { label: "פניות חדשות",       value: s.unread_contact_count || 0, icon: "📬", href: "/admin/contact", warn: (s.unread_contact_count || 0) > 0 },
  ];

  // Simple inline SVG line chart for monthly producers
  const months = data.monthly_producers || [];
  const maxV = Math.max(1, ...months.map((m) => m.producers));
  const W = 280;
  const H = 90;
  const stepX = months.length > 1 ? W / (months.length - 1) : 0;
  const points = months
    .map((m, i) => {
      const x = i * stepX;
      const y = H - (m.producers / maxV) * (H - 10) - 5;
      return `${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join(" ");

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">לוח מחוונים</h1>
        <p className="text-text-secondary text-sm mt-1">סקירה כללית של הפלטפורמה</p>
      </div>

      {/* Stat cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {cards.map((c) => (
          <Link
            key={c.label}
            href={c.href}
            className={`bg-white border rounded-[12px] p-4 hover:shadow-sm transition ${
              c.warn ? "border-yellow-300 bg-yellow-50" : "border-border"
            }`}
          >
            <div className="flex items-start justify-between">
              <span className="text-2xl">{c.icon}</span>
              <span className="text-3xl font-bold text-primary">{c.value}</span>
            </div>
            <p className="text-xs text-text-secondary mt-2">{c.label}</p>
          </Link>
        ))}
      </div>

      {/* Alerts */}
      {(s.pending_producers > 0 || s.open_reports > 0 || s.hidden_home_products > 0 || (s.unread_contact_count || 0) > 0) && (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          {s.pending_producers > 0 && (
            <Link
              href="/admin/producers?status=pending"
              className="bg-yellow-50 border border-yellow-200 rounded-[12px] p-4 flex items-center gap-3 hover:bg-yellow-100 transition"
            >
              <span className="text-2xl">⏳</span>
              <div>
                <p className="font-medium text-sm">{s.pending_producers} בתי עסק ממתינים לאישור</p>
                <p className="text-xs text-text-secondary">לחץ לטיפול</p>
              </div>
            </Link>
          )}
          {s.open_reports > 0 && (
            <Link
              href="/admin/reports"
              className="bg-red-50 border border-red-200 rounded-[12px] p-4 flex items-center gap-3 hover:bg-red-100 transition"
            >
              <span className="text-2xl">🚨</span>
              <div>
                <p className="font-medium text-sm">{s.open_reports} דיווחים פתוחים</p>
                <p className="text-xs text-text-secondary">דורש בדיקה</p>
              </div>
            </Link>
          )}
          {s.hidden_home_products > 0 && (
            <Link
              href="/admin/content"
              className="bg-orange-50 border border-orange-200 rounded-[12px] p-4 flex items-center gap-3 hover:bg-orange-100 transition"
            >
              <span className="text-2xl">📦</span>
              <div>
                <p className="font-medium text-sm">{s.hidden_home_products} מוצרים ביתיים מוסתרים</p>
                <p className="text-xs text-text-secondary">לבדיקה</p>
              </div>
            </Link>
          )}
          {(s.unread_contact_count || 0) > 0 && (
            <Link
              href="/admin/contact"
              className="bg-blue-50 border border-blue-200 rounded-[12px] p-4 flex items-center gap-3 hover:bg-blue-100 transition"
            >
              <span className="text-2xl">📬</span>
              <div>
                <p className="font-medium text-sm">{s.unread_contact_count} פניות שלא נקראו</p>
                <p className="text-xs text-text-secondary">לצפייה</p>
              </div>
            </Link>
          )}
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* Mini chart */}
        <div className="bg-white border border-border rounded-[12px] p-5">
          <h2 className="font-semibold mb-3">בתי עסק חדשים — 6 חודשים אחרונים</h2>
          <svg viewBox={`0 0 ${W} ${H + 20}`} className="w-full h-32">
            <polyline
              fill="none"
              stroke="#2e6853"
              strokeWidth="2"
              points={points}
            />
            {months.map((m, i) => {
              const x = i * stepX;
              const y = H - (m.producers / maxV) * (H - 10) - 5;
              return (
                <g key={m.month}>
                  <circle cx={x} cy={y} r="3" fill="#2e6853" />
                  <text x={x} y={H + 15} fontSize="9" textAnchor="middle" fill="#6b6b6b">
                    {m.month.slice(5)}
                  </text>
                </g>
              );
            })}
          </svg>
        </div>

        {/* Pending preview */}
        <div className="bg-white border border-border rounded-[12px] p-5">
          <div className="flex items-center justify-between mb-3">
            <h2 className="font-semibold">בקשות ממתינות</h2>
            <Link href="/admin/producers?status=pending" className="text-primary text-xs hover:underline">
              צפה בכל →
            </Link>
          </div>
          {data.pending_producers.length === 0 ? (
            <p className="text-sm text-text-secondary">אין בקשות ממתינות 🎉</p>
          ) : (
            <ul className="space-y-2">
              {data.pending_producers.map((p) => (
                <li key={p.id} className="flex items-center justify-between text-sm py-1.5 border-b border-border last:border-0">
                  <div>
                    <p className="font-medium">{p.name}</p>
                    <p className="text-xs text-text-secondary">{p.city || "—"}</p>
                  </div>
                  <Link
                    href={`/admin/producers/${p.id}/edit`}
                    className="text-xs text-primary hover:underline"
                  >
                    בדוק
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>

      {/* Activity feed */}
      <div className="bg-white border border-border rounded-[12px] p-5">
        <h2 className="font-semibold mb-3">פעילות אחרונה</h2>
        <ul className="space-y-2">
          {data.recent_activity.map((a) => (
            <li key={a.id} className="flex items-center justify-between text-sm py-1.5 border-b border-border last:border-0">
              <div className="flex items-center gap-2">
                <span>🆕</span>
                <span>נוסף בית עסק:</span>
                <Link href={`/admin/producers/${a.id}/edit`} className="font-medium text-primary hover:underline">
                  {a.name}
                </Link>
                <span className="text-xs text-text-secondary">({a.status})</span>
              </div>
              <span className="text-xs text-text-secondary">
                {a.created_at ? new Date(a.created_at).toLocaleDateString("he-IL") : ""}
              </span>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
