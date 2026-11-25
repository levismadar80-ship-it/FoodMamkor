// @ts-check
"use client";

/**
 * Module:   use-my-orders-nav-gate
 * Purpose:  MEH-3525 — decide whether «ההזמנות שלי» appears in the account
 *           menus. MEH-3698: it appears only for a signed-in person who has
 *           something to see there — an order, a group buy or a surprise bag
 *           (`GET /users/me/orders/any`, one request for all three).
 * Does NOT: render anything, or gate the /my-orders route itself — a person who
 *           arrives by link gets the page and its empty state.
 * Related:  backend/app/routers/my_orders_any.py (`GET /users/me/orders/any`),
 *           lib/use-events-nav-gate.js (the same fail-closed, one-request shape),
 *           components/Header.jsx · components/AccountSheet.jsx (the consumers),
 *           lib/order-sheet.js · lib/rescue.js · GroupBuyDetailClient.jsx
 *           (call `clearMyOrdersNavGate` after an order, a reservation, a join).
 */

import { useEffect, useState } from "react";

import api from "@/lib/api";
import { MY_ORDERS_CHANGED_EVENT, MY_ORDERS_NAV_CACHE_KEY } from "@/lib/my-orders-nav-cache";
import { HasAnyOrdersUsersMeOrdersAnyGetResponse } from "@/lib/generated/api.zod";

const CACHE_KEY = MY_ORDERS_NAV_CACHE_KEY;
const TTL_MS = 30 * 60 * 1000; // cleared by clearMyOrdersNavGate when it moves
const CHANGED_EVENT = MY_ORDERS_CHANGED_EVENT;
// MEH-3552: read by the api.js 401 interceptor (not an axios option).
const PROBE_CONFIG = /** @type {import("axios").AxiosRequestConfig} */ ({ skipAuthRefresh: true });

/** @param {string} uid */
function readCache(uid) {
  try {
    // eslint-disable-next-line no-restricted-syntax -- nav-link cache, read in a layout effect before the first paint (MEH-2965)
    const parsed = JSON.parse(sessionStorage.getItem(CACHE_KEY) || "null");
    if (parsed?.uid !== uid || typeof parsed?.on !== "boolean") return null;
    if (Date.now() - parsed.at > TTL_MS) return null;
    return parsed.on;
  } catch {
    return null;
  }
}

/** @param {string} uid @param {boolean} on */
function writeCache(uid, on) {
  try {
    sessionStorage.setItem(CACHE_KEY, JSON.stringify({ uid, on, at: Date.now() }));
  } catch {
    // Caching is an optimisation.
  }
}

// One request per page load and person, however many menus mount (Header +
// AccountSheet). Keyed by uid so a switch of account mid-request does not hand
// the new person the old person's promise, or cache under the old uid.
/** @type {Map<string, Promise<boolean | null>>} */
const inFlight = new Map();
/** Test seam. */
export function resetMyOrdersNavGateRequest() {
  inFlight.clear();
}

// MEH-3698: bumped by clearMyOrdersNavGate's event. A request that started
// before the order must not write its stale «nothing» into the cache after
// it, and the next ask must not reuse it. Registered at module load, so it
// runs before any hook's own listener.
let generation = 0;
if (typeof window !== "undefined") {
  window.addEventListener(CHANGED_EVENT, () => {
    generation += 1;
    inFlight.clear();
  });
}
export { clearMyOrdersNavGate } from "@/lib/my-orders-nav-cache";

/**
 * The session cache first (resolved, so the hook sets state only in a
 * callback), else one shared request.
 * @param {string} uid
 * @returns {Promise<boolean | null>}
 */
function load(uid) {
  const cached = readCache(uid);
  if (cached !== null) return Promise.resolve(cached);
  let pending = inFlight.get(uid);
  if (!pending) {
    const asked = generation;
    // MEH-3552: a probe, not the person's own read — a 401 here is "no
    // answer", never a reason to refresh and log her out (it did exactly
    // that on every page in the staging E2E, whose specs sign in with a
    // fake token the live backend rejects).
    pending = api.get("/users/me/orders/any", PROBE_CONFIG)
      .then((r) => {
        // Rule 19: a body that does not parse is no answer.
        const parsed = HasAnyOrdersUsersMeOrdersAnyGetResponse.safeParse(r?.data);
        if (!parsed.success) return null;
        const on = parsed.data.any;
        if (asked === generation) writeCache(uid, on);
        return on;
      })
      .catch((err) => {
        // 404 = the route is not deployed: a real "no". Anything else (401 mid-refresh,
        // network) is no answer: the link stays hidden and is not cached, and
        // this mount does not retry. Fail-closed on purpose; the next page
        // load asks again.
        if (err?.response?.status === 404) {
          if (asked === generation) writeCache(uid, false);
          return false;
        }
        return null;
      })
      .finally(() => {
        // Only its own entry: after a clear, the newer request owns the slot.
        if (inFlight.get(uid) === pending) inFlight.delete(uid);
      });
    inFlight.set(uid, pending);
  }
  return pending;
}

/**
 * @param {{ id?: string | number } | null | undefined} user the signed-in person, or null
 * @returns {boolean} FAIL-CLOSED: false until the server says there is something.
 */
export function useMyOrdersNavGate(user) {
  const uid = user?.id === undefined || user?.id === null ? null : String(user.id);
  // The answer is kept with the account it belongs to: after a switch of
  // account the previous person's answer no longer matches, so the link is
  // hidden until the new person's answer arrives.
  const [answer, setAnswer] = useState(/** @type {{ uid: string, on: boolean } | null} */ (null));

  useEffect(() => {
    if (!uid) return undefined;
    let alive = true;
    const ask = () => {
      // An answer to a question asked before the last clear is stale: the
      // newer ask's answer wins, whichever settles first.
      const askedAt = generation;
      load(uid).then((on) => {
        if (alive && on !== null && askedAt === generation) setAnswer({ uid, on });
      });
    };
    ask();
    window.addEventListener(CHANGED_EVENT, ask);
    return () => {
      alive = false;
      window.removeEventListener(CHANGED_EVENT, ask);
    };
  }, [uid]);

  return Boolean(uid && answer?.uid === uid && answer.on);
}
