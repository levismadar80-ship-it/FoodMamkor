// @ts-check
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
 * The geo-search refetch in handleSearchThisArea (useMapSync) goes
 * through loadArea below, not loadProducers: it never re-arms the
 * loading flag (MAP-16), but it takes the same latest-wins ticket,
 * the same schema check and the same failure path (MEH-3198). The
 * degenerate-bounds guard (toast.info, no fetch) stays in useMapSync.
 */
export function useProducersFeed({ readInitialParams = null } = {}) {
  const t = useTranslations();
  const [allProducers, setAllProducers] = useState([]);
  const [categories, setCategories] = useState([]);
  // MEH-1054 (MAP-16): additive loading flag so the bottom sheet can render
  // a skeleton instead of flashing "0 businesses" on first paint. Starts
  // true — the mount effect fires loadProducers immediately. NOTE: the
  // geo-search refetch (loadArea, documented above) deliberately never SETS
  // this flag — MAP-16 covers the initial-load flicker, not area re-queries
  // over an already-drawn list. It only clears it as the newest call.
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
  // MEH-3198: the newest list load failed (network or malformed). The list
  // shows an error with «נסו שוב» instead of "no businesses found", which
  // would read as "there are none". Cleared by the next successful load.
  const [loadError, setLoadError] = useState(false);
  // MEH-3198: the newest list call (chip load or area search), so «נסו שוב»
  // repeats exactly it.
  const lastLoad = useRef(() => loadProducers({}));

  // MEH-779: a malformed payload degrades to the same state as a network
  // failure — empty list + toast — so the map never crashes on bad data.
  const handleLoadFailure = (reason) => {
    console.error("[חפשי באזור זה] GET /producers failed:", reason);
    setAllProducers([]);
    setLoadError(true);
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
    if (!then) lastLoad.current = () => loadProducers(params);
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
        setLoadError(false);
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

  // MEH-3198: «חפשו באזור זה» (useMapSync). Takes a ticket like
  // loadProducers, so an older area search can't overwrite a newer load's
  // rows or error, and a newer area search supersedes an older chip load.
  // It does not set `loading` (MAP-16: an area re-query over a drawn list
  // shows no skeleton), but as the newest call it clears it, or a chip load
  // it superseded would leave the skeleton on.
  const loadArea = (params) => {
    const requestId = ++latestRequest.current;
    lastLoad.current = () => loadArea(params);
    const isLatest = () => requestId === latestRequest.current;
    api
      .get("/producers", { params })
      .then((r) => {
        if (!isLatest()) return;
        const parsed = ProducersResponseSchema.safeParse(r.data);
        if (!parsed.success) {
          handleLoadFailure(parsed.error.issues);
          return;
        }
        setAllProducers(parsed.data);
        setLoadError(false);
      })
      .catch((reason) => {
        if (isLatest()) handleLoadFailure(reason);
      })
      .finally(() => {
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
    loadArea,
    loading,
    catalogSnapshot,
    snapshotPending,
    loadError,
    // MEH-3198: «נסו שוב» repeats the newest list call, area search included.
    retry: () => lastLoad.current(),
  };
}
