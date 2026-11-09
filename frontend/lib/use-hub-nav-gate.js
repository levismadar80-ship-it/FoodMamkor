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

export const HUB_NAV_GATES = Object.freeze({
  groupBuys: { endpoint: "/group-buys", cacheKey: "meh_group_buys_any", enabled: () => true },
  rescue: { endpoint: "/rescue/offers", cacheKey: "meh_rescue_offers_any", enabled: rescueOn },
});

const TTL_MS = 60 * 60 * 1000; // 1h — supply moves in hours, not seconds.

// Rule 19: validate before consuming. Only the length matters here.
const ListSchema = z.array(z.unknown());

function readCache(key) {
  try {
    const raw = sessionStorage.getItem(key);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (typeof parsed?.any !== "boolean" || typeof parsed?.at !== "number") return null;
    if (Date.now() - parsed.at > TTL_MS) return null;
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

/**
 * @param {"groupBuys" | "rescue"} hub
 * @returns {boolean} whether the footer should show that hub's link.
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

    const cached = readCache(gate.cacheKey);
    if (cached !== null) {
      setVisible(cached);
      return () => {
        alive = false;
      };
    }

    api
      .get(gate.endpoint)
      .then((res) => {
        const parsed = ListSchema.safeParse(res?.data);
        if (!parsed.success) return; // stays hidden
        const any = parsed.data.length > 0;
        writeCache(gate.cacheKey, any);
        if (alive) setVisible(any);
      })
      .catch(() => {
        // Deliberately silent — a hidden footer link is not a user-facing error.
      });

    return () => {
      alive = false;
    };
  }, [hub]);

  return visible;
}
