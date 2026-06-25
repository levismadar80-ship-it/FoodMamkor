"use client";

/**
 * Module:   insights (producer dashboard — תובנות spoke)
 * Purpose:  DEEP analytics surface — windowed metric cards (7d/30d/total),
 *           followers/rating cards, and the two inline-SVG charts.
 * Touches:  GET /producers/me/analytics, GET /producers/me (city for charts).
 * Does NOT: render the top-line 4-KPI hero — those KPIs belong to the
 *           Overview (page.js). Duplicating them here would recreate the
 *           MEH-961/MEH-963 stale-duplicate bug.
 * Related:  page.js (Overview hero), components shared from the former
 *           AnalyticsSection (MEH-57).
 * History:  MEH-964 (Phase 1, chunk 1A — relocated verbatim from page.js).
 */

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import api from "@/lib/api";
import { useAuth } from "@/lib/auth-context";
import InfoTooltip from "@/components/InfoTooltip";

export default function ProducerInsightsPage() {
  const router = useRouter();
  const t = useTranslations("dashboard.producer");
  const { user, loading: authLoading } = useAuth();
  const [analytics, setAnalytics] = useState(null);
  const [profile, setProfile] = useState(null);

  useEffect(() => {
    if (authLoading) return;
    if (!user || user.role !== "producer") {
      router.push("/login");
      return;
    }
    api.get("/producers/me/analytics").then((r) => setAnalytics(r.data)).catch(() => setAnalytics(null));
    api.get("/producers/me").then((r) => setProfile(r.data)).catch(() => setProfile(null));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user, authLoading]);

  if (authLoading || !user || user.role !== "producer") return null;

  return (
    <div className="max-w-5xl mx-auto px-4 py-12">
      <h1 className="font-headline-lg text-3xl font-bold text-text mb-6">
        {t("nav.tabs.insights")}
      </h1>
      {analytics ? (
        <DeepAnalyticsSection analytics={analytics} profile={profile} />
      ) : (
        <p className="text-sm text-fg-muted mb-8">{t("loading_analytics")}</p>
      )}
    </div>
  );
}

// ============================================================
// DEEP analytics: windowed cards + followers/rating + charts.
// Relocated verbatim from page.js's former AnalyticsSection (MEH-57),
// minus the top-line 4-KPI hero + eligibility badge (those stay on the
// Overview — MEH-964 1A NOTE).
// ============================================================

function DeepAnalyticsSection({ analytics, profile }) {
  const t = useTranslations("dashboard.producer.analytics");
  const {
    profile_views,
    search_appearances,
    whatsapp_clicks,
    contact_clicks,
    follower_count,
    new_followers_this_week,
    average_rating,
    total_reviews,
    views_by_day,
    top_cities,
  } = analytics;

  return (
    <div className="space-y-8 mb-10">
      {/* Row 1: windowed metric cards (profile / search / whatsapp / contact) */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <WindowedMetricCard
          label={t("windowed.profile_views")}
          icon="👁️"
          windows={profile_views}
          tooltip={t("windowed.profile_views_tooltip")}
        />
        <WindowedMetricCard
          label={t("windowed.search_appearances")}
          icon="🔎"
          windows={search_appearances}
          tooltip={t("windowed.search_appearances_tooltip")}
        />
        <WindowedMetricCard
          label={t("windowed.whatsapp_clicks")}
          icon="💬"
          windows={whatsapp_clicks}
        />
        <WindowedMetricCard
          label={t("windowed.contact_clicks")}
          icon="📞"
          windows={contact_clicks}
        />
      </div>

      {/* Row 2: static cards (followers, reviews, home products) */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <SimpleCard
          label={t("simple_cards.followers_label")}
          icon="🌿"
          value={follower_count}
          sub={t("simple_cards.followers_sub_template", { count: new_followers_this_week })}
        />
        <SimpleCard
          label={t("simple_cards.rating_label")}
          icon="⭐"
          value={average_rating ? average_rating.toFixed(1) : "—"}
          sub={t("simple_cards.rating_sub_template", { count: total_reviews })}
        />
      </div>

      {/* Charts */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="bg-white border border-border rounded-[16px] p-5">
          <h2 className="font-headline-md text-lg font-bold mb-3">
            {t("views_chart_title")}
            <InfoTooltip content={t("views_chart_tooltip")} />
          </h2>
          <ViewsLineChart data={views_by_day} />
        </div>
        <div className="bg-white border border-border rounded-[16px] p-5">
          <h2 className="font-headline-md text-lg font-bold mb-3">{t("top_cities_title")}</h2>
          <TopCitiesBarChart data={top_cities} />
        </div>
      </div>
    </div>
  );
}

function WindowedMetricCard({ label, icon, windows, tooltip }) {
  const t = useTranslations("dashboard.producer.analytics");
  return (
    <div className="bg-white border border-border rounded-[16px] p-5">
      <div className="flex items-center justify-between mb-3">
        <span className="text-2xl" aria-hidden="true">{icon}</span>
        <span className="text-xs text-fg-muted">{t("stats_window_label")}</span>
      </div>
      <p className="text-sm text-fg-muted mb-2">
        {label}
        {tooltip && <InfoTooltip content={tooltip} />}
      </p>
      <div className="flex items-baseline gap-3">
        <span className="font-headline-lg text-4xl font-bold text-primary">
          {windows?.last_7d ?? 0}
        </span>
        <span className="text-lg text-text/60">/</span>
        <span className="font-headline-md text-2xl font-semibold text-text">
          {windows?.last_30d ?? 0}
        </span>
        <span className="text-lg text-text/60">/</span>
        <span className="font-headline-md text-xl text-fg-muted">
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
      <p className="text-sm text-fg-muted mb-2">{label}</p>
      <p className="font-headline-lg text-4xl font-bold text-primary">{value}</p>
      <p className="text-xs text-fg-muted mt-1">{sub}</p>
    </div>
  );
}

/**
 * Inline SVG line chart — 30 days of views.
 * Follows the same pattern as admin/page.js's monthly_producers chart
 * (no chart library, per the codebase precedent).
 */
function ViewsLineChart({ data }) {
  const t = useTranslations("dashboard.producer.analytics");
  if (!data || data.length === 0) {
    return <p className="text-sm text-fg-muted">{t("views_chart_empty")}</p>;
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
      aria-label={t("views_chart_aria")}
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
  const t = useTranslations("dashboard.producer.analytics");
  if (!data || data.length === 0) {
    return (
      <p className="text-sm text-fg-muted">
        {t("top_cities_empty")}
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
              <span className="text-text">{row.city}</span>
              <span className="text-fg-muted">{row.count}</span>
            </div>
            <div className="h-2 bg-green-50 rounded-full overflow-hidden">
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
