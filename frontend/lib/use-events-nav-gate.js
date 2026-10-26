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

import { useEffect, useState } from "react";
import { z } from "zod";

import api from "@/lib/api";

const CACHE_KEY = "meh_events_upcoming_any";
const TTL_MS = 60 * 60 * 1000; // 1h — supply moves in days, not seconds.

// Rule 19: validate before consuming. Only the length matters here.
const UpcomingSchema = z.array(z.unknown());

function readCache() {
  try {
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

/**
 * @returns {boolean} whether the footer should show the events link.
 * FAIL-CLOSED: starts false (no hydration flash), stays false on any error or
 * malformed body, and ignores responses after unmount.
 */
export function useEventsNavGate() {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    let alive = true;

    const cached = readCache();
    if (cached !== null) {
      setVisible(cached);
      return () => {
        alive = false;
      };
    }

    api
      .get("/events/upcoming", { params: { limit: 1 } })
      .then((res) => {
        const parsed = UpcomingSchema.safeParse(res?.data);
        if (!parsed.success) return; // stays hidden
        const any = parsed.data.length > 0;
        writeCache(any);
        if (alive) setVisible(any);
      })
      .catch(() => {
        // A hidden footer link is not a user-facing error.
      });

    return () => {
      alive = false;
    };
  }, []);

  return visible;
}
