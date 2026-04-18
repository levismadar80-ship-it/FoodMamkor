"use client";

/**
 * In-memory cache of the current user's favorited producer IDs.
 *
 * Loaded once per authenticated session from GET /users/me/favorites.
 * Every ProducerCard subscribes so a heart tap in one place updates
 * every other card showing the same producer — without each card
 * issuing its own fetch (would be N requests on a 24-card grid).
 *
 * State is in-process only: no localStorage mirror. On logout or
 * refresh the cache re-hydrates from the server; a stale local mirror
 * would just need to be reconciled anyway.
 */

import api from "./api";

let ids = new Set();
let loaded = false;
let loadingPromise = null;
const listeners = new Set();

function notify() {
  listeners.forEach((l) => {
    try {
      l();
    } catch {
      // Never let one bad listener break the others.
    }
  });
}

export function subscribeFavorites(listener) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/**
 * Kick off the initial load. Multiple concurrent callers get the same
 * promise. Errors are swallowed — an empty cache is a safe default.
 */
export function ensureFavoritesLoaded() {
  if (loaded) return Promise.resolve(ids);
  if (loadingPromise) return loadingPromise;
  loadingPromise = api
    .get("/users/me/favorites")
    .then((res) => {
      const list = Array.isArray(res.data) ? res.data : [];
      ids = new Set(list.map((f) => f.producer_id ?? f.id).filter(Boolean));
      loaded = true;
      notify();
      return ids;
    })
    .catch(() => {
      loaded = true;
      return ids;
    })
    .finally(() => {
      loadingPromise = null;
    });
  return loadingPromise;
}

export function isFavorited(producerId) {
  return producerId != null && ids.has(producerId);
}

export function setFavoritedLocal(producerId, value) {
  if (producerId == null) return;
  if (value) ids.add(producerId);
  else ids.delete(producerId);
  notify();
}

/** Called by AuthContext on logout so the next login starts clean. */
export function resetFavoritesCache() {
  ids = new Set();
  loaded = false;
  loadingPromise = null;
  notify();
}
