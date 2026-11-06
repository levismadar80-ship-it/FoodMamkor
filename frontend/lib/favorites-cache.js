"use client";

/**
 * In-memory cache of the current user's favorited producer IDs.
 *
 * Loaded once per authenticated session from GET /users/me/favorites.
 * Every ProducerCard subscribes so a heart tap in one place updates
 * every other card showing the same producer — without each card
 * issuing its own fetch (would be N requests on a 24-card grid).
 *
 * State is in-process only: no localStorage mirror of the list. On logout
 * or refresh the cache re-hydrates from the server; a stale local mirror
 * would just need to be reconciled anyway. (MEH-2743 keeps one boolean —
 * "had favorites" — only to reserve the homepage strip's height.)
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
// MEH-2743: bumped on logout; any response from before it is dropped (the
// initial load as well as the refresh below).
let generation = 0;
let refreshing = null;
// MEH-2743: hearts tapped while the initial load is in flight, re-applied on
// top of the server list so the load cannot overwrite them.
const pendingLocal = new Map();
// MEH-2743: every producer id the last response listed, parseable or not. A
// row that fails validation is "seen" and never triggers the refresh retry.
let seenIds = new Set();

// MEH-2743: "this browser's user had favorites last time" — lets the homepage
// keep the strip's height while the list loads, so the page does not jump.
// Holds only "1"; storage errors (private mode) just mean no placeholder.
const STRIP_HINT_KEY = "fav_strip_hint";

function syncStripHint() {
  try {
    if (getFavoriteProducers().length) localStorage.setItem(STRIP_HINT_KEY, "1");
    else localStorage.removeItem(STRIP_HINT_KEY);
  } catch {
    // ignore
  }
}

/** MEH-2743: auth resolved to signed-out (e.g. expired token) — no placeholder next time. */
export function clearFavoritesStripHint() {
  try {
    localStorage.removeItem(STRIP_HINT_KEY);
  } catch {
    // ignore
  }
}

export function hadFavoritesLastVisit() {
  try {
    return localStorage.getItem(STRIP_HINT_KEY) === "1";
  } catch {
    return false;
  }
}

export function isFavoritesLoaded() {
  return loaded;
}

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
  const gen = generation;
  const req = api
    .get("/users/me/favorites")
    .then((res) => {
      if (gen !== generation) return ids; // logged out mid-load
      // Rule-19: validate the favorites payload; a malformed response
      // yields an empty cache (the safe default this module already used).
      const parsed = FavoritesResponseSchema.safeParse(res.data);
      const list = parsed.success ? parsed.data : [];
      ids = new Set(list.map((f) => f.producer_id ?? f.id).filter(Boolean));
      for (const [id, value] of pendingLocal) {
        if (value) ids.add(id);
        else ids.delete(id);
      }
      pendingLocal.clear();
      applyRows(res.data);
      loaded = true;
      syncStripHint();
      notify();
      // A heart tapped mid-load whose POST the server had not seen yet.
      if (missingRow()) refreshRows();
      return ids;
    })
    .catch(() => {
      if (gen !== generation) return ids;
      pendingLocal.clear(); // `ids` already holds them
      loaded = true;
      return ids;
    })
    .finally(() => {
      if (loadingPromise === req) loadingPromise = null;
    });
  loadingPromise = req;
  return loadingPromise;
}

function savedTime(v) {
  const t = Date.parse(v);
  return Number.isNaN(t) ? -Infinity : t;
}

function applyRows(data) {
  const list = Array.isArray(data) ? data : [];
  seenIds = new Set(list.map((r) => r?.producer_id ?? r?.producer?.id).filter(Boolean));
  rows = list
    .map((row) => FavoriteWithProducerSchema.safeParse(row))
    .filter((r) => r.success)
    .map((r) => ({ ...r.data.producer, _savedAt: r.data.created_at || "" }))
    // MEH-2743: compare instants, not strings ("…Z" vs "+02:00" mis-sort as text).
    .sort((a, b) => savedTime(b._savedAt) - savedTime(a._savedAt));
}

/**
 * MEH-2724: favorited producers (full card data), newest saved first.
 * Only producers still in the heart set — so un-hearting drops them. A
 * producer hearted after the load has no row here until the next load.
 */
export function getFavoriteProducers() {
  return rows.filter((p) => ids.has(p.id));
}

export function isFavorited(producerId) {
  return producerId != null && ids.has(producerId);
}

export function setFavoritedLocal(producerId, value) {
  if (producerId == null) return;
  if (value) ids.add(producerId);
  else ids.delete(producerId);
  // Only while a load is in flight — signed out there is nothing to re-apply.
  if (!loaded && loadingPromise) pendingLocal.set(producerId, Boolean(value));
  else syncStripHint();
  notify();
  // MEH-2724: a heart added after the load has no card row yet — re-read the
  // list once so the homepage strip shows it too (un-hearting needs no
  // fetch: getFavoriteProducers filters through `ids`).
  if (value && loaded && !rows.some((p) => p.id === producerId)) refreshRows();
}

// A hearted id with no card row yet. The heart flips the cache BEFORE its
// POST commits, so the GET below can still miss it — hence the bounded retry.
const REFRESH_RETRY_MS = 1500;
const REFRESH_MAX_ATTEMPTS = 3;

function missingRow() {
  for (const id of ids) if (!seenIds.has(id) && !rows.some((p) => p.id === id)) return true;
  return false;
}

function refreshRows(attempt = 1) {
  if (refreshing) return refreshing;
  const gen = generation;
  const req = api
    .get("/users/me/favorites")
    .then((res) => {
      if (gen !== generation) return;
      applyRows(res.data);
      syncStripHint();
      notify();
    })
    .catch(() => {})
    .finally(() => {
      if (refreshing === req) refreshing = null;
      // Covers both an uncommitted POST and a second heart added mid-flight.
      if (gen === generation && attempt < REFRESH_MAX_ATTEMPTS && missingRow()) {
        setTimeout(() => {
          if (gen === generation) refreshRows(attempt + 1);
        }, REFRESH_RETRY_MS);
      }
    });
  refreshing = req;
  return req;
}

/** Called by AuthContext on logout so the next login starts clean. */
export function resetFavoritesCache() {
  ids = new Set();
  rows = [];
  seenIds = new Set();
  pendingLocal.clear();
  refreshing = null;
  generation += 1;
  loaded = false;
  loadingPromise = null;
  clearFavoritesStripHint();
  notify();
}
