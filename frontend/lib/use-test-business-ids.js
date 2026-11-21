// @ts-check
"use client";

import { useEffect, useState } from "react";
import api from "@/lib/api";
import { ListTestBusinessesAdminTestBusinessesGetResponse } from "@/lib/generated/api.zod";

/**
 * Module:   use-test-business-ids
 * Purpose:  The ids of the businesses an admin marked «עסק בדיקה — מוסתר
 *           מהאתר» (MEH-2952 chunk 4), for the admin list tag and the edit
 *           screen switch. One request per page, shared by every caller.
 * Touches:  GET /admin/test-businesses (admin-only; ids, nothing else).
 * Does NOT: Read the flag from a producer object — no response carries the
 *           column (tests/test_meh2952_is_test_guards.py guard 3).
 * History:  MEH-2952 chunk 4 (creation).
 */

/** @type {Promise<Set<string> | null> | null} */
let pending = null;
/** @type {Set<(ids: Set<string> | null) => void>} */
const listeners = new Set();

function load() {
  if (!pending) {
    // Promise.resolve first: a client that throws or returns no promise is a
    // failed read like any other, never a crash of the table around it.
    pending = Promise.resolve()
      .then(() => api.get("/admin/test-businesses"))
      // Rule 19: a malformed body throws here and lands in the catch below.
      .then((r) => ListTestBusinessesAdminTestBusinessesGetResponse.parse(r?.data))
      .then((d) => new Set(d.producer_ids.map(String)))
      .catch(() => {
        // Unknown is not "none": a failed read must never show a hidden
        // business as public (rule-5a review). Callers render nothing for
        // null, and the next mount retries.
        pending = null;
        return null;
      });
  }
  return pending;
}

/**
 * After the switch saves: replace the cached set and tell every mounted
 * caller, so the list and the edit screen never disagree.
 * @param {string} id @param {boolean} hidden
 */
export function setTestBusinessId(id, hidden) {
  pending = load().then((ids) => {
    const next = new Set(ids || []);
    if (hidden) next.add(String(id));
    else next.delete(String(id));
    listeners.forEach((fn) => fn(next));
    return next;
  });
  return pending;
}

/** @returns {Set<string> | null} null while loading */
export function useTestBusinessIds() {
  const [ids, setIds] = useState(/** @type {Set<string> | null} */ (null));
  useEffect(() => {
    let alive = true;
    const fn = (/** @type {Set<string> | null} */ next) => alive && setIds(next);
    listeners.add(fn);
    load().then(fn);
    return () => {
      alive = false;
      listeners.delete(fn);
    };
  }, []);
  return ids;
}
