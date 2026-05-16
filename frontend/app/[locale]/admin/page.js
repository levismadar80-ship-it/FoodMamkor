"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import {
  CalendarBlank,
  CookingPot,
  HourglassSimple,
  Package,
  Sparkle,
  Storefront,
  Users,
  Warning,
} from "@phosphor-icons/react";
import api from "@/lib/api";
import { getProducerStatusLabel } from "@/lib/producer-status";
import InfoTooltip from "@/components/InfoTooltip";

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
    { label: "סה״כ בתי עסק",      value: s.total_producers,     Icon: Storefront, href: "/admin/producers" },
    { label: "ממתינים לאישור",   value: s.pending_producers,   Icon: HourglassSimple, href: "/admin/producers?status=pending", warn: s.pending_producers > 0 },
    { label: "משתמשים רשומים",   value: s.total_users,         Icon: Users, href: "/admin/users" },
    { label: "מוצרים ביתיים",     value: s.total_home_products, Icon: CookingPot, href: "/admin/content" },
    { label: "קבוצות רכש",       value: "›",                   Icon: Package, href: "/admin/group-buys" },
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
              <c.Icon size={28} weight="duotone" aria-hidden="true" className="text-primary" />
              <span className="text-3xl font-bold text-primary">{c.value}</span>
            </div>
            <p className="text-xs text-text-secondary mt-2">
              {c.label}
              {c.label === "קבוצות רכש" && (
                <span
                  onClick={(e) => e.stopPropagation()}
                  onMouseDown={(e) => e.stopPropagation()}
                  onPointerDown={(e) => e.stopPropagation()}
                >
                  <InfoTooltip
                    content="ניהול קבוצות רכש של משתמשות. לא פעיל כרגע."
                    label="מידע על קבוצות רכש"
                    position="bottom"
                  />
                </span>
              )}
            </p>
          </Link>
        ))}
      </div>

      {/* Alerts */}
      {(s.pending_producers > 0 || s.open_reports > 0 || s.hidden_home_products > 0) && (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          {s.pending_producers > 0 && (
            <Link
              href="/admin/producers?status=pending"
              className="bg-yellow-50 border border-yellow-200 rounded-[12px] p-4 flex items-center gap-3 hover:bg-yellow-100 transition"
            >
              <HourglassSimple size={28} weight="duotone" aria-hidden="true" className="text-yellow-600" />
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
              <Warning size={28} weight="fill" aria-hidden="true" className="text-red-500" />
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
              <Package size={28} weight="duotone" aria-hidden="true" className="text-orange-500" />
              <div>
                <p className="font-medium text-sm">{s.hidden_home_products} מוצרים ביתיים מוסתרים</p>
                <p className="text-xs text-text-secondary">לבדיקה</p>
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
          {(data.pending_producers || []).length === 0 ? (
            <p className="text-sm text-text-secondary">אין בקשות ממתינות</p>
          ) : (
            <ul className="space-y-2">
              {(data.pending_producers || []).map((p) => (
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
        {(data.recent_activity || []).length === 0 && (
          <p className="text-sm text-text-secondary">אין נתונים להצגה</p>
        )}
        <ul className="space-y-2">
          {(data.recent_activity || []).map((a) => (
            <li key={a.id} className="flex items-center justify-between text-sm py-1.5 border-b border-border last:border-0">
              <div className="flex items-center gap-2">
                <span>🆕</span>
                <span>נוסף בית עסק:</span>
                <Link href={`/admin/producers/${a.id}/edit`} className="font-medium text-primary hover:underline">
                  {a.name}
                </Link>
                <span className="text-xs text-text-secondary">({getProducerStatusLabel(a.status)})</span>
              </div>
              <span className="text-xs text-text-secondary">
                {a.created_at ? new Date(a.created_at).toLocaleDateString("he-IL") : ""}
              </span>
            </li>
          ))}
        </ul>
      </div>

      {/* ======== feature/producer-analytics extension ======== */}

      {/* Secondary stats row — weekly deltas + events + experiences */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <DeltaCard
          label="משתמשים חדשים השבוע"
          value={s.new_users_this_week || 0}
          total={s.total_users || 0}
          Icon={Users}
        />
        <DeltaCard
          label="עסקים חדשים השבוע"
          value={s.new_producers_this_week || 0}
          total={s.total_producers || 0}
          Icon={Storefront}
        />
        <SimpleStat
          label="אירועים"
          value={s.total_events || 0}
          Icon={CalendarBlank}
          href="/admin/content"
        />
        <SimpleStat
          label="חוויות"
          value={s.total_experiences || 0}
          Icon={Sparkle}
          href="/admin/experiences"
        />
      </div>

      {/* DAU + top cities */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="bg-white border border-border rounded-[12px] p-5">
          <h2 className="font-semibold mb-3">משתמשים פעילים — 30 ימים אחרונים</h2>
          <DauLineChart data={data.daily_active_users || []} />
        </div>
        <div className="bg-white border border-border rounded-[12px] p-5">
          <h2 className="font-semibold mb-3">ערים מובילות</h2>
          <TopCitiesList data={data.top_cities || []} />
        </div>
      </div>

      {/* Server health */}
      <ServerHealthPanel health={data.server_health} />
    </div>
  );
}

function DeltaCard({ label, value, total, Icon }) {
  return (
    <div className="bg-white border border-border rounded-[12px] p-4">
      <div className="flex items-start justify-between mb-1">
        <Icon size={24} weight="duotone" aria-hidden="true" className="text-primary" />
        <span className="text-3xl font-bold text-primary">+{value}</span>
      </div>
      <p className="text-xs text-text-secondary">{label}</p>
      <p className="text-xs text-text-secondary">מתוך {total} סה״כ</p>
    </div>
  );
}

function SimpleStat({ label, value, Icon, href }) {
  return (
    <Link
      href={href}
      className="bg-white border border-border rounded-[12px] p-4 hover:shadow-sm transition block"
    >
      <div className="flex items-start justify-between mb-1">
        <Icon size={24} weight="duotone" aria-hidden="true" className="text-primary" />
        <span className="text-3xl font-bold text-primary">{value}</span>
      </div>
      <p className="text-xs text-text-secondary">{label}</p>
    </Link>
  );
}

/**
 * Inline SVG line chart for daily active users over the last 30 days.
 * Matches the admin/page.js monthly_producers chart pattern — no chart
 * library, zero new dependencies.
 */
function DauLineChart({ data }) {
  if (!data || data.length === 0) {
    return <p className="text-sm text-text-secondary">אין נתונים עדיין</p>;
  }
  const W = 320;
  const H = 110;
  const pad = 8;
  const maxV = Math.max(1, ...data.map((d) => d.count));
  const stepX = data.length > 1 ? (W - pad * 2) / (data.length - 1) : 0;
  const points = data
    .map((d, i) => {
      const x = pad + i * stepX;
      const y = H - pad - (d.count / maxV) * (H - pad * 2);
      return `${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join(" ");
  const labelIndexes = [0, Math.floor(data.length / 2), data.length - 1];

  return (
    <svg viewBox={`0 0 ${W} ${H + 20}`} className="w-full h-36" role="img" aria-label="DAU 30 days">
      <polyline fill="none" stroke="#2e6853" strokeWidth="2" points={points} />
      {data.map((d, i) => {
        const x = pad + i * stepX;
        const y = H - pad - (d.count / maxV) * (H - pad * 2);
        return (
          <g key={d.date}>
            <circle cx={x} cy={y} r={d.count > 0 ? 2.5 : 1.5} fill="#2e6853" />
            {labelIndexes.includes(i) && (
              <text x={x} y={H + 14} fontSize="9" textAnchor="middle" fill="#6b6b6b">
                {d.date.slice(5)}
              </text>
            )}
          </g>
        );
      })}
    </svg>
  );
}

function TopCitiesList({ data }) {
  if (!data || data.length === 0) {
    return (
      <p className="text-sm text-text-secondary">
        עוד אין נתוני ערים — לקוחות שלא התחברו לא מדווחים עיר.
      </p>
    );
  }
  const maxV = Math.max(1, ...data.map((d) => d.count));
  return (
    <ul className="space-y-2">
      {data.map((row) => {
        const pct = (row.count / maxV) * 100;
        return (
          <li key={row.city} className="text-sm">
            <div className="flex items-center justify-between mb-1">
              <span className="text-text-primary">{row.city}</span>
              <span className="text-text-secondary">{row.count}</span>
            </div>
            <div className="h-2 bg-accent rounded-full overflow-hidden">
              <div className="h-full bg-primary rounded-full" style={{ width: `${pct}%` }} />
            </div>
          </li>
        );
      })}
    </ul>
  );
}

function ServerHealthPanel({ health }) {
  if (!health) return null;
  const empty = (health.sample_count || 0) === 0;
  return (
    <div className="bg-white border border-border rounded-[12px] p-5">
      <div className="flex items-center justify-between mb-3">
        <h2 className="font-semibold">בריאות שרת — שעה אחרונה</h2>
        <span className="text-xs text-text-secondary">
          {empty ? "מחכה לתנועה..." : `${health.sample_count} בקשות`}
        </span>
      </div>
      <div className="grid grid-cols-2 gap-4">
        <div>
          <p className="text-xs text-text-secondary mb-1">זמן תגובה ממוצע</p>
          <p className="text-2xl font-bold text-primary">
            {health.response_time_avg_ms}
            <span className="text-sm text-text-secondary ms-1">ms</span>
          </p>
        </div>
        <div>
          <p className="text-xs text-text-secondary mb-1">בקשות לדקה</p>
          <p className="text-2xl font-bold text-primary">
            {health.requests_per_minute}
            <span className="text-sm text-text-secondary ms-1">req/min</span>
          </p>
        </div>
      </div>
      <p className="text-[13px] text-text-secondary mt-3 leading-snug">
        ℹ️ נתונים per-process בזיכרון — מתאפסים בכל deploy (תיעוד: docs/SECURITY.md).
      </p>
    </div>
  );
}
