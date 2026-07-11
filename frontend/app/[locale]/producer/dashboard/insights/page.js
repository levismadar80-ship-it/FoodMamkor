"use client";

/**
 * Module:   producer/dashboard/insights/page
 * Purpose:  תובנות tab of the producer dashboard hub (MEH-964 Phase 1, chunk
 *           1B). Hosts the DEEP analytics relocated VERBATIM off the Overview:
 *           the windowed metric cards, follower/rating cards, and the two
 *           inline-SVG charts (views-over-30d + top cities).
 * Touches:  GET /producers/me/analytics (read).
 * Does NOT: render the top-line 4-KPI strip — those KPIs live ONLY on the
 *           Overview (page.js OverviewStatsHero); duplicating them here would
 *           recreate the MEH-961/963 stale-duplicate bug. Card/chart bodies
 *           are byte-identical to their prior definitions in
 *           producer/dashboard/page.js (relocate-don't-rewrite).
 * Related:  app/[locale]/producer/dashboard/layout.js (tab nav + UX gate);
 *           app/[locale]/producer/dashboard/page.js (Overview — KPI strip);
 *           backend/app/routers/producer_me.py:489 (analytics endpoint).
 * History:  MEH-964 (relocation, chunk 1B); MEH-1090 (chart Y-axis + tokens);
 *           MEH-1101 (pre-publish zero-state + small-n cities list +
 *           followers-zero CTA).
 *
 * Auth: producer-role guard via useAuth() — kept per-page until Phase 2.
 * RTL: logical properties only — see .claude/rules/rtl.md.
 */

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { Eye, MagnifyingGlass, ChatCircle, Phone, Leaf, Star } from "@phosphor-icons/react";
import { Link as LocaleLink } from "@/i18n/navigation";
import api from "@/lib/api";
import { useAuth } from "@/lib/auth-context";
import InfoTooltip from "@/components/InfoTooltip";

export default function ProducerDashboardInsightsPage() {
  const router = useRouter();
  const t = useTranslations("dashboard.producer");
  const { user, loading: authLoading } = useAuth();
  const [analytics, setAnalytics] = useState(null);
  // MEH-1101: the analytics payload has no approved/published flag — the
  // status signal comes from /producers/me (same source as the Overview's
  // isApproved, page.js). null = unknown → banner stays hidden (fail-quiet).
  // profileSettled gates render so the banner doesn't pop in after an
  // analytics-only first paint (layout shift on every pending producer).
  const [profile, setProfile] = useState(null);
  const [profileSettled, setProfileSettled] = useState(false);

  useEffect(() => {
    if (authLoading) return;
    if (!user || user.role !== "producer") {
      router.push("/login");
      return;
    }
    api.get("/producers/me/analytics").then((r) => setAnalytics(r.data)).catch(() => setAnalytics(null));
    api
      .get("/producers/me")
      .then((r) => setProfile(r.data))
      .catch(() => setProfile(null))
      .finally(() => setProfileSettled(true));
  }, [user, authLoading, router]);

  if (authLoading || !user || user.role !== "producer") return null;

  if (!analytics || !profileSettled) {
    return (
      <div className="max-w-5xl mx-auto px-4 py-16 text-center text-fg-muted">
        {t("loading_analytics")}
      </div>
    );
  }

  const isApproved = profile?.status === "approved";

  return (
    <div className="max-w-5xl mx-auto px-4 py-12">
      {/* MEH-1101: pre-publish zero-state — all-zero KPIs read as failure
          without the context that data starts flowing after approval
          (Site Kit hasZeroData pattern). KPI cards still render below. */}
      {profile && !isApproved && (
        <div
          className="bg-white border border-border rounded-[16px] p-4 mb-6 text-sm"
          role="status"
          data-testid="insights-zero-state"
        >
          <p className="font-semibold text-text mb-1">{t("insights_zero_state.title")}</p>
          <p className="text-fg-muted mb-3">{t("insights_zero_state.body")}</p>
          {/* LocaleLink (not bare next/link): keeps the /en prefix under
              as-needed locale routing (MEH-956 precedent). */}
          <LocaleLink
            href="/producer/dashboard/edit"
            className="inline-block bg-primary text-white px-4 py-2 rounded-[10px] text-xs font-medium hover:bg-primary-dark transition"
          >
            {t("insights_zero_state.cta")}
          </LocaleLink>
        </div>
      )}
      <DeepAnalyticsSection analytics={analytics} profile={profile} />
    </div>
  );
}

