// @ts-check
"use client";

/**
 * Module:   hooks/useFirstMoment
 * Purpose:  The «רגע ראשון» due on the dashboard home right now, if any
 *           (MEH-3200 part 2). Wraps lib/first-moments.js with storage.
 * Does NOT: render (FirstMomentCard.jsx) or decide slot priority — the home
 *           page puts the welcome card first and «חדש במהמקור» last.
 * History:  MEH-3200 part 2 (creation).
 */

import { useCallback, useEffect, useState } from "react";
import { FIRST_MOMENTS_KEY, retireMoment, stepMoments } from "@/lib/first-moments";

/** @returns {import("@/lib/first-moments").MomentState | null} null = never stored (first visit) or unreadable. */
function readMomentState() {
  try {
    const raw = window.localStorage.getItem(FIRST_MOMENTS_KEY);
    if (!raw) return null;
    const s = JSON.parse(raw);
    if (!s || typeof s !== "object" || typeof s.baseline !== "object" || !Array.isArray(s.done)) return null;
    return s;
  } catch {
    return null;
  }
}

/** @param {import("@/lib/first-moments").MomentState} state */
function writeMomentState(state) {
  try {
    window.localStorage.setItem(FIRST_MOMENTS_KEY, JSON.stringify(state));
  } catch {
    // blocked storage: no card is ever due, because nothing has a baseline
  }
}

/**
 * @param {any} analytics GET /producers/me/analytics payload, or null while loading.
 * @returns {{ moment: import("@/lib/first-moments").Moment | null, dismiss: () => void }}
 */
export function useFirstMoment(analytics) {
  const [moment, setMoment] = useState(
    /** @type {import("@/lib/first-moments").Moment | null} */ (null),
  );

  useEffect(() => {
    if (!analytics) return;
    const { state, due } = stepMoments(readMomentState(), analytics);
    writeMomentState(state);
    setMoment(due);
  }, [analytics]);

  const dismiss = useCallback(() => {
    if (!moment) return;
    writeMomentState(retireMoment(readMomentState(), moment.key));
    setMoment(null);
  }, [moment]);

  return { moment, dismiss };
}
