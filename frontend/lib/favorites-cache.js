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
import {
  FavoritesResponseSchema,
  FavoriteWithProducerSchema,
} from "@/lib/api-schemas";

let ids = new Set();
// MEH-2724: the full producer rows from the SAME response, newest first, for
// the homepage «המועדפים שלך» strip. Parsed per row (one bad row costs one
// card, as on /favorites). Filtered through `ids` on read, so a heart removed
// anywhere drops the card at once. Rows with no created_at sort last.
let rows = [];
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
      // Rule-19: validate the favorites payload; a malformed response
      // yields an empty cache (the safe default this module already used).
      const parsed = FavoritesResponseSchema.safeParse(res.data);
      const list = parsed.success ? parsed.data : [];
      ids = new Set(list.map((f) => f.producer_id ?? f.id).filter(Boolean));
      rows = parseRows(res.data);
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

function parseRows(data) {
  if (!Array.isArray(data)) return [];
  return data
    .map((row) => FavoriteWithProducerSchema.safeParse(row))
    .filter((r) => r.success)
    .map((r) => ({ ...r.data.producer, _savedAt: r.data.created_at || "" }))
    .sort((a, b) => (a._savedAt < b._savedAt ? 1 : a._savedAt > b._savedAt ? -1 : 0));
}

/**
 * MEH-2724: favorited producers (full card data), newest saved first.
 * Only producers still in the heart set — so un-hearting drops them. A
 * producer hearted after the load has no row here until the next load.
 */
export function getFavoriteProducers() {
  return rows.filter((p) => ids.has(p.id));
}

export function isFavoritesLoaded() {
  return loaded;
}

export function isFavorited(producerId) {
  return producerId != null && ids.has(producerId);
}

export function setFavoritedLocal(producerId, value) {
  if (producerId == null) return;
  if (value) ids.add(producerId);
  else ids.delete(producerId);
  notify();
  // MEH-2724: a heart added after the load has no card row yet — re-read the
  // list once so the homepage strip shows it too (un-hearting needs no
  // fetch: getFavoriteProducers filters through `ids`).
  if (value && loaded && !rows.some((p) => p.id === producerId)) refreshRows();
}

let refreshing = null;
function refreshRows() {
  if (refreshing) return refreshing;
  refreshing = api
    .get("/users/me/favorites")
    .then((res) => {
      rows = parseRows(res.data);
      notify();
    })
    .catch(() => {})
    .finally(() => {
      refreshing = null;
    });
  return refreshing;
}

/** Called by AuthContext on logout so the next login starts clean. */
export function resetFavoritesCache() {
  ids = new Set();
  rows = [];
  refreshing = null;
  loaded = false;
  loadingPromise = null;
  notify();
}
