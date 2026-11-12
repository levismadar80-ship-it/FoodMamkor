"use client";

/**
 * Module:   use-hub-nav-gate
 * Purpose:  MEH-2858 — decide whether the footer's «קבוצות רכישה» / «סלי
 *           הפתעה» links appear. Each appears only while its hub has at least
 *           one public item, so no list on the site is an orphan and no link
 *           lands on an empty page.
 * Does NOT: render anything, and does NOT gate the routes themselves — a
 *           reader who arrives by link still gets the page and its empty state.
 *           Events and experiences keep their own hooks
 *           (lib/use-events-nav-gate.js, lib/use-experiences-nav-gate.js):
 *           different endpoints, and experiences has a threshold of 3.
 * Related:  backend/app/routers/group_buys.py (`GET /group-buys`, open by
 *           default — the list /group-buys shows) and rescue.py
 *           (`GET /rescue/offers`, today's bags with stock; 404 while the
 *           pilot is off); lib/listing-supply.js (the same hubs, server side,
 *           for the sitemap); components/Footer.jsx (the consumer).
 *
 * One hook for both hubs because the two differ only in endpoint and flag;
 * two copies of cache-plus-fetch would be two owners of one shape.
 */

import { useEffect, useState } from "react";
import { z } from "zod";

import api from "@/lib/api";

// REUSES: lib/rescue.js rescueBagsEnabled() — read inline so the footer (on
// every page) does not pull lib/rescue.js and its generated schemas into the
// shared bundle. Build-time constant; "true" only, as there.
const rescueOn = () => process.env.NEXT_PUBLIC_RESCUE_BAGS_ENABLED === "true";

const HOUR_MS = 60 * 60 * 1000;
const RESCUE_TTL_MS = 10 * 60 * 1000;

// ttlMs: group buys run for days, so an hour-old answer is still right. Rescue
// bags are today's, and a pickup window closes within the evening — a "yes"
// cached at 19:50 must not still offer the link at 20:45.
const HUB_NAV_GATES = Object.freeze({
  groupBuys: { endpoint: "/group-buys", cacheKey: "meh_group_buys_any", ttlMs: HOUR_MS, enabled: () => true },
  rescue: { endpoint: "/rescue/offers", cacheKey: "meh_rescue_offers_any", ttlMs: RESCUE_TTL_MS, enabled: rescueOn },
});

// Rule 19: validate before consuming. Only the length matters here.
const ListSchema = z.array(z.unknown());

function readCache(key, ttlMs) {
  try {
    const raw = sessionStorage.getItem(key);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (typeof parsed?.any !== "boolean" || typeof parsed?.at !== "number") return null;
    if (Date.now() - parsed.at > ttlMs) return null;
    return parsed.any;
  } catch {
    return null;
  }
}

function writeCache(key, any) {
  try {
    sessionStorage.setItem(key, JSON.stringify({ any, at: Date.now() }));
  } catch {
    // Caching is an optimisation. Failing to cache is not failing.
  }
}

// MEH-2965: one request per hub per page load, however many consumers mount
// (Header, Footer, BottomNav and ListingHubTabs can all ask in one commit).
// Shared while in flight, dropped when settled; the session cache owns the
// rest. Resolves to the answer, or null when there is none to give.
const inFlight = new Map();
/** Test seam: forget a request still in flight (a suite's never-settling stub
 *  would otherwise answer every later case in the same module instance). */
export function resetHubNavGateRequests() {
  inFlight.clear();
}
function loadAny(gate) {
  if (!inFlight.has(gate.cacheKey)) {
    inFlight.set(
      gate.cacheKey,
      api
        .get(gate.endpoint)
        .then((res) => {
          const parsed = ListSchema.safeParse(res?.data);
          if (!parsed.success) return null; // stays hidden
          const any = parsed.data.length > 0;
          writeCache(gate.cacheKey, any);
          return any;
        })
        // Deliberately silent — a hidden nav link is not a user-facing error.
        .catch(() => null)
        .finally(() => {
          inFlight.delete(gate.cacheKey);
        }),
    );
  }
  return inFlight.get(gate.cacheKey);
}

/**
 * @param {"groupBuys" | "rescue"} hub
 * @returns {boolean} whether the nav should show that hub's link (Footer, the
 * hub tab row, and the Header's and BottomNav's hub link).
 * FAIL-CLOSED like the events/experiences gates: starts false (no hydration
 * flash), stays false on any error, 404 or malformed body, and ignores a
 * response that arrives after unmount. A pilot that is off asks nothing.
 */
export function useHubNavGate(hub) {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const gate = HUB_NAV_GATES[hub];
    if (!gate || !gate.enabled()) return undefined;
    let alive = true;

    const cached = readCache(gate.cacheKey, gate.ttlMs);
    if (cached !== null) {
      setVisible(cached);
      return () => {
        alive = false;
      };
    }

    loadAny(gate).then((any) => {
      if (alive && any !== null) setVisible(any);
    });

    return () => {
      alive = false;
    };
  }, [hub]);

  return visible;
}
