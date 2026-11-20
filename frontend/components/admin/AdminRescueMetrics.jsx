// @ts-check
"use client";

/**
 * Module:   AdminRescueMetrics
 * Purpose:  On /admin/analytics, the rescue-bag pilot's numbers for the last 30
 *           days: bags offered and reserved, no-shows, repeat buyers.
 * Touches:  GET /admin/rescue/metrics (rescue.py) — read-only.
 * Does NOT: show anything while the pilot is off: the route answers 404 then
 *           (require_rescue_enabled), and the block is left out rather than
 *           reporting an error for a feature that is not running.
 * States:   loading → nothing · pilot off (404) → nothing · failed → one line ·
 *           loaded → the tiles. A rate with no denominator shows «—», not 0%.
 * History:  MEH-3524 (created — the route had no screen).
 */

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import api from "@/lib/api";
import { PilotMetricsAdminRescueMetricsGetResponse as MetricsSchema } from "@/lib/generated/api.zod";

const WINDOW_DAYS = 30;
const PERCENT = 100;

/** @param {number | null | undefined} fraction */
function percent(fraction) {
  return typeof fraction === "number" ? `${Math.round(fraction * PERCENT)}%` : "—";
}

/** @param {any} m */
function tiles(m) {
  return [
    ["offers", m.offers_total],
    ["bags_offered", m.bags_offered],
    ["bags_reserved", m.bags_reserved],
    ["sell_through", percent(m.sell_through)],
    ["no_show_rate", percent(m.no_show_rate)],
    ["buyers", m.buyers_total],
    ["repeat_buyers", m.repeat_buyers],
    ["donated", m.bags_donated],
  ];
}

export default function AdminRescueMetrics() {
  const t = useTranslations("admin.analytics.rescue");
  const [state, setState] = useState(/** @type {{ kind: string, data?: any }} */ ({ kind: "loading" }));

  useEffect(() => {
    let live = true;
    api
      .get("/admin/rescue/metrics", { params: { days: WINDOW_DAYS } })
      .then((res) => {
        const parsed = MetricsSchema.safeParse(res.data);
        if (live) setState(parsed.success ? { kind: "ready", data: parsed.data } : { kind: "error" });
      })
      .catch((err) => {
        if (live) setState({ kind: err?.response?.status === 404 ? "off" : "error" });
      });
    return () => {
      live = false;
    };
  }, []);

  if (state.kind === "loading" || state.kind === "off") return null;
  if (state.kind === "error") {
    return (
      <p className="text-sm text-muted" data-testid="admin-rescue-metrics-error">
        {t("error")}
      </p>
    );
  }

  return (
    <section data-testid="admin-rescue-metrics" className="bg-surface border border-border rounded-md p-5">
      <h2 className="font-semibold">{t("heading")}</h2>
      <p className="text-xs text-muted mt-0.5 mb-4">{t("subtitle", { days: WINDOW_DAYS })}</p>
      <dl className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {tiles(state.data).map(([key, value]) => (
          <div key={key} className="bg-bg-subtle border border-border rounded-md p-3">
            <dt className="text-xs text-muted">{t(`tiles.${key}`)}</dt>
            <dd className="text-xl font-bold mt-1" data-testid={`rescue-metric-${key}`}>
              {value}
            </dd>
          </div>
        ))}
      </dl>
    </section>
  );
}
