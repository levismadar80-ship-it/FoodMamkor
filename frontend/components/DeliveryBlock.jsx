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
//
// MEH-1772 chunk 3: `fee` is the row's EFFECTIVE per-area delivery fee, and is
// non-null ONLY when fees actually vary across the producer's areas (see
// feeVaries below). When they don't, every row would print the same number the
// top line already states, so the caller passes null and this renders exactly
// the markup it rendered before this ticket — the "uniform → byte-identical"
// half of the acceptance criteria is enforced here, by the null, not by a
// separate branch further up.
//
// `fee != null` and not `fee ?` for the same reason the producer-level line
// uses explicit null gates (MEH-1577): 0 is a VALUE ("משלוח חינם"), and a
// truthiness test would silently render the free case as "no fee stated".
function AreaRow({ da, t, fee = null }) {
  const feeLabel =
    fee === 0 ? null : splitAroundAmount(t("fee", { amount: AMOUNT_SENTINEL }));
  return (
    <li className="flex items-center justify-between gap-3 py-2.5 text-sm">
      <span className="font-medium text-text">{da.city}</span>
      <span className="flex items-center gap-2">
        {fee != null ? (
          <span className="text-fg-muted" data-testid="area-fee">
            {/* bdi, not dir="ltr": the amount sits INSIDE a Hebrew sentence
                here (unlike min_order below, which is its own phrase), so
                isolating the whole span would reorder the Hebrew around it. */}
            {feeLabel ? (
              <>
                {feeLabel.before}
                <bdi>{formatPrice(fee)}</bdi>
                {feeLabel.after}
              </>
            ) : (
              t("fee_free")
            )}
          </span>
        ) : null}
        {da.min_order ? (
          <span className="text-fg-muted">
            {/* MEH-1168 P1 (bidi): isolate the ₪ amount so RTL keeps "150₪". */}
            {t("min_order")} <span dir="ltr">{formatPrice(da.min_order)}</span>
          </span>
        ) : null}
      </span>
    </li>
  );
}

// MEH-1903: preview cap for the MEH-1305 editorial area rows, which rendered
// every area unbounded in all three modes. Same progressive-disclosure idiom
// already proven twice in this file — CompactCities (CITY_PREVIEW_LIMIT, :125)
// and PickupRows (PICKUP_PREVIEW_LIMIT, :209): slice + one reused
// show_all/show_less toggle. Nothing is deleted; the rest is one tap away.
//
// 6 and not the compact list's 15 because these rows are ~7x taller: a city
// row here carries min_order and (under MEH-1772 variance) a per-area fee,
// while a compact entry is a bare middot-separated name.
const AREA_PREVIEW_LIMIT = 6;

// MEH-1903: the area section's show-more/less control. Anatomy is copied from
// CompactCities' toggle verbatim — same two i18n keys, same Phosphor carets,
// same aria-expanded and text-primary — so the third disclosure surface in this
// file is indistinguishable from the two that predate it.
// REUSES: frontend/components/DeliveryBlock.jsx:147-161 (CompactCities toggle)
function AreaToggle({ expanded, onToggle, hiddenCount, t }) {
  return (
    <button
      type="button"
      onClick={onToggle}
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
  );
}

// MEH-1903: apply the cap ACROSS a list of day groups rather than within each
// one — the criterion is the total number of visible rows, so a single toggle
// can honestly name how many rows remain.
//
// Walks in the order given (day groups first, "arranged" bucket last) and stops
// once the budget is spent. A group whose rows all fall past the cap drops out
// ENTIRELY, header included — rendering a day heading over zero rows would state
// a dispatch day the reader cannot act on, which is the opposite of the
// MEH-1305 day-once discipline this preserves.
//
// Callers never pass a section with zero rows, so every section returned here
// has at least one visible row (the `budget <= 0` break guarantees the slice is
// non-empty).
function capSections(sections, limit) {
  let budget = limit;
  const visible = [];
  for (const section of sections) {
    if (budget <= 0) break;
    const rows = section.rows.slice(0, budget);
    visible.push({ ...section, rows });
    budget -= rows.length;
  }
  return visible;
}

