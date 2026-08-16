/**
 * Module:   orderWindow
 * Purpose:  Derive the CURRENT order-acceptance status from a producer's
 *           weekly `order_window` (MEH-1543) — open / closing_soon / closed,
 *           plus when the window next changes — and compress the weekly map
 *           into display ranges (rendered like "Sun–Thu 9:00–14:00").
 * Touches:  the clock. Everything here is time-derived and therefore
 *           client-only (see the SSR note below).
 * Does NOT: fetch, render, or decide colour/copy — the component owns that.
 *           It also does not SERIALIZE the editor model; that is the
 *           dashboard's lib/order-window.js (MEH-1544), a deliberately
 *           separate module on the write path.
 * Related:  frontend/lib/hours.js (DAY_KEYS + the Asia/Jerusalem idiom this
 *           mirrors), backend/app/schemas/schemas.py (_order_window_validator
 *           — the shape guarantees relied on here).
 * History:  MEH-1546 — chunk 3/3 of the order-window feature.
 *
 * SSR: never call these from render on the server. The status depends on "now"
 * in Asia/Jerusalem, so a server pass and the client hydration can disagree and
 * React will warn/mismatch. Callers compute inside useEffect behind a mounted
 * guard (MEH-1531 fridayMode precedent — time-dependent UI is also why VRT
 * baselines must not capture a live status).
 */

// Index-aligned with lib/hours.js DAY_KEYS (sun…sat) and with the backend's
// _ORDER_WINDOW_DAYS, so index 0 means Sunday on every axis.
export const ORDER_DAY_KEYS = [
  "sunday",
  "monday",
  "tuesday",
  "wednesday",
  "thursday",
  "friday",
  "saturday",
];

/** Minutes to close at which we start warning. */
export const CLOSING_SOON_MINUTES = 60;

const MINUTES_PER_DAY = 24 * 60;

/** "HH:MM" → minutes since midnight. Returns null for a malformed value. */
function toMinutes(hhmm) {
  if (typeof hhmm !== "string") return null;
  const m = /^([01]\d|2[0-3]):([0-5]\d)$/.exec(hhmm);
  return m ? Number(m[1]) * 60 + Number(m[2]) : null;
}

/**
 * Israel-local {dayIndex, minutes} for a Date.
 *
 * Uses Intl parts rather than getDay()/getHours() so the answer is correct
 * regardless of the viewer's own timezone — a producer's window is stated in
 * Israel time, and a customer abroad must see the same status a local sees.
 * REUSES: components/OpeningHours.jsx:25 (same Asia/Jerusalem idiom).
 */
export function israelNowParts(now = new Date()) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "Asia/Jerusalem",
    weekday: "short",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).formatToParts(now);
  const get = (t) => parts.find((p) => p.type === t)?.value ?? "";
  const abbr = get("weekday");
  const dayIndex = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].findIndex((d) =>
    abbr.startsWith(d)
  );
  // hour12:false can yield "24" at midnight in some ICU builds — normalise.
  const hour = Number(get("hour")) % 24;
  return { dayIndex, minutes: hour * 60 + Number(get("minute")) };
}

function isEmptyWindow(orderWindow) {
  return (
    !orderWindow ||
    typeof orderWindow !== "object" ||
    Object.keys(orderWindow).length === 0
  );
}

/**
 * MEH-1869 — the single normalisation point for BOTH stored shapes.
 *
 * Canonical is a list of ranges per day; the pre-1869 single dict is wrapped
 * into a one-element list. Every reader in this module goes through here, so
 * legacy rows cannot reach a consumer un-normalised.
 *
 * @returns {Array<{open: string, close: string}>} raw entries, already
 *   filtered to the well-formed ones and sorted by open time. Empty = closed.
 */
export function normalizeDayEntries(entry) {
  if (!entry) return [];
  const list = Array.isArray(entry) ? entry : [entry];
  return list
    .filter((r) => {
      const openMin = toMinutes(r?.open);
      const closeMin = toMinutes(r?.close);
      // The backend guarantees close > open; a hand-edited row that violates
      // it is dropped rather than rendered as a nonsense range.
      return openMin !== null && closeMin !== null && closeMin > openMin;
    })
    // Zero-padded HH:MM sorts correctly as plain text. `.filter` above already
    // returned a fresh array, so sorting in place never touches the caller's.
    .sort((first, second) => first.open.localeCompare(second.open));
}

/**
 * Normalised [{openMin, closeMin}, …] for a day index, ascending by open time.
 * Empty array when the day is closed or every stored range is malformed.
 */
function dayRanges(orderWindow, dayIndex) {
  return normalizeDayEntries(orderWindow?.[ORDER_DAY_KEYS[dayIndex]]).map((r) => ({
    openMin: toMinutes(r.open),
    closeMin: toMinutes(r.close),
  }));
}

