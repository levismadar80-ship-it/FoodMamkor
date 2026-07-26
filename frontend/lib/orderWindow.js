/**
 * Module:   orderWindow
 * Purpose:  Derive the CURRENT order-acceptance status from a producer's
 *           weekly `order_window` (MEH-1543) — open / closing_soon / closed,
 *           plus when the window next changes — and compress the weekly map
 *           into display ranges ("א׳–ה׳ 9:00–14:00").
 * Touches:  the clock. Everything here is time-derived and therefore
 *           client-only (see the SSR note below).
 * Does NOT: fetch, render, or decide colour/copy — the component owns that.
 *           It also does not SERIALIZE the editor model; that is the
 *           dashboard's lib/order-window.js (MEH-1544), a deliberately
 *           separate module on the write path.
 * Related:  frontend/lib/hours.js (DAY_KEYS + the Asia/Jerusalem idiom this
 *           mirrors), backend/app/schemas/schemas.py (_order_window_validator
 *           — the shape guarantees relied on here).
 * History:  MEH-1546 — chunk 3/3 of חלון הזמנות.
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

/** Normalised {openMin, closeMin} for a day index, or null when closed/invalid. */
function dayRange(orderWindow, dayIndex) {
  const entry = orderWindow?.[ORDER_DAY_KEYS[dayIndex]];
  if (!entry) return null;
  const openMin = toMinutes(entry.open);
  const closeMin = toMinutes(entry.close);
  // The backend guarantees close > open; a hand-edited row that violates it is
  // treated as closed rather than rendered as a nonsense range.
  if (openMin === null || closeMin === null || closeMin <= openMin) return null;
  return { openMin, closeMin };
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

  const today = dayRange(orderWindow, dayIndex);
  if (today && minutes >= today.openMin && minutes < today.closeMin) {
    const untilClose = today.closeMin - minutes;
    return {
      state: untilClose <= CLOSING_SOON_MINUTES ? "closing_soon" : "open",
      nextChange: dateFromOffset(now, today.closeMin - minutes),
    };
  }

  // Closed now — find the next opening, scanning today (later today) then the
  // following 7 days so a single-day window wraps to next week.
  if (today && minutes < today.openMin) {
    return { state: "closed", nextChange: dateFromOffset(now, today.openMin - minutes) };
  }
  for (let ahead = 1; ahead <= 7; ahead += 1) {
    const idx = (dayIndex + ahead) % 7;
    const range = dayRange(orderWindow, idx);
    if (!range) continue;
    const offset = ahead * MINUTES_PER_DAY - minutes + range.openMin;
    return { state: "closed", nextChange: dateFromOffset(now, offset) };
  }
  // A window object exists but no day is usable (all invalid).
  return { state: "closed", nextChange: null };
}

function dateFromOffset(now, minutesAhead) {
  return new Date(now.getTime() + minutesAhead * 60 * 1000);
}

/**
 * Compress the weekly window into display ranges, merging CONSECUTIVE days
 * that share identical hours: [{fromDay: 0, toDay: 4, open, close}, …].
 * Days are indices into DAY_KEYS so the caller supplies localized labels.
 */
export function getOrderWindowRanges(orderWindow) {
  if (isEmptyWindow(orderWindow)) return [];
  const out = [];
  for (let i = 0; i < 7; i += 1) {
    const range = dayRange(orderWindow, i);
    if (!range) continue;
    const entry = orderWindow[ORDER_DAY_KEYS[i]];
    const prev = out[out.length - 1];
    if (
      prev &&
      prev.toDay === i - 1 &&
      prev.open === entry.open &&
      prev.close === entry.close
    ) {
      prev.toDay = i;
    } else {
      out.push({ fromDay: i, toDay: i, open: entry.open, close: entry.close });
    }
  }
  return out;
}
