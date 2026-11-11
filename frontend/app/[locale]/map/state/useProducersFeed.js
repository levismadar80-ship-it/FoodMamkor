import { useEffect, useRef, useState } from "react";
import { useTranslations } from "next-intl";

import api from "@/lib/api";
import { showToast } from "@/lib/toast";
import { ProducersResponseSchema } from "@/lib/schemas";
import { mapFiltersFromQuery } from "@/lib/filter-url";
import { cityParams } from "@/lib/map-city-params";

/**
 * Owns the /map page's network feed: the producer list, the category
 * list, and the loadProducers helper that refetches with chip params.
 *
 * Verbatim extraction from MapClient.jsx:39-40 (state),
 * :129-133 (initial fetch effect that hydrates both producers and
 * categories), :217-227 (loadProducers helper with toast on error).
 *
 * The geo-search refetch in handleSearchThisArea (useMapSync) does
 * NOT route through loadProducers — it calls api.get("/producers", …)
 * directly because it needs to bypass the toast-on-error flow when
 * the geo bounds are degenerate. This is preserved verbatim from the
 * source (:423-426).
 */
export function useProducersFeed({ readInitialParams = null } = {}) {
  const t = useTranslations();
  const [allProducers, setAllProducers] = useState([]);
  const [categories, setCategories] = useState([]);
  // MEH-1054 (MAP-16): additive loading flag so the bottom sheet can render
  // a skeleton instead of flashing "0 businesses" on first paint. Starts
  // true — the mount effect fires loadProducers immediately. NOTE: the
  // geo-search refetch in useMapSync bypasses loadProducers (documented
  // above) and deliberately does NOT toggle this flag — MAP-16 covers the
  // initial-load flicker, not area re-queries over an already-drawn list.
  const [loading, setLoading] = useState(true);
  // MEH-2170: the mount catalog, captured ONCE from the first fetch — the
  // only request that is both unfiltered and not viewport-bounded. Never
  // overwritten by a toggle reload (loadProducers with chip params) or by the
  // geo-search refetch in useMapSync (which bypasses loadProducers anyway).
  // null until that first fetch resolves; consumers treat null as "unknown"
  // and gate nothing. See lib/map-chips.js visibleMapToggleChips.
  const [catalogSnapshot, setCatalogSnapshot] = useState(null);
  // true until the mount fetch answers — success, malformed or network
  // failure alike — so the chip gates can tell "not yet" from "failed".
  const [snapshotPending, setSnapshotPending] = useState(true);

  // MEH-779: a malformed payload degrades to the same state as a network
  // failure — empty list + toast — so the map never crashes on bad data.
  const handleLoadFailure = (reason) => {
    console.error("[חפשי באזור זה] GET /producers failed:", reason);
    setAllProducers([]);
    showToast.error(t("map.errors.load_failed"));
  };

  // MEH-2049: latest-wins. Every call takes a number; a response that is not
  // the newest call's is dropped — no list, loading or error update — so an
  // older, slower request (the mount load racing the catalog-arrival load in
  // useMapFilters, or two fast chip taps) can never overwrite a newer one. The snapshot capture is
  // exempt: it is not the list, and it is only ever asked for once.
  const latestRequest = useRef(0);

  const loadProducers = (params = {}, { snapshot = false, then = null } = {}) => {
    const requestId = ++latestRequest.current;
    const isLatest = () => requestId === latestRequest.current;
    setLoading(true);
    api
      .get("/producers", { params })
      .then((r) => {
        // Rule-19 belt-and-braces on the response side: validate the shape
        // before it reaches marker creation / the feed list.
        const parsed = ProducersResponseSchema.safeParse(r.data);
        if (snapshot) setSnapshotPending(false);
        if (!parsed.success) {
          if (!isLatest()) return;
          handleLoadFailure(parsed.error.issues);
          // MEH-2598: a failed snapshot must not swallow the filtered load.
          then?.();
          return;
        }
        // MEH-2170: only the mount call asks for the snapshot; a failed or
        // malformed first load leaves it null (no gating), by design.
        if (snapshot) setCatalogSnapshot(parsed.data);
        // MEH-2049: a newer load owns the list (and, if this was the snapshot,
        // supersedes its chained `then` — that newer load already carries the
        // filters).
        if (!isLatest()) return;
        // MEH-2598: a deep link with filters (`then`) — the unfiltered snapshot
        // still feeds the chip gates, but the LIST is the filtered fetch, run
        // after it rather than beside it so a slower snapshot response can
        // never overwrite the filtered one.
        if (then) {
          then();
          return;
        }
        setAllProducers(parsed.data);
      })
      .catch((reason) => {
        if (snapshot) setSnapshotPending(false);
        if (!isLatest()) return;
        handleLoadFailure(reason);
        // MEH-2598: a failed snapshot must not swallow the filtered load.
        then?.();
      })
      // MEH-1054: every terminal path (data / malformed / network error)
      // clears loading — the failure states already render their own UX
      // (empty list + toast), the skeleton must not stick over them.
      .finally(() => {
        // MEH-2598: a chained filtered load owns the flag from here — it is
        // the newer call, so this one is no longer the latest.
        // MEH-2049: likewise any newer call; only the latest clears the flag.
        if (isLatest()) setLoading(false);
      });
  };

  useEffect(() => {
    // MEH-2598: /map?has_delivery=1… (from the list's «הצגה במפה») — the
    // snapshot stays unfiltered; the filtered list follows it. Read from
    // window.location on mount (client only), not from the server page's
    // searchParams, so /map stays a static route.
    const initialParams = { ...(readInitialParams ? readInitialParams() : null) };
    // MEH-2049: + the city /map wrote to its own URL (lib/filter-url — the
    // same reader useMapFilters hydrates the field from), mapped exactly as
    // useMapFilters.buildParams maps it (one helper, lib/map-city-params).
    // A URL CATEGORY is not read here: chip keys become ids only once
    // /categories answers, and that load is useMapFilters' (its catalog-arrival
    // effect), built from the state at that moment — so a chip tapped in
    // between is in it, not overwritten by mount-time params.
    const urlCity =
      typeof window === "undefined"
        ? ""
        : mapFiltersFromQuery(new URLSearchParams(window.location.search)).city;
    Object.assign(initialParams, cityParams(urlCity, initialParams.has_delivery));
    api.get("/categories").then((r) => setCategories(r.data)).catch(() => {});
    const hasInitial = Object.keys(initialParams).length > 0;
    loadProducers(
      {},
      {
        snapshot: true,
        then: hasInitial ? () => loadProducers(initialParams) : null,
      },
    );
  }, []);

  return {
    allProducers,
    setAllProducers,
    categories,
    loadProducers,
    loading,
    catalogSnapshot,
    snapshotPending,
  };
}
