/**
 * Module:   order-status
 * Purpose:  Pure mapper + formatters behind the producer page's SINGLE status
 *           element — resolves which of the five precedence branches wins and
 *           formats the Israel-local day/time the copy interpolates.
 * Does NOT: derive the order window itself (that is lib/orderWindow.js) and
 *           does not render — ProducerHeader.jsx owns the markup.
 * Related:  components/ProducerHeader.jsx (sole consumer),
 *           lib/producer-format.js (sibling pure helper for this page).
 * History:  MEH-1546 — extracted from ProducerHeader so the mapper is unit
 *           testable: importing the component pulls next-intl → next/navigation
 *           into vitest, which does not resolve under this config.
 */

const DAY_KEYS = ["sun", "mon", "tue", "wed", "thu", "fri", "sat"];
const DAY_ABBR = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

/** Israel-local "HH:MM" for a Date. */
export function israelTime(date) {
  return new Intl.DateTimeFormat("en-GB", {
    timeZone: "Asia/Jerusalem",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(date);
}

/**
 * Israel-local weekday key (sun…sat) for a Date — indexes opening_hours.weekdays.
 * Returns null if the ICU abbreviation matches nothing, so a caller can fall
 * back instead of interpolating `weekdays.undefined` into a message lookup.
 * Mirrors the `if (dayIndex < 0) return null` guard in orderWindow.js.
 */
export function israelDayKey(date) {
  const abbr = new Intl.DateTimeFormat("en-US", {
    timeZone: "Asia/Jerusalem",
    weekday: "short",
  }).format(date);
  const idx = DAY_ABBR.findIndex((d) => abbr.startsWith(d));
  return idx < 0 ? null : DAY_KEYS[idx];
}

/**
 * Resolve the single status element. First match wins (MEH-1546):
 *   1 vacation            → gold-deep, copy unchanged
 *   2 full/full_this_week → muted, copy unchanged
 *   3 order window closed → muted, "ההזמנות סגורות עכשיו · נפתחות {יום} ב־{שעה}"
 *   4 order window open   → primary, "פתוח להזמנות · עד {שעה}"
 *   5 no order window     → primary, "פתוח להזמנות" (byte-identical to pre-1546)
 *
 * Why this is a mapper and not a second line: ProducerHeader already owned a
 * 3-state ORDER status derived from availability_state. A second, window-derived
 * line would be a factual CONTRADICTION, not merely a second green — a producer
 * with availability_state=available and a window that closed at 14:00 would
 * assert "פתוח להזמנות" and "ההזמנות סגורות עכשיו" on the same page at 16:00.
 *
 * `orderStatus` is null on the server pass and until mount, so SSR always
 * resolves to branch 5's semantics — no hydration mismatch on a time-derived
 * value (MEH-1531 precedent).
 *
 * `closing_soon` is deliberately NOT a visual state: the helper still returns
 * it, and it maps to branch 4. "עד {שעה}" carries the cutoff honestly — no
 * urgency styling, no countdown.
 */
export function resolveHeaderStatus({ isVacation, isClosed, orderStatus }) {
  if (isVacation) {
    return { branch: "vacation", tone: "text-gold-deep", testid: "status-vacation" };
  }
  if (isClosed) {
    return { branch: "closed", tone: "text-muted", testid: "status-closed" };
  }
  if (orderStatus?.state === "closed") {
    // A window object whose every day is unusable (close <= open on all of
    // them) yields nextChange=null — orderWindow.js's last return. The backend
    // validator blocks that shape on write, but a hand-edited or legacy row
    // could carry it, and "נפתחות {יום} ב־{שעה}" would then format null as the
    // epoch ("ה׳ 02:00"). With no reopening time to state, degrade to the plain
    // closed copy rather than inventing one.
    if (!orderStatus.nextChange) {
      return { branch: "closed", tone: "text-muted", testid: "status-closed" };
    }
    return {
      branch: "orders_closed",
      tone: "text-muted",
      testid: "status-orders-closed",
      nextChange: orderStatus.nextChange,
    };
  }
  if (orderStatus?.state === "open" || orderStatus?.state === "closing_soon") {
    return {
      branch: "orders_open",
      tone: "text-primary",
      testid: "status-open",
      nextChange: orderStatus.nextChange,
    };
  }
  return { branch: "open", tone: "text-primary", testid: "status-open" };
}
