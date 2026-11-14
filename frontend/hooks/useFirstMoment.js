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

import { useCallback, useEffect, useRef, useState } from "react";
import { firstMomentsKey, retireMoment, stepMoments } from "@/lib/first-moments";

/** @returns {import("@/lib/first-moments").MomentState | null} null = never stored (first visit) or unreadable. */
/** @param {string} key */
function readMomentState(key) {
  try {
    const raw = window.localStorage.getItem(key);
    if (!raw) return null;
    const s = JSON.parse(raw);
    if (!s || typeof s !== "object" || typeof s.baseline !== "object" || !Array.isArray(s.done)) return null;
    return s;
  } catch {
    return null;
  }
}

/**
 * @param {string} key
 * @param {import("@/lib/first-moments").MomentState} state
 */
function writeMomentState(key, state) {
  try {
    window.localStorage.setItem(key, JSON.stringify(state));
  } catch {
    // blocked storage: no card is ever due, because nothing has a baseline
  }
}

/**
 * @param {any} analytics GET /producers/me/analytics payload, or null while
 *   loading. Pass null for an organizer: nothing is read or stored.
 * @param {string | number | null | undefined} producerId the business the
 *   counts belong to — the state is kept per business, so two accounts on one
 *   browser never share baselines. No id → nothing is read or stored.
 * @returns {{ moment: import("@/lib/first-moments").Moment | null, dismiss: () => void }}
 */
export function useFirstMoment(analytics, producerId) {
  const [moment, setMoment] = useState(
    /** @type {import("@/lib/first-moments").Moment | null} */ (null),
  );
  // Last state this visit worked from: dismiss builds on it, so a corrupt or
  // unreadable stored value cannot wipe the other baselines.
  const last = useRef(/** @type {import("@/lib/first-moments").MomentState | null} */ (null));

  useEffect(() => {
    if (!analytics || producerId == null || producerId === "") {
      setMoment(null);
      return;
    }
    const key = firstMomentsKey(producerId);
    const { state, due } = stepMoments(readMomentState(key), analytics);
    writeMomentState(key, state);
    last.current = state;
    setMoment(due);
  }, [analytics, producerId]);

  const dismiss = useCallback(() => {
    if (!moment || producerId == null || producerId === "") return;
    const key = firstMomentsKey(producerId);
    const next = retireMoment(readMomentState(key) ?? last.current, moment.key);
    writeMomentState(key, next);
    last.current = next;
    setMoment(null);
  }, [moment, producerId]);

  return { moment, dismiss };
}
