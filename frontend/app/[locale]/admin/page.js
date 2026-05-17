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
import { useTranslations } from "next-intl";
import api from "@/lib/api";
import { getProducerStatusLabel } from "@/lib/producer-status";
import InfoTooltip from "@/components/InfoTooltip";

export default function AdminDashboard() {
  const t = useTranslations("admin.dashboard");
  const [data, setData] = useState(null);
  const [error, setError] = useState("");

  useEffect(() => {
    api.get("/admin/dashboard")
      .then((r) => setData(r.data))
      .catch((e) => setError(e.response?.data?.detail || t("load_error")));
  }, [t]);

  if (error) {
    return <div className="bg-red-50 border border-red-200 text-red-700 rounded-[12px] p-4">{error}</div>;
  }
  if (!data) {
    return <div className="text-text-secondary">{t("loading")}</div>;
  }

  const s = data.stats;
  const cards = [
    { key: "total_producers",   label: t("cards.total_producers"),   value: s.total_producers,     Icon: Storefront,      href: "/admin/producers" },
    { key: "pending_producers", label: t("cards.pending_producers"), value: s.pending_producers,   Icon: HourglassSimple, href: "/admin/producers?status=pending", warn: s.pending_producers > 0 },
    { key: "total_users",       label: t("cards.total_users"),       value: s.total_users,         Icon: Users,           href: "/admin/users" },
    { key: "home_products",     label: t("cards.home_products"),     value: s.total_home_products, Icon: CookingPot,      href: "/admin/content" },
    { key: "group_buys",        label: t("cards.group_buys"),        value: "›",                   Icon: Package,         href: "/admin/group-buys" },
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
        <h1 className="text-2xl font-bold">{t("title")}</h1>
        <p className="text-text-secondary text-sm mt-1">{t("subtitle")}</p>
      </div>

      {/* Stat cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {cards.map((c) => (
          <Link
            key={c.key}
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
              {c.key === "group_buys" && (
                <span
                  onClick={(e) => e.stopPropagation()}
                  onMouseDown={(e) => e.stopPropagation()}
                  onPointerDown={(e) => e.stopPropagation()}
                >
                  <InfoTooltip
                    content={t("group_buys_tooltip")}
                    label={t("group_buys_tooltip_label")}
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
                <p className="font-medium text-sm">{t("alerts.pending_producers", { count: s.pending_producers })}</p>
                <p className="text-xs text-text-secondary">{t("alerts.pending_action")}</p>
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
                <p className="font-medium text-sm">{t("alerts.open_reports", { count: s.open_reports })}</p>
                <p className="text-xs text-text-secondary">{t("alerts.open_reports_action")}</p>
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
                <p className="font-medium text-sm">{t("alerts.hidden_products", { count: s.hidden_home_products })}</p>
                <p className="text-xs text-text-secondary">{t("alerts.hidden_products_action")}</p>
              </div>
            </Link>
          )}
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* Mini chart */}
        <div className="bg-white border border-border rounded-[12px] p-5">
          <h2 className="font-semibold mb-3">{t("monthly_chart_title")}</h2>
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
            <h2 className="font-semibold">{t("pending_panel.title")}</h2>
            <Link href="/admin/producers?status=pending" className="text-primary text-xs hover:underline">
              {t("pending_panel.view_all")}
            </Link>
          </div>
          {(data.pending_producers || []).length === 0 ? (
            <p className="text-sm text-text-secondary">{t("pending_panel.empty")}</p>
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
                    {t("pending_panel.review")}
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>

      {/* Activity feed */}
      <div className="bg-white border border-border rounded-[12px] p-5">
        <h2 className="font-semibold mb-3">{t("activity.title")}</h2>
        {(data.recent_activity || []).length === 0 && (
          <p className="text-sm text-text-secondary">{t("activity.empty")}</p>
        )}
        <ul className="space-y-2">
          {(data.recent_activity || []).map((a) => (
            <li key={a.id} className="flex items-center justify-between text-sm py-1.5 border-b border-border last:border-0">
              <div className="flex items-center gap-2">
                <span>🆕</span>
                <span>{t("activity.added_producer")}</span>
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
          label={t("secondary.new_users_week")}
          value={s.new_users_this_week || 0}
          total={s.total_users || 0}
          Icon={Users}
        />
        <DeltaCard
          label={t("secondary.new_producers_week")}
          value={s.new_producers_this_week || 0}
          total={s.total_producers || 0}
          Icon={Storefront}
        />
        <SimpleStat
          label={t("secondary.events")}
          value={s.total_events || 0}
          Icon={CalendarBlank}
          href="/admin/content"
        />
        <SimpleStat
          label={t("secondary.experiences")}
          value={s.total_experiences || 0}
          Icon={Sparkle}
          href="/admin/experiences"
        />
      </div>

      {/* DAU + top cities */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="bg-white border border-border rounded-[12px] p-5">
          <h2 className="font-semibold mb-3">{t("dau_title")}</h2>
          <DauLineChart data={data.daily_active_users || []} />
        </div>
        <div className="bg-white border border-border rounded-[12px] p-5">
          <h2 className="font-semibold mb-3">{t("top_cities_title")}</h2>
          <TopCitiesList data={data.top_cities || []} />
        </div>
      </div>

      {/* Server health */}
      <ServerHealthPanel health={data.server_health} />
    </div>
  );
}

function DeltaCard({ label, value, total, Icon }) {
  const t = useTranslations("admin.dashboard");
  return (
    <div className="bg-white border border-border rounded-[12px] p-4">
      <div className="flex items-start justify-between mb-1">
        <Icon size={24} weight="duotone" aria-hidden="true" className="text-primary" />
        <span className="text-3xl font-bold text-primary">+{value}</span>
      </div>
      <p className="text-xs text-text-secondary">{label}</p>
      <p className="text-xs text-text-secondary">{t("delta_of_total", { total })}</p>
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
  const t = useTranslations("admin.dashboard");
  if (!data || data.length === 0) {
    return <p className="text-sm text-text-secondary">{t("dau_empty")}</p>;
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
    <svg viewBox={`0 0 ${W} ${H + 20}`} className="w-full h-36" role="img" aria-label={t("dau_aria_label")}>
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
  const t = useTranslations("admin.dashboard");
  if (!data || data.length === 0) {
    return (
      <p className="text-sm text-text-secondary">
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
  const t = useTranslations("admin.dashboard");
  if (!health) return null;
  const empty = (health.sample_count || 0) === 0;
  return (
    <div className="bg-white border border-border rounded-[12px] p-5">
      <div className="flex items-center justify-between mb-3">
        <h2 className="font-semibold">{t("server_health.title")}</h2>
        <span className="text-xs text-text-secondary">
          {empty ? t("server_health.waiting") : t("server_health.samples", { count: health.sample_count })}
        </span>
      </div>
      <div className="grid grid-cols-2 gap-4">
        <div>
          <p className="text-xs text-text-secondary mb-1">{t("server_health.response_time")}</p>
          <p className="text-2xl font-bold text-primary">
            {health.response_time_avg_ms}
            <span className="text-sm text-text-secondary ms-1">ms</span>
          </p>
        </div>
        <div>
          <p className="text-xs text-text-secondary mb-1">{t("server_health.requests_per_minute")}</p>
          <p className="text-2xl font-bold text-primary">
            {health.requests_per_minute}
            <span className="text-sm text-text-secondary ms-1">req/min</span>
          </p>
        </div>
      </div>
      <p className="text-[13px] text-text-secondary mt-3 leading-snug">
        {t("server_health.data_note")}
      </p>
    </div>
  );
}
