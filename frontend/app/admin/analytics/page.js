"use client";

import { useEffect, useState } from "react";
import { Heart } from "@phosphor-icons/react";
import api from "@/lib/api";

export default function AdminAnalyticsPage() {
  const [data, setData] = useState(null);
  useEffect(() => {
    api.get("/admin/analytics").then((r) => setData(r.data)).catch(() => {});
  }, []);

  if (!data) return <div className="text-text-secondary">טוען...</div>;

  // Two stacked line series for monthly chart
  const months = data.monthly || [];
  const W = 520;
  const H = 140;
  const pad = 24;
  const innerW = W - pad * 2;
  const innerH = H - pad;
  const maxV = Math.max(1, ...months.map((m) => Math.max(m.producers, m.users)));
  const stepX = months.length > 1 ? innerW / (months.length - 1) : 0;
  const path = (key) =>
    months
      .map((m, i) => {
        const x = pad + i * stepX;
        const y = pad + innerH - (m[key] / maxV) * innerH;
        return `${i === 0 ? "M" : "L"}${x.toFixed(1)},${y.toFixed(1)}`;
      })
      .join(" ");

  // Bar chart for top categories
  const cats = data.by_category || [];
  const maxCat = Math.max(1, ...cats.map((c) => c.count));

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">אנליטיקס</h1>
        <p className="text-text-secondary text-sm mt-1">תובנות על הפלטפורמה</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* Monthly chart */}
        <div className="bg-white border border-border rounded-[12px] p-5">
          <h2 className="font-semibold mb-3">צמיחה חודשית</h2>
          <div className="flex gap-4 text-xs mb-2">
            <span className="flex items-center gap-1"><span className="inline-block w-3 h-0.5 bg-primary"></span>בתי עסק</span>
            <span className="flex items-center gap-1"><span className="inline-block w-3 h-0.5 bg-secondary"></span>משתמשים</span>
          </div>
          <svg viewBox={`0 0 ${W} ${H + 20}`} className="w-full">
            <path d={path("producers")} fill="none" stroke="#2e6853" strokeWidth="2" />
            <path d={path("users")} fill="none" stroke="#4cb08b" strokeWidth="2" />
            {months.map((m, i) => {
              const x = pad + i * stepX;
              return (
                <text key={m.month} x={x} y={H + 16} fontSize="10" textAnchor="middle" fill="#6b6b6b">
                  {m.month.slice(5)}
                </text>
              );
            })}
          </svg>
        </div>

        {/* Top categories */}
        <div className="bg-white border border-border rounded-[12px] p-5">
          <h2 className="font-semibold mb-3">קטגוריות פופולריות</h2>
          {cats.length === 0 ? (
            <p className="text-sm text-text-secondary">אין נתונים</p>
          ) : (
            <ul className="space-y-2">
              {cats.map((c) => (
                <li key={c.name} className="text-sm">
                  <div className="flex justify-between mb-1">
                    <span>{c.emoji} {c.name}</span>
                    <span className="text-text-secondary">{c.count}</span>
                  </div>
                  <div className="bg-accent rounded-full h-2">
                    <div
                      className="bg-primary rounded-full h-2 transition-all"
                      style={{ width: `${(c.count / maxCat) * 100}%` }}
                    />
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>

        {/* Top cities */}
        <div className="bg-white border border-border rounded-[12px] p-5">
          <h2 className="font-semibold mb-3">ערים מובילות</h2>
          {data.by_city.length === 0 ? (
            <p className="text-sm text-text-secondary">אין נתונים</p>
          ) : (
            <ol className="space-y-1.5 text-sm">
              {data.by_city.map((c, i) => (
                <li key={c.city} className="flex justify-between border-b border-border pb-1.5">
                  <span><span className="text-text-secondary">{i + 1}.</span> {c.city}</span>
                  <span className="text-text-secondary">{c.count}</span>
                </li>
              ))}
            </ol>
          )}
        </div>

        {/* Top producers */}
        <div className="bg-white border border-border rounded-[12px] p-5">
          <h2 className="font-semibold mb-3">בתי עסק עם הכי הרבה מועדפים</h2>
          {data.top_producers.length === 0 ? (
            <p className="text-sm text-text-secondary">אין נתונים</p>
          ) : (
            <ul className="space-y-1.5 text-sm">
              {data.top_producers.map((p) => (
                <li key={p.id} className="flex justify-between border-b border-border pb-1.5">
                  <span>{p.name}</span>
                  <span className="text-text-secondary inline-flex items-center gap-1">
                    {p.favorites}
                    <Heart size={14} weight="fill" className="text-red-500" aria-hidden="true" />
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>

      {/* Heat map note */}
      <div className="bg-white border border-border rounded-[12px] p-5">
        <h2 className="font-semibold mb-3">פיזור גיאוגרפי</h2>
        <p className="text-sm text-text-secondary mb-2">
          {data.map_points.length} בתי עסק עם מיקום מיפוי
        </p>
        <div className="bg-accent/30 rounded-[12px] p-4 text-xs grid grid-cols-2 md:grid-cols-3 gap-2 max-h-48 overflow-y-auto">
          {data.map_points.slice(0, 30).map((p) => (
            <div key={p.id} className="bg-white rounded p-2 border border-border">
              <p className="font-medium truncate">{p.name}</p>
              <p className="text-text-secondary">{p.lat?.toFixed(3)}, {p.lng?.toFixed(3)}</p>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
