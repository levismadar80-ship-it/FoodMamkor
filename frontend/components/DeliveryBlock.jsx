"use client";

import { useState } from "react";
import { Truck, Package, CaretDown, CaretUp } from "@phosphor-icons/react";
import { useTranslations } from "next-intl";
import { formatPrice } from "@/lib/utils";
import { groupDeliveryAreas } from "@/lib/deliveryGroups";

/**
 * MEH-213 / MEH-1146 chunk B: editorial delivery section shown on
 * ProducerDetail when offers_delivery=true.
 *
 * States:
 *   nationwide=true         → "משלוחים לכל הארץ" badge; with an exclusion
 *                             list (MEH-1255) → "משלוחים לכל הארץ (למעט …)"
 *   areas all city-only     → COMPACT list (MEH-1435): flex-wrap, Hebrew a→ז,
 *                             middot-separated; >15 cities → preview 15 + a
 *                             "show more/less" toggle. No min_order/day anywhere.
 *   areas.length > 0        → dispatch-day PIVOT (MEH-1305 A) via
 *                             groupDeliveryAreas: one shared day hoisted to a
 *                             subline, 2+ days grouped under day headers, and a
 *                             "בתיאום מראש" bucket for dayless rows — so the day
 *                             is stated once and the per-city minimum stands out.
 *   nationwide=false, none  → "משלוחים בתיאום מראש"
 *
 * Plus an optional self-pickup line (invention-fix 6, gated on pickup_points).
 * min_order is rendered via formatPrice (MEH-1140 canonical shekel format).
 *
 * MEH-1466: the tertiary WhatsApp order CTA was removed. All three
 * producer-detail WhatsApp CTAs opened the same wa.me, so the delivery
 * section's CTA added ~zero value — the contact card + sticky bar own the
 * single primary "שליחת הודעה" CTA.
 */

// One editorial area row: city ↔ minimum only (the day is hoisted/grouped, so
// it is intentionally no longer repeated per row — MEH-1305 A).
function AreaRow({ da, t }) {
  return (
    <li className="flex items-center justify-between gap-3 py-2.5 text-sm">
      <span className="font-medium text-text">{da.city}</span>
      {da.min_order ? (
        <span className="text-fg-muted">
          {/* MEH-1168 P1 (bidi): isolate the ₪ amount so RTL keeps "150₪". */}
          {t("min_order")} <span dir="ltr">{formatPrice(da.min_order)}</span>
        </span>
      ) : null}
    </li>
  );
}

// A day-headed group (2+ distinct days) or the trailing "arranged" bucket.
function AreaGroup({ label, rows, t }) {
  return (
    <div>
      <p className="flex items-center gap-1.5 text-sm font-medium text-text mb-1">
        <Truck size={16} className="text-primary" aria-hidden="true" />
        {label}
      </p>
      <ul className="divide-y divide-border border-y border-border">
        {rows.map((da) => (
          <AreaRow key={da.id ?? da.city} da={da} t={t} />
        ))}
      </ul>
    </div>
  );
}

// MEH-1435: when every area carries a city name ONLY (no min_order, no
// delivery_day) the editorial rows waste vertical space — replace them with a
// compact flex-wrap list, sorted Hebrew a→ז, middot-separated. Over 15 cities
// a preview of 15 + a "show more/less" toggle keeps the block short (progressive
// disclosure — never hides cities behind search/accordion).
const CITY_PREVIEW_LIMIT = 15;

