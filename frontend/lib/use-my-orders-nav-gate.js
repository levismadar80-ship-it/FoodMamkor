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

// One request per page load however many menus mount (Header + AccountSheet).
/** @type {Promise<boolean | null> | null} */
let inFlight = null;
/** Test seam. */
export function resetMyOrdersNavGateRequest() {
  inFlight = null;
}

/** @param {string} uid */
function load(uid) {
  if (!inFlight) {
    inFlight = api
      .get("/users/me/product-orders")
      .then(() => {
        writeCache(uid, true);
        return true;
      })
      .catch((err) => {
        // 404 = ordering is off: a real answer. Anything else (401 mid-refresh,
        // network) is no answer, and the link stays hidden without caching it.
        if (err?.response?.status === 404) {
          writeCache(uid, false);
          return false;
        }
        return null;
      })
      .finally(() => {
        inFlight = null;
      });
  }
  return inFlight;
}

/**
 * @param {{ id?: string | number } | null | undefined} user the signed-in person, or null
 * @returns {boolean} FAIL-CLOSED: false until the server says ordering is on.
 */
export function useMyOrdersNavGate(user) {
  const uid = user?.id != null ? String(user.id) : null;
  const [on, setOn] = useState(false);

  useEffect(() => {
    let alive = true;
    if (!uid) {
      setOn(false);
      return undefined;
    }
    const cached = readCache(uid);
    if (cached !== null) {
      setOn(cached);
      return () => { alive = false; };
    }
    load(uid).then((answer) => {
      if (alive && answer !== null) setOn(answer);
    });
    return () => { alive = false; };
  }, [uid]);

  return on;
}
