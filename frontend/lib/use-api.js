// @ts-check
"use client";

/**
 * Module:   use-api
 * Purpose:  The one way a client component reads from the backend (MEH-3536).
 *           A thin layer over SWR: every read goes through lib/api.js (axios,
 *           so the auth header, the silent refresh, the 15 s timeout and the
 *           Sentry report all still apply), and identical reads share one
 *           request and one cached answer across the page.
 * Returns:  SWR's response — { data, error, isLoading, isValidating, mutate }.
 * Does NOT: write. A write stays a plain `api.post/put/patch/delete`; after it,
 *           the caller updates the cache with `mutate` (the hook's, or
 *           `invalidateApi(path)` for every reader of that path).
 * Related:  lib/api.js (the transport) · lib/use-catalog-snapshot.js and
 *           lib/use-events-nav-gate.js (hand-built caches of the same shape,
 *           to be moved onto this layer one at a time).
 * History:  MEH-3536 (creation; first consumer: producer/dashboard/reviews).
 *
 * Why SWR and not TanStack Query: ~5 KB against ~13 KB, and no provider in
 * app/[locale]/layout.js — a page that never imports this file ships none of
 * it. Both libraries key the cache by the request, so a move later is a
 * change to this file, not to its callers.
 *
 * Defaults are chosen to keep each migrated screen behaving as it did with
 * its own useEffect: no refetch when the tab regains focus or the network
 * comes back, and no automatic retry (a failed read shows the screen's own
 * error state and its retry button, as before). What changes is only what a
 * hand-written effect never did: two components asking for the same thing
 * send one request, and coming back to a screen shows the last answer at once
 * while a fresh one loads.
 */

import useSWR, { mutate as globalMutate } from "swr";

import api from "@/lib/api";
import { useAuth } from "@/lib/auth-context";

/** @type {import("swr").SWRConfiguration} */
export const API_DEFAULTS = {
  revalidateOnFocus: false,
  revalidateOnReconnect: false,
  shouldRetryOnError: false,
  // Two mounts within 2 s of each other share one request.
  dedupingInterval: 2000,
};

/**
 * @typedef {object} ApiOptions
 * @property {Record<string, unknown>} [params]  query string, as for api.get
 * @property {boolean} [enabled]  false = no request yet (a dependent read)
 * @property {(data: any) => any} [transform]  reshape the response before it
 *           is cached. Needs `view`: the cache is shared, and two screens that
 *           shape the same response differently must not read each other's.
 * @property {string} [view]  names the shape `transform` produces
 */

/**
 * The cache key. Exported for tests and for `mutate` from outside a hook.
 * @param {string} path
 * @param {{ params?: Record<string, unknown>, view?: string, userId?: unknown }} [parts]
 */
export function apiKey(path, { params, view, userId } = {}) {
  return [path, params ?? null, view ?? null, userId ?? null];
}

/** @param {any} key @param {ApiOptions["transform"]} transform */
async function fetchKey(key, transform) {
  const [path, params] = key;
  const res = await api.get(path, params ? { params } : undefined);
  return transform ? transform(res.data) : res.data;
}

/**
 * @param {string | null} path  null = no request
 * @param {ApiOptions & { userId?: unknown } & import("swr").SWRConfiguration} [options]
 */
function useApiInternal(path, options = {}) {
  const { params, enabled = true, transform, view, userId, ...swrOptions } = options;
  if (transform && !view) {
    throw new Error(`useApi("${path}"): a transform needs a view name`);
  }
  const key = path && enabled ? apiKey(path, { params, view, userId }) : null;
  return useSWR(key, (swrKey) => fetchKey(swrKey, transform), { ...API_DEFAULTS, ...swrOptions });
}

/**
 * A public read — the same answer for every visitor.
 * @param {string | null} path
 * @param {ApiOptions & import("swr").SWRConfiguration} [options]
 */
export function useApi(path, options) {
  return useApiInternal(path, options);
}

/**
 * A read whose answer depends on who is signed in (`/producers/me`, the
 * owner's lists). The signed-in user's id is part of the key, so after a
 * logout and a different sign-in in the same tab, the next account never sees
 * the previous one's cached answer, not even for the moment a refresh takes.
 * No request is sent while auth is still loading or nobody is signed in.
 * @param {string | null} path
 * @param {ApiOptions & import("swr").SWRConfiguration} [options]
 */
export function useUserApi(path, options = {}) {
  const { user, loading } = useAuth();
  const userId = user?.id ?? null;
  return useApiInternal(path, {
    ...options,
    enabled: (options.enabled ?? true) && !loading && userId !== null,
    userId,
  });
}

/**
 * After a write: every cached read of `path` (any params, view or user) is
 * fetched again by the screens showing it.
 * @param {string} path
 */
export function invalidateApi(path) {
  return globalMutate((key) => Array.isArray(key) && key[0] === path);
}