function CompactCities({ areas, t }) {
  const [expanded, setExpanded] = useState(false);
  const sorted = [...areas].sort((a, b) => a.city.localeCompare(b.city, "he"));
  const overLimit = sorted.length > CITY_PREVIEW_LIMIT;
  const visible = expanded || !overLimit ? sorted : sorted.slice(0, CITY_PREVIEW_LIMIT);
  const hiddenCount = sorted.length - CITY_PREVIEW_LIMIT;
  return (
    <div className="mb-4">
      <ul className="flex flex-wrap items-center gap-x-2 gap-y-1 text-sm text-text">
        {visible.map((da, i) => (
          <li key={da.id ?? da.city} className="flex items-center gap-x-2">
            {i > 0 && (
              <span aria-hidden="true" className="text-fg-muted">
                ·
              </span>
            )}
            <span>{da.city}</span>
          </li>
        ))}
      </ul>
      {overLimit && (
        <button
          type="button"
          onClick={() => setExpanded((v) => !v)}
          aria-expanded={expanded}
          className="mt-2 inline-flex items-center gap-1 text-sm font-medium text-primary"
        >
          {expanded ? t("show_less") : t("show_all", { count: hiddenCount })}
          {expanded ? (
            <CaretUp size={16} aria-hidden="true" />
          ) : (
            <CaretDown size={16} aria-hidden="true" />
          )}
        </button>
      )}
    </div>
  );
}

export default function DeliveryBlock({ nationwide, excluded = [], areas = [], pickup = false }) {
  const t = useTranslations("group_buys.delivery");
  const hasAreas = areas.length > 0;
  // MEH-1435: city-only areas (no minimum, no dispatch day) render as a compact
  // list; anything info-bearing keeps the MEH-1305 editorial rows unchanged.
  const bare = hasAreas && areas.every((da) => !da.min_order && !da.delivery_day);
  const grouped = hasAreas && !bare ? groupDeliveryAreas(areas) : null;
  // MEH-1255: nationwide delivery with an exclusion list.
  const hasExclusions = nationwide && excluded.length > 0;
  return (
    <section className="mt-8 border-t border-border pt-6">
      <h2 className="font-headline-md text-2xl font-bold text-text mb-4 flex items-center gap-2">
        <Truck size={22} className="text-primary" aria-hidden="true" />
        {t("heading")}
      </h2>

      {nationwide ? (
        <span className="inline-flex items-center gap-1.5 bg-green-50 text-text border border-border rounded-[20px] text-[13px] px-3 py-1.5 font-medium mb-4">
          <Truck size={14} className="text-current ms-1" aria-hidden="true" />
          {hasExclusions
            ? t("nationwide_except", { cities: excluded.join(", ") })
            : t("nationwide")}
        </span>
      ) : bare ? (
        <CompactCities areas={areas} t={t} />
      ) : hasAreas ? (
        <div className="mb-4">
          {/* MEH-1305 A — dispatch-day pivot. hoist: one shared day stated once
              in a subline; group: a header per distinct day; flat: no day data. */}
          {grouped.mode === "hoist" && (
            <>
              <p className="flex items-center gap-1.5 text-sm text-fg-muted mb-2">
                <Truck size={16} className="text-primary" aria-hidden="true" />
                {t("dispatch_days", { day: grouped.day })}
              </p>
              <ul className="divide-y divide-border border-y border-border">
                {grouped.rows.map((da) => (
                  <AreaRow key={da.id ?? da.city} da={da} t={t} />
                ))}
              </ul>
            </>
          )}

          {grouped.mode === "flat" && (
            <ul className="divide-y divide-border border-y border-border">
              {grouped.rows.map((da) => (
                <AreaRow key={da.id ?? da.city} da={da} t={t} />
              ))}
            </ul>
          )}

          {grouped.mode === "group" && (
            <div className="flex flex-col gap-4">
              {grouped.groups.map((g) => (
                <AreaGroup
                  key={g.day}
                  label={t("delivery_day_group", { day: g.day })}
                  rows={g.rows}
                  t={t}
                />
              ))}
              {grouped.arranged.length > 0 && (
                <AreaGroup label={t("arranged_group")} rows={grouped.arranged} t={t} />
              )}
            </div>
          )}
        </div>
      ) : (
        <p className="text-sm text-fg-muted mb-4">{t("arranged")}</p>
      )}

      {/* Self-pickup — invention-fix 6: only when the pickup_points flag is set. */}
      {pickup && (
        <p className="flex items-center gap-2 text-sm text-text mb-4">
          <Package size={18} className="text-primary" aria-hidden="true" />
          {t("pickup")}
        </p>
      )}
    </section>
  );
}