// ============================================================
// Deep analytics: windowed metric cards + follower/rating cards + charts.
// Relocated verbatim from the former AnalyticsSection (MEH-57 / MEH-288) on
// the Overview; the top-line KPI strip stays on the Overview (MEH-964 1B).
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
          icon={Eye}
          windows={profile_views}
          tooltip={t("windowed.profile_views_tooltip")}
        />
        <WindowedMetricCard
          label={t("windowed.search_appearances")}
          icon={MagnifyingGlass}
          windows={search_appearances}
          tooltip={t("windowed.search_appearances_tooltip")}
        />
        <WindowedMetricCard
          label={t("windowed.whatsapp_clicks")}
          icon={ChatCircle}
          windows={whatsapp_clicks}
        />
        <WindowedMetricCard
          label={t("windowed.contact_clicks")}
          icon={Phone}
          windows={contact_clicks}
        />
      </div>

      {/* Row 2: static cards (followers, reviews) */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <SimpleCard
          label={t("simple_cards.followers_label")}
          icon={Leaf}
          value={follower_count}
          sub={t("simple_cards.followers_sub_template", { count: new_followers_this_week })}
          // MEH-1101: 0 followers rendered "0 · 0+ השבוע" — a double-zero that
          // reads as failure. Replace with a share invitation; the share text
          // links to the public page when one exists (approved + slug).
          empty={
            follower_count === 0 ? (
              <p className="text-sm text-fg-muted" data-testid="followers-zero-cta">
                {t("simple_cards.followers_zero_prefix")}
                {profile?.status === "approved" && profile?.slug ? (
                  <LocaleLink
                    href={`/${profile.slug}`}
                    className="text-primary hover:underline"
                  >
                    {t("simple_cards.followers_zero_share")}
                  </LocaleLink>
                ) : (
                  t("simple_cards.followers_zero_share")
                )}
              </p>
            ) : null
          }
        />
        <SimpleCard
          label={t("simple_cards.rating_label")}
          icon={Star}
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

function WindowedMetricCard({ label, icon: Icon, windows, tooltip }) {
  const t = useTranslations("dashboard.producer.analytics");
  return (
    <div className="bg-white border border-border rounded-[16px] p-5">
      <div className="flex items-center justify-between mb-3">
        <Icon size={24} className="text-primary" aria-hidden="true" />
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

function SimpleCard({ label, icon: Icon, value, sub, empty }) {
  return (
    <div className="bg-white border border-border rounded-[16px] p-5">
      <div className="flex items-center justify-between mb-3">
        <Icon size={24} className="text-primary" aria-hidden="true" />
      </div>
      <p className="text-sm text-fg-muted mb-2">{label}</p>
      {empty ? (
        // MEH-1101: zero-state replacement — CTA line instead of value + sub.
        empty
      ) : (
        <>
          <p className="font-headline-lg text-4xl font-bold text-primary">{value}</p>
          <p className="text-xs text-fg-muted mt-1">{sub}</p>
        </>
      )}
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
  const padTop = 14; // clearance so the top Y-value label isn't clipped
  const padLeft = 24; // room for the y-axis value labels
  const padRight = 8;
  const baseY = H - padTop; // count === 0 sits on the baseline
  const plotH = baseY - padTop; // pixels available for the max value
  const plotLeft = padLeft;
  const plotRight = W - padRight;
  const maxV = Math.max(1, ...data.map((d) => d.count));
  const stepX = data.length > 1 ? (plotRight - plotLeft) / (data.length - 1) : 0;
  const yFor = (count) => baseY - (count / maxV) * plotH;
  const points = data
    .map((d, i) => `${(plotLeft + i * stepX).toFixed(1)},${yFor(d.count).toFixed(1)}`)
    .join(" ");

  // MEH-1090: 3 readable Y ticks (0 / mid / max), de-duped for tiny ranges,
  // so a peak reads as "= 12" instead of an unlabelled height.
  const yTicks = [...new Set([0, Math.round(maxV / 2), maxV])];
  // Show labels for start / mid / end only to avoid x-axis clutter.
  const labelIndexes = [0, Math.floor(data.length / 2), data.length - 1];

  return (
    <svg
      viewBox={`0 0 ${W} ${H + 20}`}
      className="w-full h-40"
      role="img"
      aria-label={t("views_chart_aria")}
    >
      {/* Y-axis gridlines + value ticks — token colors via currentColor. */}
      {yTicks.map((v) => {
        const y = yFor(v);
        return (
          <g key={`y-${v}`}>
            <line
              x1={plotLeft}
              y1={y}
              x2={plotRight}
              y2={y}
              className="text-fg-muted"
              stroke="currentColor"
              strokeWidth="1"
              opacity="0.25"
            />
            <text
              x={plotLeft - 4}
              y={y + 3}
              fontSize="9"
              textAnchor="end"
              className="text-fg-muted"
              fill="currentColor"
            >
              {v}
            </text>
          </g>
        );
      })}
      <polyline
        fill="none"
        className="text-primary"
        stroke="currentColor"
        strokeWidth="2"
        points={points}
      />
      {data.map((d, i) => {
        const x = plotLeft + i * stepX;
        const y = yFor(d.count);
        return (
          <g key={d.date}>
            <circle
              cx={x}
              cy={y}
              r={d.count > 0 ? 2.5 : 1.5}
              className="text-primary"
              fill="currentColor"
            />
            {labelIndexes.includes(i) && (
              <text
                x={x}
                y={H + 14}
                fontSize="10"
                textAnchor="middle"
                className="text-fg-muted"
                fill="currentColor"
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
  // MEH-1101: with fewer than 3 cities, maxV normalization renders the top
  // city as a full-width bar — "100% of nothing". A plain text list carries
  // the same information without the misleading proportion.
  if (data.length < 3) {
    return (
      <ul className="space-y-2" data-testid="top-cities-list">
        {data.map((row) => (
          <li key={row.city} className="flex items-center justify-between text-sm">
            <span className="text-text">{row.city}</span>
            <span className="text-fg-muted">{row.count}</span>
          </li>
        ))}
      </ul>
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
