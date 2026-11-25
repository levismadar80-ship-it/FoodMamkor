// @ts-check
"use client";

/**
 * Module:   use-israel-today
 * Purpose:  Today's date on the Israel clock for anything a component draws
 *           from it («היום», «מחר», a list without yesterday's events).
 *           - Hydration uses the day the server rendered with, so the two
 *             renders agree even when the HTML was cached across midnight
 *             (MEH-3861).
 *           - Right after that, and whenever the day changes while the page
 *             is open, it is the visitor's own day (MEH-3805).
 * Does NOT: decide what a date means (lib/event-when.js, lib/rescue.js
 *           `bagDay`), or refetch anything: a caller whose data depends on the
 *           day keys its own fetch on the value this returns.
 * Related:  lib/israel-date.js `israelToday` (the clock itself),
 *           lib/render-time.js (the server's moment, from the HTML).
 * History:  MEH-3805 (creation). MEH-3861: useSyncExternalStore with the
 *           server's day as the hydration snapshot. The earlier
 *           useState(() => israelToday()) read the browser's day during
 *           hydration, and a page cached before midnight threw React 418.
 */

import { useSyncExternalStore } from "react";

import { israelToday } from "@/lib/israel-date";
import { documentRenderTime } from "@/lib/render-time";

// Once a minute is enough for a day label, and cheap: one Intl call. The
// tab coming back into view checks at once, so a phone woken at 07:00
// does not wait for the next tick.
const ISRAEL_TODAY_CHECK_MS = 60_000;

/** @param {() => void} onChange */
function subscribe(onChange) {
  const id = setInterval(onChange, ISRAEL_TODAY_CHECK_MS);
  document.addEventListener("visibilitychange", onChange);
  return () => {
    clearInterval(id);
    document.removeEventListener("visibilitychange", onChange);
  };
}

// eslint-disable-next-line no-restricted-syntax -- MEH-3861: the store this hook reads; the rule points here
const clientDay = () => israelToday();

// On the server: the day it renders with, the same clock the layout writes
// into <head>. In the browser this runs only while hydrating, and returns
// the day the HTML was rendered with.
function serverDay() {
  const at = documentRenderTime();
  // eslint-disable-next-line no-restricted-syntax -- MEH-3861: the server's own day, or no tag (a test)
  return at ? israelToday(at) : israelToday();
}

/**
 * @returns {string} `YYYY-MM-DD` in Israel, updated when the day changes.
 */
export default function useIsraelToday() {
  return useSyncExternalStore(subscribe, clientDay, serverDay);
}
