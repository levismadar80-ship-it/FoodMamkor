"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import api from "@/lib/api";
import CitySearch from "@/components/CitySearch";

function progressPct(commits, min, max) {
  const denom = max || min;
  return Math.min(100, Math.round((commits / denom) * 100));
}

function GroupBuyCard({ gb }) {
  const t = useTranslations("group_buys.card");
  const funded = gb.status === "funded";
  const pct = progressPct(gb.commits_count, gb.min_participants, gb.max_participants);
  const deadline = new Date(gb.deadline);
  const daysLeft = Math.max(0, Math.ceil((deadline - Date.now()) / 86400000));

  return (
    <div className="bg-white rounded-[16px] border border-border shadow-sm hover:shadow-md transition overflow-hidden flex flex-col">
      {/* Status banner */}
      {funded && (
        <div className="bg-primary text-white text-xs font-medium text-center py-1">
          {t("funded_banner")}
        </div>
      )}

      <div className="p-5 flex flex-col gap-3 flex-1">
        <div className="flex items-start justify-between gap-2">
          <h2 className="font-headline text-lg font-bold text-site-text leading-tight">
            {gb.title}
          </h2>
          {gb.city && (
            <span className="text-xs bg-light text-primary px-2 py-0.5 rounded-full whitespace-nowrap">
              {gb.city}
            </span>
          )}
        </div>

        {gb.producer_name && (
          <p className="text-sm text-site-muted">{t("by_producer", { name: gb.producer_name })}</p>
        )}

        {/* Price display */}
        <div className="flex items-baseline gap-2">
          <span className="text-2xl font-bold text-primary">
            ₪{Number(gb.price_per_unit_group).toFixed(0)}
          </span>
          <span className="text-sm text-site-muted line-through">
            ₪{Number(gb.price_per_unit_regular).toFixed(0)}
          </span>
          {gb.unit && <span className="text-xs text-site-muted">{t("unit_prefix", { unit: gb.unit })}</span>}
        </div>
        <p className="text-xs text-site-muted">
          {t("min_hint", { min: gb.min_participants })}
        </p>

        {/* Progress bar */}
        <div>
          <div className="flex justify-between text-xs text-site-muted mb-1">
            <span>{t("progress_label", { commits: gb.commits_count, min: gb.min_participants })}</span>
            <span>{pct}%</span>
          </div>
          <div className="w-full bg-border rounded-full h-2 overflow-hidden">
            <div
              className={`h-2 rounded-full transition-all ${funded ? "bg-primary" : "bg-primary/40"}`}
              style={{ width: `${pct}%` }}
            />
          </div>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between mt-auto pt-2">
          <span className="text-xs text-site-muted">
            {daysLeft > 0 ? t("days_left", { days: daysLeft }) : t("expired")}
          </span>
          <Link
            href={`/group-buys/${gb.id}`}
            className="bg-primary text-white text-sm px-4 py-1.5 rounded-[8px] hover:bg-primary-dark transition font-medium"
          >
            {funded ? t("cta_funded_details") : t("cta_join")}
          </Link>
        </div>
      </div>
    </div>
  );
}

export default function GroupBuysClient() {
  const t = useTranslations("group_buys.list");
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [city, setCity] = useState("");
  const [statusFilter, setStatusFilter] = useState("open");

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [city, statusFilter]);

  const load = async () => {
    setLoading(true);
    try {
      const params = { status: statusFilter };
      if (city) params.city = city;
      const r = await api.get("/group-buys", { params });
      setItems(r.data);
    } catch {
      setItems([]);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div>
      {/* Hero */}
      <section className="relative text-white py-16 overflow-hidden">
        <div
          className="kenburns-right absolute"
          style={{
            inset: "-5%",
            backgroundImage:
              "url(https://images.unsplash.com/photo-1542838132-92c53300491e?w=1600&auto=format&q=80&fm=webp)",
            backgroundSize: "cover",
            backgroundPosition: "center",
          }}
        />
        <div
          className="absolute inset-0"
          style={{ background: "linear-gradient(to bottom, rgba(46,74,46,0.82) 0%, rgba(46,74,46,0.92) 100%)" }}
        />
        <div className="relative max-w-5xl mx-auto px-4 text-center">
          <h1 className="font-headline text-4xl md:text-5xl font-bold mb-3">
            {t("hero_title")}
          </h1>
          <p className="text-light text-lg">
            {t("hero_subtitle")}
          </p>
        </div>
      </section>

      <div className="max-w-5xl mx-auto px-4 py-10">
        {/* Filters */}
        <div className="flex flex-wrap gap-3 mb-8 items-end">
          <div className="w-56">
            <CitySearch
              id="group-buys-city"
              label={t("filter_city_label")}
              value={city}
              onChange={(v) => setCity(v)}
              placeholder={t("filter_city_placeholder")}
            />
          </div>
          <div className="flex gap-2">
            {[
              { key: "open", label: t("status_open") },
              { key: "funded", label: t("status_funded") },
              { key: "fulfilled", label: t("status_fulfilled") },
            ].map((s) => (
              <button
                key={s.key}
                onClick={() => setStatusFilter(s.key)}
                className={`px-4 py-2 rounded-full text-sm font-medium transition border ${
                  statusFilter === s.key
                    ? "bg-primary text-white border-primary"
                    : "bg-white text-site-muted border-border hover:border-primary"
                }`}
              >
                {s.label}
              </button>
            ))}
          </div>
        </div>

        {loading ? (
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-6">
            {[1, 2, 3].map((i) => (
              <div key={i} className="h-64 rounded-[16px] bg-border animate-pulse" />
            ))}
          </div>
        ) : items.length === 0 ? (
          <div className="text-center py-20 text-site-muted">
            <p className="text-4xl mb-4">🛒</p>
            <p className="text-lg font-medium">{t("empty_title")}</p>
            <p className="text-sm mt-1">{t("empty_subtitle")}</p>
          </div>
        ) : (
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-6">
            {items.map((gb) => (
              <GroupBuyCard key={gb.id} gb={gb} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
