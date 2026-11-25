// @ts-check
"use client";

/**
 * Module:   use-israel-today
 * Purpose:  Today's date on the Israel clock that follows the clock: a page
 *           left open across midnight re-renders with the new day, so a bag
 *           listed as «מחר» becomes «היום» without a reload (MEH-3805).
 * Does NOT: decide what a date means (lib/rescue.js `bagDay`), or refetch
 *           anything: a caller whose data depends on the day keys its own
 *           fetch on the value this returns.
 * Related:  lib/israel-date.js `israelToday` (the clock itself)
 * History:  MEH-3805 (creation)
 */

import { useEffect, useState } from "react";

import { israelToday } from "@/lib/israel-date";

// Once a minute is enough for a day label, and cheap: one Intl call. The
// tab coming back into view checks at once, so a phone woken at 07:00
// does not wait for the next tick.
const ISRAEL_TODAY_CHECK_MS = 60_000;

/**
 * @returns {string} `YYYY-MM-DD` in Israel, updated when the day changes.
 */
export default function useIsraelToday() {
  const [today, setToday] = useState(() => israelToday());
  useEffect(() => {
    const check = () => {
      const now = israelToday();
      setToday((prev) => (prev === now ? prev : now));
    };
    const id = setInterval(check, ISRAEL_TODAY_CHECK_MS);
    document.addEventListener("visibilitychange", check);
    return () => {
      clearInterval(id);
      document.removeEventListener("visibilitychange", check);
    };
  }, []);
  return today;
}
