// @ts-check
"use client";

/**
 * Module:   use-my-orders-nav-gate
 * Purpose:  MEH-3525 — decide whether «ההזמנות שלי» appears in the account
 *           menus. It appears for a signed-in person while on-site ordering is
 *           switched on in the server (her list answers 200; while the flag is
 *           off every ordering route answers 404).
 * Does NOT: render anything, or gate the /my-orders route itself — a person who
 *           arrives by link gets the page and its empty state.
 * Related:  backend/app/routers/product_order_buyer.py (`GET /users/me/product-orders`),
 *           lib/use-events-nav-gate.js (the same fail-closed, one-request shape),
 *           components/Header.jsx · components/AccountSheet.jsx (the consumers).
 */

import { useEffect, useState } from "react";

import api from "@/lib/api";

const CACHE_KEY = "meh_my_orders_nav";
const TTL_MS = 30 * 60 * 1000; // the flag moves by deploy, not by the minute

/** @param {string} uid */
function readCache(uid) {
  try {
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
    pending = api
      .get("/users/me/product-orders")
      .then(() => {
        writeCache(uid, true);
        return true;
      })
      .catch((err) => {
        // 404 = ordering is off: a real answer. Anything else (401 mid-refresh,
        // network) is no answer: the link stays hidden and is not cached, and
        // this mount does not retry. Fail-closed on purpose; the next page
        // load asks again.
        if (err?.response?.status === 404) {
          writeCache(uid, false);
          return false;
        }
        return null;
      })
      .finally(() => {
        inFlight.delete(uid);
      });
    inFlight.set(uid, pending);
  }
  return pending;
}

/**
 * @param {{ id?: string | number } | null | undefined} user the signed-in person, or null
 * @returns {boolean} FAIL-CLOSED: false until the server says ordering is on.
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
    load(uid).then((on) => {
      if (alive && on !== null) setAnswer({ uid, on });
    });
    return () => { alive = false; };
  }, [uid]);

  return Boolean(uid && answer?.uid === uid && answer.on);
}
