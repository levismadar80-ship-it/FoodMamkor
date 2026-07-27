"use client";

import { useState } from "react";
import { Truck, Package, CaretDown, CaretUp, NavigationArrow } from "@phosphor-icons/react";
import { useTranslations } from "next-intl";
import { formatPrice } from "@/lib/utils";
import { groupDeliveryAreas } from "@/lib/deliveryGroups";
import { getSingleOrderCutoff } from "@/lib/orderWindow";
import DeliveryChecker from "@/components/DeliveryChecker";

// Index-aligned with lib/orderWindow.js ORDER_DAY_KEYS — resolves a cutoff
// dayIndex to the opening_hours.weekdays.* label ("יום רביעי" / "Wednesday").
const WEEKDAY_SHORT_KEYS = ["sun", "mon", "tue", "wed", "thu", "fri", "sat"];

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
 * MEH-1646: (a) order-cutoff line — ONLY when order_window has exactly one
 * open day (getSingleOrderCutoff; 2+ days → the "until" day is ambiguous, so
 * no cutoff claim renders — Phase 0 decision). In hoist mode it REPLACES the
 * dispatch_days subline ("מקבלים הזמנות עד {day} {time} · משלוח ביום {day}" —
 * the day is still stated exactly once, MEH-1305 discipline); in group mode
 * it renders WITHOUT the day promise. The MEH-1546 OrderWindowStrip (weekly
 * hours near the header) is NOT duplicated — this line is cutoff framing,
 * that one is a weekly schedule. (b) pickup rows carry a "חינם" tag at the
 * min_order hierarchy (pickup is always free; delivery rows show cost info,
 * pickup rows now do too).
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

// MEH-1512 (MEH-1509 chunk 2): one pickup / market_stand location row from the
// producer's locations[] — label (falls back to city) · city · opening_hours ·
// an outbound Waze nav link built from lat/lng (mirrors MiniMap.jsx:90; no
// second in-page map — NN/g scroll-trap). Street address stays off (MEH-829).
function PickupRow({ loc, t, tMap }) {
  const hasCoords =
    loc.lat != null && loc.lng != null && !isNaN(Number(loc.lat)) && !isNaN(Number(loc.lng));
  const wazeUrl = hasCoords ? `https://waze.com/ul?ll=${loc.lat},${loc.lng}&navigate=yes` : null;
  const heading = loc.label || loc.city;
  return (
    <li className="flex items-start justify-between gap-3 py-2.5 text-sm">
      <div className="min-w-0">
        <p className="font-medium text-text">{heading}</p>
        {/* city as a subline only when a distinct label already owns the top line */}
        {loc.city && loc.label && <p className="text-[13px] text-fg-muted">{loc.city}</p>}
        {loc.opening_hours && <p className="text-[13px] text-fg-muted">{loc.opening_hours}</p>}
      </div>
      <div className="flex-shrink-0 flex items-center gap-3">
        {/* MEH-1646 (b): pickup is free — stated at the same hierarchy as the
            delivery rows' min_order cost info (muted end-of-row text). */}
        <span className="text-fg-muted">{t("free")}</span>
        {wazeUrl && (
          <a
            href={wazeUrl}
            target="_blank"
            rel="noopener noreferrer"
            aria-label={tMap("open_in_waze_aria")}
            className="inline-flex items-center gap-1 min-h-[44px] text-sm font-medium text-primary transition hover:underline focus-visible:ring-2 focus-visible:ring-primary/40 rounded"
          >
            <NavigationArrow size={16} aria-hidden="true" />
            {tMap("open_in_waze")}
          </a>
        )}
      </div>
    </li>
  );
}

// MEH-1512: the pickup-rows list. Mirrors the MEH-1435 CompactCities
// progressive-disclosure structure above (DeliveryBlock.jsx:75-112) — useState
// + slice + a reused show_all/show_less toggle — so a long market-stand list
// stays short (preview PICKUP_PREVIEW_LIMIT + "הצג עוד"). Sorted city→label,
// stable. Heading reuses the MEH-1461-locked "איסוף עצמי" string (t("pickup")).
const PICKUP_PREVIEW_LIMIT = 5;

