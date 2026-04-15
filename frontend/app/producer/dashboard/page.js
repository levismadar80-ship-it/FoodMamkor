"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import api from "@/lib/api";
import { useAuth } from "@/lib/auth-context";

/**
 * Producer dashboard — feature/producer-analytics.
 *
 * Fetches in parallel from two endpoints so the UI can render the hero
 * (availability toggle + quick links) immediately even if analytics is
 * slow:
 *   - GET /producers/me/dashboard  — producer meta + legacy fields
 *   - GET /producers/me/analytics  — rich metrics + 30d chart + top cities
 *
 * The charts are inline SVG (no chart library) following the admin
 * dashboard precedent. Two charts:
 *   1. Line: profile views over the last 30 days
 *   2. Horizontal bar: top 5 cities viewing the profile
 */
export default function ProducerDashboardPage() {
  const router = useRouter();
  const { user, loading: authLoading } = useAuth();
  const [data, setData] = useState(null);
  const [analytics, setAnalytics] = useState(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (authLoading) return;
    if (!user || user.role !== "producer") {
      router.push("/login");
      return;
    }
    // Fire both in parallel — dashboard first (drives the hero) and
    // analytics second (drives the stat cards and charts).
    api.get("/producers/me/dashboard").then((r) => setData(r.data)).catch(() => setData(null));
    api.get("/producers/me/analytics").then((r) => setAnalytics(r.data)).catch(() => setAnalytics(null));
  }, [user, authLoading]);

  const toggleAvailability = async () => {
    setSaving(true);
    try {
      const r = await api.post("/producers/me/availability");
      setData((prev) =>
        prev
          ? {
              ...prev,
              producer: {
                ...prev.producer,
                is_available_today: r.data.is_available_today,
              },
            }
          : prev,
      );
    } catch {
      alert("לא הצלחנו לעדכן את סטטוס הזמינות — נסי שוב בעוד רגע");
    } finally {
      setSaving(false);
    }
  };

  // MEH-12 — durable availability status (available | full | vacation).
  // Separate from the daily `is_available_today` toggle above; both
  // coexist and render different badges on cards/detail pages.
  const setAvailabilityStatus = async (status) => {
    // Optimistic update so the pill lights up immediately on click.
    setData((prev) =>
      prev
        ? {
            ...prev,
            producer: { ...prev.producer, availability_status: status },
          }
        : prev,
    );
    try {
      await api.post("/producers/me/availability-status", { status });
    } catch {
      alert("לא הצלחנו לעדכן את סטטוס הזמינות — נסי שוב בעוד רגע");
      // Refetch on failure so the UI doesn't stay out of sync.
      api
        .get("/producers/me/dashboard")
        .then((r) => setData(r.data))
        .catch(() => {});
    }
  };

  if (authLoading || !user || user.role !== "producer") return null;
  if (!data) {
    return (
      <div className="max-w-5xl mx-auto px-4 py-16 text-center text-site-muted">
        טוענת נתונים...
      </div>
    );
  }

  const { producer } = data;

  return (
    <div className="max-w-5xl mx-auto px-4 py-12">
      <h1 className="font-headline text-4xl font-bold text-site-text mb-2">
        שלום {user.name} 👋
      </h1>
      <p className="text-site-muted mb-8">
        ברוכה הבאה לניהול העסק של <span className="font-semibold">{producer.name}</span>
      </p>

      {producer.status === "pending" && (
        <div className="bg-yellow-50 border border-yellow-200 rounded-[16px] p-4 mb-6 text-sm text-yellow-800">
          🌿 פרופיל העסק שלך ממתין לאישור
        </div>
      )}

      {/* Today's availability — hero action */}
      <div
        className={`rounded-[16px] p-6 mb-8 border transition ${
          producer.is_available_today
            ? "bg-primary text-white border-primary"
            : "bg-white border-border text-site-text"
        }`}
      >
        <div className="flex items-center justify-between gap-4">
          <div>
            <p className="text-sm uppercase tracking-wider opacity-80 mb-1">זמינות היום</p>
            <p className="font-headline text-2xl font-bold">
              {producer.is_available_today ? "זמין היום ✓" : "לא מסומן זמין"}
            </p>
            <p className="text-sm mt-1 opacity-80">
              {producer.is_available_today
                ? "העסק שלך מסומן עם תגית 'זמין היום' על הכרטיסייה."
                : "לקוחות יראו שיש לך זמינות מיוחדת היום."}
            </p>
          </div>
          <button
            onClick={toggleAvailability}
            disabled={saving}
            className={`px-5 py-3 rounded-[12px] font-medium transition disabled:opacity-60 ${
              producer.is_available_today
                ? "bg-white text-primary hover:bg-light"
                : "bg-primary text-white hover:bg-primary-light"
            }`}
          >
            {saving ? "..." : producer.is_available_today ? "בטל סימון" : "סמן זמין היום"}
          </button>
        </div>
      </div>

      {/* MEH-12 — durable availability status (colored-dot badge on
          ProducerCard + ProducerDetail). Distinct from the per-day
          "זמין היום" flag above. */}
      <div className="bg-white border border-border rounded-[16px] p-6 mb-8">
        <p className="text-sm uppercase tracking-wider text-site-muted mb-1">
          סטטוס זמינות
        </p>
        <p className="text-site-muted text-sm mb-4">
          בחרי את הסטטוס שיוצג ללקוחות בכרטיסייה ובעמוד העסק.
        </p>
        <div role="radiogroup" aria-label="סטטוס זמינות" className="flex flex-wrap gap-2">
          {[
            { value: "available", label: "פתוח להזמנות", color: "#22c55e" },
            { value: "full", label: "עמוס כרגע", color: "#f97316" },
            { value: "vacation", label: "בהפסקה", color: "#9ca3af" },
          ].map((opt) => {
            const active = (producer.availability_status || "available") === opt.value;
            return (
              <button
                key={opt.value}
                type="button"
                role="radio"
                aria-checked={active}
                onClick={() => setAvailabilityStatus(opt.value)}
                className={`inline-flex items-center gap-2 px-4 py-2 rounded-[12px] text-sm font-medium transition border focus-visible:ring-2 focus-visible:ring-primary/40 ${
                  active
                    ? "bg-primary text-white border-primary"
                    : "bg-white text-site-text border-border hover:bg-light"
                }`}
              >
                <span
                  aria-hidden="true"
                  style={{
                    width: "8px",
                    height: "8px",
                    borderRadius: "50%",
                    display: "inline-block",
                    background: opt.color,
                    flexShrink: 0,
                  }}
                />
                {opt.label}
              </button>
            );
          })}
        </div>
      </div>

      {/* Analytics stat cards */}
      {analytics ? (
        <AnalyticsSection analytics={analytics} />
      ) : (
        <p className="text-sm text-site-muted mb-8">טוענת סטטיסטיקות...</p>
      )}

      {/* Quick links */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Link
          href="/settings"
          className="bg-white border border-border rounded-[16px] p-5 hover:border-primary transition"
        >
          <p className="font-headline text-lg font-bold mb-1">עריכת פרופיל</p>
          <p className="text-sm text-site-muted">עדכני פרטי עסק, משלוחים ותמונות</p>
        </Link>
        <Link
          href="/producer/dashboard/events/new"
          className="bg-white border border-border rounded-[16px] p-5 hover:border-primary transition"
        >
          <p className="font-headline text-lg font-bold mb-1">הוסף אירוע</p>
          <p className="text-sm text-site-muted">סדנה, סיור, ימי פתיחה וכו׳</p>
        </Link>
        <Link
          href={`/producer/${producer.id}`}
          className="bg-white border border-border rounded-[16px] p-5 hover:border-primary transition"
        >
          <p className="font-headline text-lg font-bold mb-1">הצג את העסק באתר</p>
          <p className="text-sm text-site-muted">כך לקוחות רואות אותו</p>
        </Link>
      </div>
    </div>
  );
}

