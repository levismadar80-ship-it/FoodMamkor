// @ts-check
"use client";

/**
 * Module:   use-events-nav-gate
 * Purpose:  MEH-2369 — decide whether the footer's "אירועים" link appears. It
 *           appears only when at least one upcoming public event exists, so a
 *           reader who follows it never lands on an empty page.
 * Does NOT: render anything, and does NOT gate the /events route itself — a
 *           reader who arrives by link still gets the page and its empty state.
 * Related:  backend/app/routers/events.py (`GET /events/upcoming`, the public
 *           feed the home preview also reads); lib/use-experiences-nav-gate.js
 *           (the same fail-closed shape for the experiences link, MEH-1918);
 *           components/Footer.jsx (the consumer).
 *
 * Threshold 1, not 3 like experiences: an event is dated and self-contained,
 * so one upcoming event is a real thing to show; it is the zero case that
 * costs trust.
 */

import { useEffect, useLayoutEffect, useState } from "react";
import { z } from "zod";

import api from "@/lib/api";

// MEH-3809: a cached answer lands before the first paint (as use-hub-nav-gate.js,
// MEH-3049), so the Header's held place never paints and then goes.
const useIsomorphicLayoutEffect = typeof window === "undefined" ? useEffect : useLayoutEffect;

const CACHE_KEY = "meh_events_upcoming_any";
const TTL_MS = 60 * 60 * 1000; // 1h — supply moves in days, not seconds.

// Rule 19: validate before consuming. Only the length matters here.
const UpcomingSchema = z.array(z.unknown());

function readCache() {
  try {
    // eslint-disable-next-line no-restricted-syntax -- nav-link cache, read in a layout effect before the first paint (MEH-2965)
    const raw = sessionStorage.getItem(CACHE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (typeof parsed?.any !== "boolean" || typeof parsed?.at !== "number") return null;
    if (Date.now() - parsed.at > TTL_MS) return null;
    return parsed.any;
  } catch {
    return null;
  }
}

function writeCache(any) {
  try {
    sessionStorage.setItem(CACHE_KEY, JSON.stringify({ any, at: Date.now() }));
  } catch {
    // Caching is an optimisation. Failing to cache is not failing.
  }
}

// MEH-2965: one request per page load, however many consumers mount. Header,
// Footer and BottomNav mount in the same commit, all three miss the session
// cache (it is written only when the response lands), and until this each
// fired its own request. The promise is shared while in flight and dropped
// when it settles; the session cache above owns everything after that.
// Resolves to the answer, or null when there is none to give (error, bad body).
let inFlight = null;
/** Test seam: forget a request still in flight (a suite's never-settling stub
 *  would otherwise answer every later case in the same module instance). */
export function resetEventsNavGateRequest() {
  inFlight = null;
}
function loadAny() {
  if (!inFlight) {
    inFlight = api
      .get("/events/upcoming", { params: { limit: 1 } })
      .then((res) => {
        const parsed = UpcomingSchema.safeParse(res?.data);
        if (!parsed.success) return null; // stays hidden
        const any = parsed.data.length > 0;
        writeCache(any);
        return any;
      })
      // A hidden nav link is not a user-facing error.
      .catch(() => null)
      .finally(() => {
        inFlight = null;
      });
  }
  return inFlight;
}

/**
 * @returns {boolean} whether the nav should show its events link (the Footer's
 * «אירועים», and one of the four reads behind the Header's and BottomNav's hub
 * link).
 * FAIL-CLOSED: starts false (no hydration flash), stays false on any error or
 * malformed body, and ignores responses after unmount.
 */
export function useEventsNavGate() {
  return useEventsNavGateState().visible;
}

/**
 * @returns {{ visible: boolean, settled: boolean }}
 * MEH-3809: `settled` is true once the answer is known (cache, response, or a
 * failure, which stays hidden). The Header holds the link's place while it is
 * not, so a link arriving late does not wrap the row and push the page down.
 */
export function useEventsNavGateState() {
  const [state, setState] = useState({ visible: false, settled: false });

  useIsomorphicLayoutEffect(() => {
    let alive = true;

    const cached = readCache();
    if (cached !== null) {
      setState({ visible: cached, settled: true });
      return () => {
        alive = false;
      };
    }

    loadAny().then((any) => {
      if (alive) setState({ visible: any === true, settled: true });
    });

    return () => {
      alive = false;
    };
  }, []);

  return state;
}