// A day-headed group (2+ distinct days) or the trailing "arranged" bucket.
// MEH-1772 chunk 3: `feeOf` resolves a row's effective fee (or null when fees
// don't vary) — threaded through rather than recomputed here so the variance
// decision is made exactly once, in the component below.
function AreaGroup({ label, rows, t, feeOf = () => null }) {
  return (
    <div>
      <p className="flex items-center gap-1.5 text-sm font-medium text-text mb-1">
        <Truck size={16} className="text-primary" aria-hidden="true" />
        {label}
      </p>
      <ul className="divide-y divide-border border-y border-border">
        {rows.map((da) => (
          <AreaRow key={da.id ?? da.city} da={da} t={t} fee={feeOf(da)} />
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
//
// MEH-1903: 5 → 3. Pickup rows are the tallest rows in the block (heading +
// up to two sublines + a Waze link each), so five of them push the section
// below the fold on 375px before the reader has seen the delivery answer.
// Only the number changes — the component below is untouched.
const PICKUP_PREVIEW_LIMIT = 3;

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

// MEH-1772 chunk 3: `from` switches the fee half to "משלוח מ-{amount}" — used
// when per-area fees VARY, where a single number would misstate the cost for
// every area that isn't the cheapest.
//
// It also suppresses the fee===0 → "משלוח חינם" shortcut, deliberately. With
// variance, a minimum of 0 means "some areas are free, others are not", which
// is the opposite of what "משלוח חינם" claims; "משלוח מ-0₪" is literal and
// true. Guarding this is the difference between the free case and the
// cheapest-area case, which look identical to a truthiness test.
function buildFeeSegments(fee, threshold, t, { from = false } = {}) {
  const hasFee = fee != null;
  const hasThreshold = threshold != null;
  if (!hasFee && !hasThreshold) return null;
  // fee===0 suppresses the threshold on purpose. Both can be set (the
  // validators allow fee >= 0 with threshold > 0), but "delivery is free ·
  // free above 250₪" puts a condition on something already unconditional.
  if (hasFee && fee === 0 && !from)
    return [{ before: t("fee_free"), amount: null, after: "" }];
  const segments = [];
  if (hasFee) {
    segments.push({
      ...splitAroundAmount(t(from ? "fee_from" : "fee", { amount: AMOUNT_SENTINEL })),
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
  // MEH-1903: one expansion state for the whole area section — the cap is on
  // the TOTAL row count across modes, so a per-group state would be a different
  // feature (and is explicitly out of scope).
  const [areasExpanded, setAreasExpanded] = useState(false);
  const hasAreas = areas.length > 0;
  // MEH-1646 (a): non-null ONLY when order_window has exactly one open day —
  // the one unambiguous "מקבלים הזמנות עד" case. Clock-free → SSR-safe.
  const cutoff = getSingleOrderCutoff(producer?.order_window);
  const cutoffDayLabel = cutoff ? tWeekdays(WEEKDAY_SHORT_KEYS[cutoff.dayIndex]) : null;
  // MEH-1772 chunk 3: per-area fee override with producer-level fallback.
  //
  // The API serializes delivery_fee per area WITHOUT coalescing it (schemas.py:
  // 849-855) precisely so the fallback resolves here — a pre-coalesced value
  // cannot distinguish "this area overrides with the same number" from "this
  // area inherits", and that distinction is what the variance test needs.
  //
  // `??` and not `||` throughout: an area fee of 0 is a real override
  // ("משלוח חינם" for that city) and `||` would fall through to the producer
  // rate, silently charging for a free area. Areas with no effective fee at
  // all (no override, no producer-level rate) drop out rather than counting
  // as 0 — "not stated" is not "free".
  const producerFee = producer?.delivery_fee ?? null;
  const effectiveFees = areas
    .map((da) => da.delivery_fee ?? producerFee)
    .filter((f) => f != null);
  const feeVaries = new Set(effectiveFees).size > 1;
  // Only meaningful under variance; Math.min of an empty list is Infinity, so
  // the feeVaries guard (which requires 2+ distinct values) also guarantees a
  // non-empty list here.
  const minAreaFee = feeVaries ? Math.min(...effectiveFees) : null;
  // Resolved from the ORIGINAL `areas`, keyed the same way the rows are keyed
  // — NOT from the row object handed back by groupDeliveryAreas.
  //
  // That helper rebuilds each row with an explicit four-field literal
  // (deliveryGroups.js:30-35: id, city, min_order, delivery_day), so any field
  // added to delivery_areas is dropped on the way through. Reading
  // `row.delivery_fee` therefore yields undefined and every row silently falls
  // back to the producer rate — rows still render, with the wrong number, and
  // only the top line looks right. Going back to the source makes the fee
  // independent of what that helper happens to preserve.
  const feeByKey = new Map(
    areas.map((da) => [da.id ?? da.city, da.delivery_fee ?? producerFee]),
  );
  // null unless fees vary → AreaRow renders exactly as it did pre-ticket.
  // `?? null` (not `||`) so a resolved 0 survives as "משלוח חינם".
  const feeOf = (da) => (feeVaries ? (feeByKey.get(da.id ?? da.city) ?? null) : null);
  // MEH-1577: null when the owner stated neither value → no line renders.
  const feeSegments = buildFeeSegments(
    feeVaries ? minAreaFee : producer?.delivery_fee,
    producer?.free_delivery_above,
    t,
    { from: feeVaries },
  );
  // MEH-1512 (MEH-1509 chunk 2): real pickup / market_stand rows from
  // locations[]. Branch-kind is out of scope (sibling ticket) → filtered out.
  const pickupLocations = (producer?.locations || []).filter(
    (l) => l && (l.kind === "pickup" || l.kind === "market_stand"),
  );
  const hasPickupRows = pickupLocations.length > 0;
  // MEH-1435: city-only areas (no minimum, no dispatch day) render as a compact
  // list; anything info-bearing keeps the MEH-1305 editorial rows unchanged.
  // MEH-1772 chunk 3: `!feeVaries` guards the collapse. CompactCities renders
  // city NAMES only, so a producer whose areas carry differing fees but no
  // min_order/day would show "משלוח מ-20₪" on the top line and then no
  // per-area fee anywhere — the variance stated and then hidden. Under
  // variance the editorial rows are required to carry it. Fees are uniform or
  // absent for every producer that reaches compact mode today, so this cannot
  // change an existing render (MEH-1435 lock intact).
  const bare =
    hasAreas && !feeVaries && areas.every((da) => !da.min_order && !da.delivery_day);
  const grouped = hasAreas && !bare ? groupDeliveryAreas(areas) : null;
  // MEH-1903: the editorial rows, flattened to ONE shape the cap can reason
  // about regardless of mode. Group mode is a list of labelled sections;
  // hoist/flat are a single unlabelled section, so they share the same walk and
  // the same total. `arranged` goes last, matching the render order below.
  const areaSections =
    grouped == null
      ? []
      : grouped.mode === "group"
        ? [
            // Keys are namespaced (`day:` / `bucket:`) so a delivery_day whose
            // literal text happened to match a sentinel cannot collide with the
            // arranged bucket — delivery_day is owner-entered text, not an enum.
            ...grouped.groups.map((g) => ({
              key: `day:${g.day}`,
              label: t("delivery_day_group", { day: g.day }),
              rows: g.rows,
            })),
            ...(grouped.arranged.length > 0
              ? [{ key: "bucket:arranged", label: t("arranged_group"), rows: grouped.arranged }]
              : []),
          ]
        : [{ key: "bucket:rows", label: null, rows: grouped.rows }];
  const areaRowCount = areaSections.reduce((n, s) => n + s.rows.length, 0);
  const areasOverLimit = areaRowCount > AREA_PREVIEW_LIMIT;
  const areasHiddenCount = areaRowCount - AREA_PREVIEW_LIMIT;
  // At or under the cap this is the identity, so the markup is byte-identical
  // to the pre-ticket render — the "≤6 rows changes nothing" criterion is
  // enforced here, by the pass-through, not by a separate branch below.
  const showAllAreas = areasExpanded || !areasOverLimit;
  const visibleSections = showAllAreas
    ? areaSections
    : capSections(areaSections, AREA_PREVIEW_LIMIT);
  // hoist/flat read the single section's rows back out. Explicitly empty in
  // group mode: `visibleSections[0]` is the first DAY GROUP there, so an
  // unguarded read would hand a group's rows to a branch that renders them
  // ungrouped. The three mode branches below are mutually exclusive, so this
  // cannot fire today — the guard is here so that stays true if one moves.
  const visibleAreaRows =
    grouped?.mode === "group" ? [] : (visibleSections[0]?.rows ?? []);
  const areaToggle = areasOverLimit ? (
    <AreaToggle
      expanded={areasExpanded}
      onToggle={() => setAreasExpanded((v) => !v)}
      hiddenCount={areasHiddenCount}
      t={t}
    />
  ) : null;
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
        producer={producer}
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
              {/* MEH-1903: first AREA_PREVIEW_LIMIT rows until expanded. */}
              <ul className="divide-y divide-border border-y border-border">
                {visibleAreaRows.map((da) => (
                  <AreaRow key={da.id ?? da.city} da={da} t={t} fee={feeOf(da)} />
                ))}
              </ul>
              {areaToggle}
            </>
          )}

          {grouped.mode === "flat" && (
            <>
              <ul className="divide-y divide-border border-y border-border">
                {visibleAreaRows.map((da) => (
                  <AreaRow key={da.id ?? da.city} da={da} t={t} fee={feeOf(da)} />
                ))}
              </ul>
              {areaToggle}
            </>
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
              {/* MEH-1903: day groups then the "arranged" bucket, capped on the
                  TOTAL visible rows — a group entirely past the cap is absent
                  header and all while collapsed. One toggle for the section. */}
              {visibleSections.map((s) => (
                <AreaGroup key={s.key} label={s.label} rows={s.rows} t={t} feeOf={feeOf} />
              ))}
              {areaToggle}
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
