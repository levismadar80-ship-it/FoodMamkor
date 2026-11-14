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
import { readMomentState, retireMoment, stepMoments, writeMomentState } from "@/lib/first-moments";

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
