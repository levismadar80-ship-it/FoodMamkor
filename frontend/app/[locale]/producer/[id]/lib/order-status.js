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
 *           MEH-2383 — `israelTime` / `israelDayKey` derive from
 *           lib/orderWindow.js `israelNowParts` instead of carrying a second
 *           private Asia/Jerusalem formatter (israel-clock-guard.sh).
 */

import { DAY_KEYS } from "@/lib/hours";
import { israelNowParts } from "@/lib/orderWindow";

const pad2 = (n) => String(n).padStart(2, "0");

/**
 * Israel-local "HH:MM" for a Date — zero-padded, the stored/transported shape
 * (lib/time-format.js `humanTime` strips the pad at render). Midnight is
 * "00:MM": `israelNowParts` already folds the "24" some ICU builds emit.
 */
export function israelTime(date) {
  const { minutes } = israelNowParts(date);
  return `${pad2(Math.floor(minutes / 60))}:${pad2(minutes % 60)}`;
}

/**
 * Israel-local weekday key (sun…sat) for a Date — indexes opening_hours.weekdays.
 * Returns null if the ICU abbreviation matches nothing, so a caller can fall
 * back instead of interpolating `weekdays.undefined` into a message lookup.
 * Mirrors the `if (dayIndex < 0) return null` guard in orderWindow.js.
 */
export function israelDayKey(date) {
  const { dayIndex } = israelNowParts(date);
  return dayIndex < 0 ? null : DAY_KEYS[dayIndex];
}

/**
 * Resolve the single status element. First match wins (MEH-1546):
 *   1 vacation            → gold-deep, copy unchanged
 *   2 full/full_this_week → muted, copy unchanged
 *   3 order window closed → muted, "orders closed now · reopening {day} at {time}"
 *   4 order window open   → primary, "open for orders · until {time}"
 *   5 no order window     → primary, "open for orders" (byte-identical to pre-1546)
 *
 * Why this is a mapper and not a second line: ProducerHeader already owned a
 * 3-state ORDER status derived from availability_state. A second, window-derived
 * line would be a factual CONTRADICTION, not merely a second green — a producer
 * with availability_state=available and a window that closed at 14:00 would
 * assert both "open for orders" and "orders closed now" on the same page at
 * 16:00.
 *
 * `orderStatus` is null on the server pass and until mount, so SSR always
 * resolves to branch 5's semantics — no hydration mismatch on a time-derived
 * value (MEH-1531 precedent).
 *
 * `closing_soon` is deliberately NOT a visual state: the helper still returns
 * it, and it maps to branch 4. The "until {time}" suffix carries the cutoff
 * honestly — no urgency styling, no countdown.
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
    // could carry it, and the "reopening {day} at {time}" copy would then
    // format null as the epoch (rendering a bogus Thursday 02:00). With no
    // reopening time to state, degrade to the plain closed copy rather than
    // inventing one.
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

/**
 * MEH-2596: text colour for the status TAG (dot + 10% tint of the text
 * colour). `muted` (#6b6860) on its own tint measures 4.33:1 — under AA — so
 * the tag uses the darker `fg-muted` for the grey states. primary (5.01:1)
 * and gold-deep (4.90:1) pass on their tints and are kept.
 */
export function statusTagTone(tone) {
  return tone === "text-muted" ? "text-fg-muted" : tone;
}
