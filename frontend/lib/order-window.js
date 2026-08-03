/**
 * Module:   order-window
 * Purpose:  Convert between the backend `producers.order_window` JSONB shape
 *           ({"sunday": {open, close}, …}) and the 7-row editor model the
 *           dashboard renders, plus the client-side mirror of the backend's
 *           close>open rule.
 * Does NOT: derive "open now" — that is the public page's job (MEH-1546,
 *           lib/orderWindow status helper). Nothing here reads the clock.
 * Related:  frontend/lib/hours-serialize.js (same day-row model for the
 *           free-text opening_hours axis — deliberately NOT shared: that one
 *           serializes to a string, this one to a JSON object),
 *           backend/app/schemas/schemas.py:16 (_order_window_validator — the
 *           authority these rules mirror).
 * History:  MEH-1544 — dashboard order-window editor (chunk 2/3).
 */

// Storage keys, index-aligned with lib/hours.js DAY_KEYS (sun…sat) so a row
// index means the same weekday on both axes. The backend accepts any subset of
// these seven; a day absent = orders closed that day.
// REUSES: backend/app/schemas/schemas.py:22 (_ORDER_WINDOW_DAYS) — same order.
export const ORDER_WINDOW_DAYS = [
  "sunday",
  "monday",
  "tuesday",
  "wednesday",
  "thursday",
  "friday",
  "saturday",
];

export const DEFAULT_ORDER_OPEN = "09:00";
export const DEFAULT_ORDER_CLOSE = "14:00";

// Zero-padded 24h — mirrors the backend regex so the client rejects the same
// strings the API would 422 on. `<input type="time">` already emits this shape;
// the guard matters for a value loaded from an older/hand-edited record.
const HHMM = /^([01]\d|2[0-3]):[0-5]\d$/;

/**
 * MEH-1869: a day carries a LIST of ranges (morning + evening — the lunch
 * break, and Friday/מוצ"ש). Capped so the editor stays a form, not a
 * scheduler. Mirrors `_MAX_ORDER_RANGES_PER_DAY` in the backend validator.
 */
export const MAX_ORDER_RANGES_PER_DAY = 3;

/** A single editor range carrying the defaults. */
export function emptyOrderRange() {
  return { from: DEFAULT_ORDER_OPEN, to: DEFAULT_ORDER_CLOSE };
}

const MINUTES_IN_DAY = 24 * 60;
const NEW_RANGE_LENGTH_MIN = 2 * 60;
const LAST_MINUTE_OF_DAY = "23:59";

const toMin = (hhmm) => Number(hhmm.slice(0, 2)) * 60 + Number(hhmm.slice(3, 5));
const toHHMM = (min) =>
  `${String(Math.floor(min / 60)).padStart(2, "0")}:${String(min % 60).padStart(2, "0")}`;

/**
 * The range to append after `last`.
 *
 * Starts where the previous one ended (adjacency is legal — the backend allows
 * `next.open === prev.close`) and runs two hours, clamped to the end of the day.
 * Without this, "+ range" appended the generic 09:00–14:00 default, which on any
 * day that already had a morning block was INSTANTLY invalid — the owner would
 * tap add and be met with an overlap error she did not cause. Caught in the
 * MEH-1869 self-QA, where the editor correctly refused to save its own default.
 */
export function nextOrderRange(last) {
  if (!last || !HHMM.test(last.to ?? "")) return emptyOrderRange();
  const from = toMin(last.to);
  if (from >= MINUTES_IN_DAY - 1) return { from: last.to, to: LAST_MINUTE_OF_DAY };
  const to = Math.min(from + NEW_RANGE_LENGTH_MIN, MINUTES_IN_DAY - 1);
  return { from: toHHMM(from), to: toHHMM(to) };
}

/** A closed row carrying one default range, so toggling it on is one click. */
export function emptyOrderDay() {
  return { open: false, ranges: [emptyOrderRange()] };
}

/**
 * order_window object → 7 editor rows. `null`/`undefined`/`{}` (the
 * feature-unused state) yields seven closed rows. Unknown day keys and
 * malformed times are ignored rather than thrown — a corrupt stored value
 * should still open an editable form, not blank the dashboard.
 *
 * MEH-1869: accepts BOTH stored shapes. A legacy single `{open, close}` dict
 * is read as a one-range day, so a row written before the cutover prefills
 * exactly as it always did.
 */
export function daysFromOrderWindow(orderWindow) {
  return ORDER_WINDOW_DAYS.map((key) => {
    const entry = orderWindow?.[key];
    if (!entry) return emptyOrderDay();
    const list = Array.isArray(entry) ? entry : [entry];
    const ranges = list
      .filter((r) => HHMM.test(r?.open ?? "") && HHMM.test(r?.close ?? ""))
      .slice(0, MAX_ORDER_RANGES_PER_DAY)
      .map((r) => ({ from: r.open, to: r.close }));
    if (ranges.length === 0) return emptyOrderDay();
    return { open: true, ranges };
  });
}

/**
 * 7 editor rows → the order_window payload. Returns `null` when no day is
 * open, which is exactly the "clear the field" body the backend expects
 * (explicit null clears; see producer_me PUT).
 *
 * MEH-1869: always writes the LIST shape, including for a single range.
 */
export function serializeOrderWindow(days) {
  const out = {};
  days.forEach((day, i) => {
    if (!day?.open || !day.ranges?.length) return;
    out[ORDER_WINDOW_DAYS[i]] = day.ranges.map((r) => ({ open: r.from, close: r.to }));
  });
  return Object.keys(out).length > 0 ? out : null;
}

/**
 * Indices of open rows that the backend would reject — the client mirror of
 * `_order_window_validator`. String compare is valid because both values are
 * zero-padded HH:MM. A malformed time also counts as invalid so the row is
 * flagged before the API rejects it.
 *
 * A row is bad when ANY of: no ranges; more than the cap; a range whose close
 * is not strictly after its open; or two ranges that overlap or are out of
 * order. The last two are one comparison — a range starting before the
 * previous one ended is unrepresentable either way. Adjacency (13:00 → 13:00)
 * is allowed, matching the backend.
 */
export function invalidOrderDayIndices(days) {
  return orderDayIssues(days).map((issue) => issue.index);
}

/**
 * Same rule set as `invalidOrderDayIndices`, but keeps WHY the row is bad so
 * the editor can say which problem it is. Two ranges that overlap and a single
 * range that ends before it starts are different mistakes, and one shared
 * message would describe at most one of them correctly.
 *
 * @returns {Array<{index: number, reason: "invalid_range"|"invalid_overlap"}>}
 */
export function orderDayIssues(days) {
  const issues = [];
  days.forEach((day, i) => {
    if (!day?.open) return;
    const ranges = day.ranges ?? [];
    if (ranges.length === 0 || ranges.length > MAX_ORDER_RANGES_PER_DAY) {
      issues.push({ index: i, reason: "invalid_range" });
      return;
    }
    let prevTo = null;
    for (const range of ranges) {
      if (!HHMM.test(range?.from) || !HHMM.test(range?.to) || range.to <= range.from) {
        issues.push({ index: i, reason: "invalid_range" });
        return;
      }
      if (prevTo !== null && range.from < prevTo) {
        issues.push({ index: i, reason: "invalid_overlap" });
        return;
      }
      prevTo = range.to;
    }
  });
  return issues;
}
