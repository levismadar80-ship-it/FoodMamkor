"use client";

/**
 * Module:   saved-cache
 * Purpose:  In-memory set of the current user's saved recipes / events /
 *           experiences (MEH-2558), keyed "<type>:<id>". Loaded once per
 *           authenticated session from GET /users/me/saved/ids so every heart
 *           on a page reads one cache instead of fetching on mount.
 * Does NOT: hold business favorites — those stay in favorites-cache.js (the
 *           business heart also drives «קבלת עדכונים», nothing else does).
 * Related:  components/SaveButton.jsx, lib/favorites-cache.js (same shape),
 *           backend/app/routers/saved_items.py (MEH-2557).
 * History:  MEH-2558 (creation, chunk 3/5 of MEH-2555).
 *
 * In-process only, like favorites-cache: on logout the AuthContext resets it
 * and the next login re-hydrates from the server.
 */

import api from "./api";
import { SavedIdsResponseSchema } from "@/lib/api-schemas";

let keys = new Set();
let loaded = false;
let loadingPromise = null;
const listeners = new Set();
// A save/unsave that lands while the first load is still in flight would be
// wiped when the load replaces `keys`; it is replayed on top instead.
let writesBeforeLoad = new Map();
// Bumped by resetSavedCache. A GET that was in flight across a logout/expiry
// settles into a stale generation and is dropped — else it would mark the
// fresh cache `loaded` (empty hearts after re-login) or hand the previous
// user's ids to the next one.
let generation = 0;

const keyOf = (itemType, itemId) => `${itemType}:${itemId}`;

function notify() {
  listeners.forEach((l) => {
    try {
      l();
    } catch {
      // Never let one bad listener break the others.
    }
  });
}

export function subscribeSaved(listener) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/** One load per session; concurrent callers share the promise. Errors leave
 *  an empty cache — every heart then shows "not saved", the safe default. */
export function ensureSavedLoaded() {
  if (loaded) return Promise.resolve(keys);
  if (loadingPromise) return loadingPromise;
  const gen = generation;
  loadingPromise = api
    .get("/users/me/saved/ids")
    .then((res) => {
      if (gen !== generation) return keys;
      // Rule 19: validate before use; a malformed payload → empty cache.
      const parsed = SavedIdsResponseSchema.safeParse(res.data);
      const list = parsed.success ? parsed.data : [];
      keys = new Set(list.map((r) => keyOf(r.item_type, r.item_id)));
      writesBeforeLoad.forEach((value, key) => {
        if (value) keys.add(key);
        else keys.delete(key);
      });
      writesBeforeLoad = new Map();
      loaded = true;
      notify();
      return keys;
    })
    .catch(() => {
      if (gen === generation) loaded = true;
      return keys;
    })
    .finally(() => {
      if (gen === generation) loadingPromise = null;
    });
  return loadingPromise;
}

export function isSaved(itemType, itemId) {
  return itemId != null && keys.has(keyOf(itemType, itemId));
}

export function setSavedLocal(itemType, itemId, value) {
  if (itemId == null) return;
  const key = keyOf(itemType, itemId);
  if (value) keys.add(key);
  else keys.delete(key);
  if (!loaded) writesBeforeLoad.set(key, value);
  notify();
}

/** Called by AuthContext on logout / expiry / account delete. */
export function resetSavedCache() {
  generation += 1;
  keys = new Set();
  writesBeforeLoad = new Map();
  loaded = false;
  loadingPromise = null;
  notify();
}