// ============================================================
// Analytics section: stat cards + charts
// ============================================================

function AnalyticsSection({ analytics }) {
  const {
    profile_views,
    search_appearances,
    whatsapp_clicks,
    follower_count,
    new_followers_this_week,
    average_rating,
    total_reviews,
    home_products_count,
    views_by_day,
    top_cities,
  } = analytics;

  return (
    <div className="space-y-8 mb-10">
      {/* Row 1: windowed metric cards (profile / search / whatsapp) */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <WindowedMetricCard
          label="צפיות בפרופיל"
          icon="👁️"
          windows={profile_views}
        />
        <WindowedMetricCard
          label="הופעות בחיפוש"
          icon="🔎"
          windows={search_appearances}
        />
        <WindowedMetricCard
          label="לחיצות ווטסאפ"
          icon="💬"
          windows={whatsapp_clicks}
        />
      </div>

      {/* Row 2: static cards (followers, reviews, home products) */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <SimpleCard
          label="עוקבות"
          icon="🌿"
          value={follower_count}
          sub={`+${new_followers_this_week} השבוע`}
        />
        <SimpleCard
          label="דירוג ממוצע"
          icon="⭐"
          value={average_rating ? average_rating.toFixed(1) : "—"}
          sub={`מתוך ${total_reviews} ביקורות`}
        />
        <SimpleCard
          label="מוצרים פעילים במטבח"
          icon="🥕"
          value={home_products_count}
          sub="מהמטבח של השכן"
        />
      </div>

      {/* Charts */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="bg-white border border-border rounded-[16px] p-5">
          <h2 className="font-headline text-lg font-bold mb-3">צפיות ב-30 הימים האחרונים</h2>
          <ViewsLineChart data={views_by_day} />
        </div>
        <div className="bg-white border border-border rounded-[16px] p-5">
          <h2 className="font-headline text-lg font-bold mb-3">ערים מובילות</h2>
          <TopCitiesBarChart data={top_cities} />
        </div>
      </div>
    </div>
  );
}

function WindowedMetricCard({ label, icon, windows }) {
  return (
    <div className="bg-white border border-border rounded-[16px] p-5">
      <div className="flex items-center justify-between mb-3">
        <span className="text-2xl" aria-hidden="true">{icon}</span>
        <span className="text-xs text-site-muted">7 ימים / 30 ימים / סה״כ</span>
      </div>
      <p className="text-sm text-site-muted mb-2">{label}</p>
      <div className="flex items-baseline gap-3">
        <span className="font-headline text-4xl font-bold text-primary">
          {windows?.last_7d ?? 0}
        </span>
        <span className="text-lg text-site-text/60">/</span>
        <span className="font-headline text-2xl font-semibold text-site-text">
          {windows?.last_30d ?? 0}
        </span>
        <span className="text-lg text-site-text/60">/</span>
        <span className="font-headline text-xl text-site-muted">
          {windows?.total ?? 0}
        </span>
      </div>
    </div>
  );
}

function SimpleCard({ label, icon, value, sub }) {
  return (
    <div className="bg-white border border-border rounded-[16px] p-5">
      <div className="flex items-center justify-between mb-3">
        <span className="text-2xl" aria-hidden="true">{icon}</span>
      </div>
      <p className="text-sm text-site-muted mb-2">{label}</p>
      <p className="font-headline text-4xl font-bold text-primary">{value}</p>
      <p className="text-xs text-site-muted mt-1">{sub}</p>
    </div>
  );
}

/**
 * Inline SVG line chart — 30 days of views.
 * Follows the same pattern as admin/page.js's monthly_producers chart
 * (no chart library, per the codebase precedent).
 */
function ViewsLineChart({ data }) {
  if (!data || data.length === 0) {
    return <p className="text-sm text-site-muted">אין נתונים עדיין</p>;
  }
  const W = 320;
  const H = 120;
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

  // Show labels for start / mid / end only to avoid x-axis clutter.
  const labelIndexes = [0, Math.floor(data.length / 2), data.length - 1];

  return (
    <svg
      viewBox={`0 0 ${W} ${H + 20}`}
      className="w-full h-40"
      role="img"
      aria-label="גרף צפיות ב-30 הימים האחרונים"
    >
      <polyline
        fill="none"
        stroke="#2e6853"
        strokeWidth="2"
        points={points}
      />
      {data.map((d, i) => {
        const x = pad + i * stepX;
        const y = H - pad - (d.count / maxV) * (H - pad * 2);
        return (
          <g key={d.date}>
            <circle cx={x} cy={y} r={d.count > 0 ? 2.5 : 1.5} fill="#2e6853" />
            {labelIndexes.includes(i) && (
              <text
                x={x}
                y={H + 14}
                fontSize="10"
                textAnchor="middle"
                fill="#6b6b6b"
              >
                {d.date.slice(5)}
              </text>
            )}
          </g>
        );
      })}
    </svg>
  );
}

/**
 * Inline SVG horizontal bar chart — top 5 cities.
 * Falls back to a text note when there are no city-tagged views yet
 * (which is the case until logged-in users with a `city` set visit).
 */
function TopCitiesBarChart({ data }) {
  if (!data || data.length === 0) {
    return (
      <p className="text-sm text-site-muted">
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
              <span className="text-site-text">{row.city}</span>
              <span className="text-site-muted">{row.count}</span>
            </div>
            <div className="h-2 bg-light rounded-full overflow-hidden">
              <div
                className="h-full bg-primary rounded-full"
                style={{ width: `${pct}%` }}
              />
            </div>
          </li>
        );
      })}
    </ul>
  );
}
