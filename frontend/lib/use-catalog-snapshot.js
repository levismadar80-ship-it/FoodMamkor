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
 * Returns:  { catalog: Producer[] | null, status: "pending"|"ready"|"failed" }
 *           — the exact input lib/producer-filters.js visibleAxisChips takes.
 * Does NOT: filter anything, or feed what the page LISTS. It only decides
 *           which chips exist.
 *
 * One request per page load, shared: the promise is cached at module level,
 * so home → /producers in the same tab reuses it. A failure is not cached —
 * the next mount tries again.
 */
let cached = null;

function fetchSnapshot() {
  if (!cached) {
    cached = api
      .get("/producers")
      .then((r) => {
        const parsed = ProducersResponseSchema.safeParse(r.data);
        if (!parsed.success) throw new Error("malformed /producers payload");
        return parsed.data;
      })
      .catch((error) => {
        cached = null;
        throw error;
      });
  }
  return cached;
}

/** Test hook: forget the cached snapshot. */
export function resetCatalogSnapshotCache() {
  cached = null;
}

export function useCatalogSnapshot() {
  const [state, setState] = useState({ catalog: null, status: "pending" });
  useEffect(() => {
    let alive = true;
    fetchSnapshot()
      .then((catalog) => {
        if (alive) setState({ catalog, status: "ready" });
      })
      .catch(() => {
        if (alive) setState({ catalog: null, status: "failed" });
      });
    return () => {
      alive = false;
    };
  }, []);
  return state;
}