function PickupRows({ locations, t, tMap }) {
  const [expanded, setExpanded] = useState(false);
  const sorted = [...locations].sort(
    (a, b) =>
      (a.city || "").localeCompare(b.city || "", "he") ||
      (a.label || "").localeCompare(b.label || "", "he"),
  );
  const overLimit = sorted.length > PICKUP_PREVIEW_LIMIT;
  const visible = expanded || !overLimit ? sorted : sorted.slice(0, PICKUP_PREVIEW_LIMIT);
  const hiddenCount = sorted.length - PICKUP_PREVIEW_LIMIT;
  return (
    <div className="mb-4">
      <p className="flex items-center gap-2 text-sm font-medium text-text mb-1">
        <Package size={18} className="text-primary" aria-hidden="true" />
        {t("pickup")}
      </p>
      <ul className="divide-y divide-border border-y border-border">
        {visible.map((loc, i) => (
          <PickupRow key={`${loc.city ?? ""}-${loc.label ?? ""}-${i}`} loc={loc} t={t} tMap={tMap} />
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

// MEH-1577: the structured delivery-cost line. Producer-level (not per area —
// delivery_areas.min_order owns the per-city dimension).
//
// Six inputs, because `0` is a VALUE here and not an absence: delivery_fee=0
// means "delivery is free" and is distinct from NULL ("owner hasn't stated a
// cost"). Every gate below is an explicit `!= null` — a truthiness check would
// silently turn the free case into the not-stated case, which is the single
// most likely way this line breaks.
//
//   fee > 0, no threshold   → "משלוח: 35₪"
//   fee > 0, threshold      → "משלוח: 35₪ · מעל 250₪ — חינם"
//   fee === 0               → "משלוח חינם"  (threshold SUPPRESSED — see below)
//   no fee, threshold       → "מעל 250₪ — חינם"   (legal state; renders alone)
//   neither                 → null → no line in the DOM at all
//
// fee===0 suppresses the threshold on purpose. Both can be set (the validators
// allow it: fee >= 0, threshold > 0), but "delivery is free · free above 250₪"
// states a condition on something already unconditional. The free fact wins.
//
// Returns an array of {before, amount, after} segments rather than a string, so
// each ₪ amount can be rendered inside <bdi> — the HTML-native bidi isolate.
//
// Same intent as AreaRow's `<span dir="ltr">{formatPrice(...)}</span>` above
// (MEH-1168 P1: RTL otherwise reorders "35₪"), but the amount here sits INSIDE a
// Hebrew sentence, so dir="ltr" on the whole line would reorder the Hebrew
// around it. <bdi> isolates the number alone and leaves the sentence RTL.
//
// Not the Unicode isolate characters (U+2066/U+2069): those work, but they land
// in textContent, where they are invisible and silently break any getByText /
// Playwright assertion written against the rendered copy. <bdi> leaves the text
// clean. The sentinel split is what lets a translated string carry an element in
// the middle without next-intl rich-text plumbing for a two-word line.
// Written as the ESCAPE "\u0000", never a literal NUL byte in the source: a
// raw NUL makes grep classify this file as binary, so the repo's documented
// navigation recipe (code-execution.md §15, `grep -rE "// MEH-[0-9]+:"`)
// prints "binary file matches" instead of this file's sentinel anchors and
// silently drops it from every such sweep. Same runtime value, ASCII source.
const AMOUNT_SENTINEL = "\u0000";

function splitAroundAmount(text) {
  const [before, after = ""] = text.split(AMOUNT_SENTINEL);
  return { before, after };
}

function buildFeeSegments(fee, threshold, t) {
  const hasFee = fee != null;
  const hasThreshold = threshold != null;
  if (!hasFee && !hasThreshold) return null;
  // fee===0 suppresses the threshold on purpose. Both can be set (the
  // validators allow fee >= 0 with threshold > 0), but "delivery is free ·
  // free above 250₪" puts a condition on something already unconditional.
  if (hasFee && fee === 0) return [{ before: t("fee_free"), amount: null, after: "" }];
  const segments = [];
  if (hasFee) {
    segments.push({
      ...splitAroundAmount(t("fee", { amount: AMOUNT_SENTINEL })),
      amount: formatPrice(fee),
    });
  }
  if (hasThreshold) {
    segments.push({
      ...splitAroundAmount(t("free_above", { amount: AMOUNT_SENTINEL })),
      amount: formatPrice(threshold),
    });
  }
  return segments;
}

export default function DeliveryBlock({
  nationwide,
  excluded = [],
  areas = [],
  pickup = false,
  producer = null,
}) {
  const t = useTranslations("group_buys.delivery");
  const tMap = useTranslations("map.mini");
  // MEH-1646 (a): weekday labels for the cutoff day ("יום רביעי").
  const tWeekdays = useTranslations("opening_hours.weekdays");
  const hasAreas = areas.length > 0;
  // MEH-1646 (a): non-null ONLY when order_window has exactly one open day —
  // the one unambiguous "מקבלים הזמנות עד" case. Clock-free → SSR-safe.
  const cutoff = getSingleOrderCutoff(producer?.order_window);
  const cutoffDayLabel = cutoff ? tWeekdays(WEEKDAY_SHORT_KEYS[cutoff.dayIndex]) : null;
  // MEH-1577: null when the owner stated neither value → no line renders.
  const feeSegments = buildFeeSegments(
    producer?.delivery_fee,
    producer?.free_delivery_above,
    t,
  );
  // MEH-1512 (MEH-1509 chunk 2): real pickup / market_stand rows from
  // locations[]. Branch-kind is out of scope (sibling ticket) → filtered out.
  const pickupLocations = (producer?.locations || []).filter(
    (l) => l && (l.kind === "pickup" || l.kind === "market_stand"),
  );
  const hasPickupRows = pickupLocations.length > 0;
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

      {/* MEH-1536: "מגיעים אלייך?" checker — ADDITIVE, at the top of the block.
          Self-gates (offers_delivery, and hides when the answer is trivially
          yes or uniformly no — see DeliveryChecker.jsx:70-83). Everything
          below it — grouped rows, CompactCities, pickup — is untouched
          (MEH-1435 lock: cities are never hidden behind a search box). */}
      <DeliveryChecker
        offersDelivery={!!producer?.offers_delivery}
        nationwide={nationwide}
        excluded={excluded}
        areas={areas}
      />

      {/* MEH-1577: cost before geography — the reader's first question is
          "what does delivery cost", not "where do they go" (Baymard: surprise
          costs are the #1 abandonment driver). Absent from the DOM entirely
          when the owner has stated neither value. The ₪ amounts are bidi-
          isolated for the same reason AreaRow's min_order is (MEH-1168 P1):
          RTL otherwise reorders "35₪". */}
      {feeSegments && (
        <p
          className="flex items-center gap-1.5 text-sm text-text mb-4"
          data-testid="delivery-fee-line"
        >
          <Truck size={16} className="text-primary" aria-hidden="true" />
          <span>
            {feeSegments.map((seg, i) => (
              <span key={seg.before || i}>
                {i > 0 && " · "}
                {seg.before}
                {seg.amount != null && <bdi>{seg.amount}</bdi>}
                {seg.after}
              </span>
            ))}
          </span>
        </p>
      )}

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
              <p
                className="flex items-center gap-1.5 text-sm text-fg-muted mb-2"
                data-testid="delivery-order-cutoff"
              >
                <Truck size={16} className="text-primary" aria-hidden="true" />
                {/* MEH-1646 (a): with a single-day order window the cutoff line
                    REPLACES dispatch_days — day still stated exactly once. */}
                {cutoff
                  ? t("order_cutoff_with_day", {
                      day: cutoffDayLabel,
                      time: cutoff.close,
                      delivery_day: grouped.day,
                    })
                  : t("dispatch_days", { day: grouped.day })}
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
              {/* MEH-1646 (a): 2+ distinct delivery days → no single day to
                  promise, so the cutoff renders WITHOUT the delivery half. */}
              {cutoff && (
                <p
                  className="flex items-center gap-1.5 text-sm text-fg-muted -mb-2"
                  data-testid="delivery-order-cutoff"
                >
                  <Truck size={16} className="text-primary" aria-hidden="true" />
                  {t("order_cutoff", { day: cutoffDayLabel, time: cutoff.close })}
                </p>
              )}
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

      {/* Self-pickup (MEH-1512): render real pickup / market_stand rows from
          producer.locations[] when present — city · label · hours · Waze nav.
          Fallback preserved (invention-fix 6): pickup_points true but no
          location rows → today's generic single line, so no producer loses
          information. MEH-1461 language lock: "איסוף עצמי" only. */}
      {hasPickupRows ? (
        <PickupRows locations={pickupLocations} t={t} tMap={tMap} />
      ) : (
        pickup && (
          <p className="flex items-center gap-2 text-sm text-text mb-4">
            <Package size={18} className="text-primary" aria-hidden="true" />
            {t("pickup")}
            {/* MEH-1646 (b): the generic fallback line carries the same tag
                as the location rows — no producer shape misses it. */}
            <span className="text-fg-muted">{t("free")}</span>
          </p>
        )
      )}
    </section>
  );
}