/**
 * Current status of the weekly window.
 *
 * @returns {null | {state: 'open'|'closing_soon'|'closed', nextChange: Date|null}}
 *   `null` when the feature is unused (no window) — the caller renders nothing.
 *   `nextChange` is when the state next flips: the close time while open, the
 *   next opening while closed. It is null only if no day is open at all.
 */
export function getOrderWindowStatus(orderWindow, now = new Date()) {
  if (isEmptyWindow(orderWindow)) return null;

  const { dayIndex, minutes } = israelNowParts(now);
  if (dayIndex < 0) return null;

  // MEH-1869: a day can hold several disjoint ranges, so "am I inside one?" is
  // a scan, not a single comparison — and "closed" between two ranges of the
  // same day is a real state (the lunch break this feature exists for).
  const today = dayRanges(orderWindow, dayIndex);
  const current = today.find((r) => minutes >= r.openMin && minutes < r.closeMin);
  if (current) {
    const untilClose = current.closeMin - minutes;
    return {
      state: untilClose <= CLOSING_SOON_MINUTES ? "closing_soon" : "open",
      nextChange: dateFromOffset(now, untilClose),
    };
  }

  // Closed now — the next opening may still be LATER TODAY (after a break),
  // otherwise scan the following 7 days so a single-day window wraps.
  const laterToday = today.find((r) => minutes < r.openMin);
  if (laterToday) {
    return { state: "closed", nextChange: dateFromOffset(now, laterToday.openMin - minutes) };
  }
  for (let ahead = 1; ahead <= 7; ahead += 1) {
    const idx = (dayIndex + ahead) % 7;
    const [first] = dayRanges(orderWindow, idx);
    if (!first) continue;
    const offset = ahead * MINUTES_PER_DAY - minutes + first.openMin;
    return { state: "closed", nextChange: dateFromOffset(now, offset) };
  }
  // A window object exists but no day is usable (all invalid).
  return { state: "closed", nextChange: null };
}

function dateFromOffset(now, minutesAhead) {
  return new Date(now.getTime() + minutesAhead * 60 * 1000);
}

/**
 * MEH-1646: the single unambiguous order cutoff, or null.
 *
 * Returns {dayIndex, close} ONLY when the weekly window has exactly one valid
 * open day — that is the one case where "מקבלים הזמנות עד {day} {time}" states
 * a fact rather than a guess. With 2+ open days the "until" day depends on
 * which dispatch the order feeds (business logic the data does not encode),
 * so the caller must not render a cutoff claim at all (Phase 0 decision,
 * MEH-1646 — window→day is not derivable unambiguously in the general case).
 *
 * Clock-free like getOrderWindowRanges, so it is SSR-safe — no mounted guard
 * needed at the call site.
 */
export function getSingleOrderCutoff(orderWindow) {
  if (isEmptyWindow(orderWindow)) return null;
  let found = null;
  for (let i = 0; i < 7; i += 1) {
    const entries = normalizeDayEntries(orderWindow[ORDER_DAY_KEYS[i]]);
    if (entries.length === 0) continue;
    if (found) return null; // 2+ open days → ambiguous
    // MEH-1869: with several ranges on that one day the cutoff is the LAST
    // close — the moment orders stop for the day. Still unambiguous, which is
    // the property MEH-1646 requires; a mid-day break does not create a second
    // candidate "until" time, it only moves the final one.
    found = { dayIndex: i, close: entries[entries.length - 1].close };
  }
  return found;
}

/** Two normalised range lists describe the same schedule (order included). */
function sameRanges(left, right) {
  return (
    left.length === right.length &&
    left.every(
      (range, i) => range.open === right[i].open && range.close === right[i].close,
    )
  );
}

/**
 * Compress the weekly window into display ranges, merging CONSECUTIVE days
 * that share identical hours:
 *   [{fromDay: 0, toDay: 4, ranges: [{open, close}, …]}, …]
 * Days are indices into DAY_KEYS so the caller supplies localized labels.
 *
 * MEH-1869: `ranges` replaces the former flat `open`/`close` pair, because a
 * day can now hold up to three. Days merge only when their FULL range list
 * matches — two days that share a morning block but differ in the evening are
 * genuinely different schedules and must not collapse into one row.
 */
export function getOrderWindowRanges(orderWindow) {
  if (isEmptyWindow(orderWindow)) return [];
  const out = [];
  for (let i = 0; i < 7; i += 1) {
    const entries = normalizeDayEntries(orderWindow[ORDER_DAY_KEYS[i]]).map((r) => ({
      open: r.open,
      close: r.close,
    }));
    if (entries.length === 0) continue;
    const prev = out[out.length - 1];
    if (prev && prev.toDay === i - 1 && sameRanges(prev.ranges, entries)) {
      prev.toDay = i;
    } else {
      out.push({ fromDay: i, toDay: i, ranges: entries });
    }
  }
  return out;
}
