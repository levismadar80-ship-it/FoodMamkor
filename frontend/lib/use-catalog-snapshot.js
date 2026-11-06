"use client";

import { useEffect, useState } from "react";

import api from "@/lib/api";
import { ProducersResponseSchema } from "@/lib/schemas";

/**
 * Module:   use-catalog-snapshot
 * Purpose:  MEH-2767 — the UNFILTERED catalog that home and /producers count
 *           their filter-chip gates on, so they count the same thing /map
 *           counts (useProducersFeed.catalogSnapshot: one GET /producers with
 *           no params). Before this, /producers counted its loaded pages and
 *           home counted the first screenful of its FILTERED results — so one
 *           catalog produced three different chip sets.
 * Returns:  { catalog, status: "pending"|"ready"|"failed", complete }
 *           — the input lib/producer-filters.js visibleAxisChips takes.
 *           `complete` reads the response's X-Total-Count, so whether the
 *           snapshot is the whole catalog is the server's answer, not a copy
 *           of its page-size constant.
 * Does NOT: filter anything, or feed what the page LISTS. It only decides
 *           which chips exist.
 *
 * Shared, not per mount: the promise is cached at module level for
 * SNAPSHOT_TTL_MS, so home → /producers in the same tab reuses it, while a
 * long-lived tab still picks up a newly approved business within minutes. A
 * failure is not cached — the next mount tries again.
 */
const SNAPSHOT_TTL_MS = 5 * 60 * 1000;
let cached = null;
let cachedAt = 0;

function fetchSnapshot() {
  if (cached && Date.now() - cachedAt > SNAPSHOT_TTL_MS) cached = null;
  if (!cached) {
    cachedAt = Date.now();
    const request = api
      .get("/producers")
      .then((response) => {
        const parsed = ProducersResponseSchema.safeParse(response.data);
        if (!parsed.success) throw new Error("malformed /producers payload");
        const total = Number(response.headers?.["x-total-count"]);
        const complete = Number.isFinite(total) ? parsed.data.length >= total : undefined;
        return { catalog: parsed.data, complete };
      })
      .catch((error) => {
        // Only clear the slot if it still holds THIS request — after a TTL
        // expiry a newer request may own it, and wiping that would refetch.
        if (cached === request) cached = null;
        throw error;
      });
    cached = request;
  }
  return cached;
}

/** Test hook: forget the cached snapshot. */
export function resetCatalogSnapshotCache() {
  cached = null;
  cachedAt = 0;
}

export function useCatalogSnapshot() {
  const [state, setState] = useState({ catalog: null, status: "pending", complete: undefined });
  useEffect(() => {
    let alive = true;
    fetchSnapshot()
      .then(({ catalog, complete }) => {
        if (alive) setState({ catalog, status: "ready", complete });
      })
      .catch(() => {
        if (alive) setState({ catalog: null, status: "failed", complete: undefined });
      });
    return () => {
      alive = false;
    };
  }, []);
  return state;
}
