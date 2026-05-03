import { useCallback, useRef, useState } from "react";

import api from "@/lib/api";
import { showToast } from "@/lib/toast";
import { GeoSearchSchema } from "@/lib/schemas";
import { boundsToCenterRadius } from "@/lib/map-chips";
import { HALF } from "@/components/MapBottomSheet";

/**
 * Map ↔ list synchronization for /map. Owns Leaflet refs, marker /
 * card click+hover handlers, and the "search this area" geo-fetch.
 *
 * ============================================================
 * CRITICAL — DO NOT REWORK WITHOUT READING ALL OF THIS COMMENT.
 * ============================================================
 * `mapPane` renders in TWO places in MapClient.jsx — once inside the
 * desktop split-pane layout (`hidden lg:grid`) and once inside the
 * mobile bottom-sheet shell (`lg:hidden`). Each render mounts its own
 * `<MapComponent/>`, which Leaflet treats as a separate map instance.
 * The HIDDEN container (display:none, 0×0 px) produces degenerate
 * bounds where ne.lat === sw.lat — calling getBounds() on it gives
 * back garbage that survives Zod's number-validity check but fails
 * the radius_km > 0 invariant downstream.
 *
 * `registerMapApi` below disambiguates by container size: it skips
 * any registration whose container is 0×0, so `mapApiRef` always
 * points at the map the user can actually SEE. The same logic
 * underlies `mapRef.current = api.getMap()`. A second guard
 * (`boundsAreValid`) inside `handleSearchThisArea` re-checks at
 * click time and falls back to the React-state `mapBounds` (which
 * is only updated by real moveend events on the visible map) when
 * the live getBounds() call still returns degenerate values. Both
 * guards must remain — removing either silently breaks the search
 * button on whichever pane is hidden at click time.
 *
 * Source: this is the verbatim move of MapClient.jsx:104-127
 * (refs + registerMapApi) and :371-428 (handleSearchThisArea
 * including the boundsAreValid guard at :386-393). The eslint-
 * disable comment + deps array on the useCallback travel verbatim;
 * the deps `[mapBounds, chipState, categories, cityFilter]` match
 * the source — see REFACTOR_PLAN.md §File 1 risk-d for the
 * stale-closure analysis that justifies the suppression.
 * ============================================================
 *
 * MEH-58 Phase 4: card→marker hover sync uses a debounce so fast
 * list scrolling doesn't thrash marker icons. Magic-number 400 from
 * MapClient.jsx:339 extracted here as a named constant per smell #7.
 */
const HOVER_DEBOUNCE_MS = 400;

export function useMapSync({
  // from useMapFilters
  chipState,
  cityFilter,
  buildParams,
  setActiveProducerId,
  setSelectedProducer,
  setHoveredProducerId,
  setMapMoved,
  setCommittedBounds,
  // from useProducersFeed
  categories,
  setAllProducers,
  // from useFirstVisitHints
  setShowMapHint,
  setSheetSnap,
}) {
  const mapApiRef = useRef(null);
  // Direct ref to the Leaflet map instance. Both desktop + mobile MapComponents
  // set this via the `mapRef` prop, but the VISIBLE map always wins because the
  // hidden container (display:none, 0×0) produces degenerate bounds — we validate
  // below before using them.
  const mapRef = useRef(null);
  const cardRefs = useRef(new Map()); // producer.id → card wrapper DOM node
  const hoverTimerRef = useRef(null);
  const [mapBounds, setMapBounds] = useState(null);

  const registerMapApi = useCallback((api) => {
    if (!api) return;
    // `mapPane` renders in BOTH the desktop layout (hidden lg:grid) and the
    // mobile layout (lg:hidden). On desktop the mobile container has zero
    // dimensions (display:none); skip it so mapApiRef always points to the
    // map the user can actually see. On mobile the desktop container is
    // hidden and gets skipped instead.
    const container = api.getContainer?.();
    if (container) {
      const { width, height } = container.getBoundingClientRect();
      if (width === 0 && height === 0) return;
    }
    mapApiRef.current = api;
    // Keep mapRef in sync with the same visible map instance.
    mapRef.current = api.getMap?.() ?? null;
  }, []);

  const handleBoundsChange = useCallback((bounds) => {
    setMapBounds(bounds);
  }, []);

  // Card click → fly map to producer + open popup + highlight card
  const handleCardClick = useCallback((producer) => {
    if (!producer?.lat || !producer?.lng) return;
    setActiveProducerId(producer.id);
    setSelectedProducer(producer);
    document
      .getElementById("map-container")
      ?.scrollIntoView({ behavior: "smooth", block: "start" });
    setTimeout(() => mapApiRef.current?.focusProducer(producer.id), 250);
  }, [setActiveProducerId, setSelectedProducer]);

  // MEH-58 Phase 2: mobile tap marker → sheet HALF + scroll card.
  // Desktop click marker → mini-popup only (handled by MapComponent).
  const handleMarkerClick = useCallback((producer) => {
    setActiveProducerId(producer.id);
    setSelectedProducer(producer);
    const isDesktop = typeof window !== "undefined" && window.innerWidth >= 1024;
    if (!isDesktop) {
      setSheetSnap(HALF);
    }
    const el = cardRefs.current.get(producer.id);
    if (el) setTimeout(() => el.scrollIntoView({ behavior: "smooth", block: "center" }), 100);
  }, [setActiveProducerId, setSelectedProducer, setSheetSnap]);

  // docs/archive/MAP_IMPROVEMENTS.md #3 — hover sync: map → card
  const handleMarkerHover = useCallback((producerId) => {
    setHoveredProducerId(producerId);
  }, [setHoveredProducerId]);

  // MEH-58 Phase 4: card → marker hover sync with HOVER_DEBOUNCE_MS debounce so
  // fast scrolling through the list doesn't thrash marker icons.
  const handleCardMouseEnter = useCallback((producerId) => {
    if (hoverTimerRef.current) clearTimeout(hoverTimerRef.current);
    hoverTimerRef.current = setTimeout(() => {
      setHoveredProducerId(producerId);
      mapApiRef.current?.setHoveredProducer(producerId);
    }, HOVER_DEBOUNCE_MS);
  }, [setHoveredProducerId]);
  const handleCardMouseLeave = useCallback(() => {
    if (hoverTimerRef.current) clearTimeout(hoverTimerRef.current);
    hoverTimerRef.current = null;
    setHoveredProducerId(null);
    mapApiRef.current?.setHoveredProducer(null);
  }, [setHoveredProducerId]);

  // docs/archive/MAP_IMPROVEMENTS.md #1 — map moved → show "search this area" button.
  // Also dismisses the onboarding hint immediately: panning means the user
  // has already engaged with the map so the hint is no longer useful, and
  // rtl-ok: comment references the existing horizontal-center idiom in MapClient.jsx,
  // does not introduce any className — the substring below is documentation-only.
  // both elements share top-4 with the centered class — letting them stack is confusing.
  const handleMapMove = useCallback(() => {
    setMapMoved(true);
    if (typeof window !== "undefined" && !sessionStorage.getItem("map_tour_shown")) {
      setShowMapHint(false);
      sessionStorage.setItem("map_tour_shown", "1");
    }
  }, [setMapMoved, setShowMapHint]);

  const handleMapCanvasClick = useCallback(() => {
    setSelectedProducer(null);
    setActiveProducerId(null);
  }, [setSelectedProducer, setActiveProducerId]);

  // MEH-14 / old bug #14: commit the current viewport AND refetch
  // producers from the backend with lat/lng/radius_km so the list
  // below reflects the area currently on screen. Previously the click
  // only did a local filter, so stale initial data was never refreshed.
  // Now it's true geo-awareness — powered by the existing Haversine
  // SQL on /producers.
  const handleSearchThisArea = useCallback(() => {
    // `mapPane` renders in two places (desktop + mobile CSS slots). Both mount
    // a MapComponent that calls mapRef.current = leafletInstance. The HIDDEN
    // container (display:none, 0×0 px) produces degenerate bounds where
    // north===south and east===west. Detect this and fall back to `mapBounds`
    // (React state), which is only updated by real user-initiated moveend events
    // on the VISIBLE map — so after any pan it holds the correct viewport.
    // Use NE/SW corner accessors (same data as getNorth/etc, but Leaflet's
    // canonical viewport API). A hidden (display:none, 0×0 px) container makes
    // getBounds() collapse to a single point → ne.lat === sw.lat. Detect and
    // fall back to mapBounds (React state), which is set only by real moveend
    // events from the VISIBLE map.
    const rawBounds = mapRef.current?.getBounds();
    const ne = rawBounds?.getNorthEast();
    const sw = rawBounds?.getSouthWest();
    const boundsAreValid =
      ne && sw &&
      !isNaN(ne.lat) && !isNaN(ne.lng) &&
      !isNaN(sw.lat) && !isNaN(sw.lng) &&
      (ne.lat !== sw.lat || ne.lng !== sw.lng);
    const liveBounds = boundsAreValid
      ? { north: ne.lat, south: sw.lat, east: ne.lng, west: sw.lng }
      : mapBounds;

    setCommittedBounds(liveBounds);
    setMapMoved(false);

    const centerRadius = boundsToCenterRadius(liveBounds);

    // Zod validates lat/lng/radius_km before the fetch:
    //   - radius_km < 1  → degenerate viewport (NaN/0 from hidden map)
    //   - radius_km > 200 → backend Haversine full-table scan → 500
    // delivery_city excluded: geo-radius = "producers physically here",
    // delivery_city = "producers who deliver to my city" — different questions.
    const { delivery_city: _excluded, ...chipParams } = buildParams();
    const geoValidation = GeoSearchSchema.safeParse({
      lat: centerRadius?.lat,
      lng: centerRadius?.lng,
      radius_km: centerRadius?.radius_km,
    });
    if (!geoValidation.success) {
      // Zod v4: issues (not errors). Fall back to a generic Hebrew message
      // if the shape ever changes again.
      const msg = geoValidation.error.issues?.[0]?.message || "חיפוש לא תקין";
      showToast(msg, "info");
      return;
    }
    const params = { ...chipParams, ...geoValidation.data };
    if (process.env.NODE_ENV !== "production") {
      // eslint-disable-next-line no-console
      console.log("[חפשי באזור זה] GET /producers", params);
    }
    api
      .get("/producers", { params })
      .then((r) => setAllProducers(r.data))
      .catch(() => setAllProducers([]));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mapBounds, chipState, categories, cityFilter]);

  return {
    mapApiRef,
    mapRef,
    cardRefs,
    registerMapApi,
    handleBoundsChange,
    handleCardClick,
    handleMarkerClick,
    handleMarkerHover,
    handleCardMouseEnter,
    handleCardMouseLeave,
    handleMapMove,
    handleMapCanvasClick,
    handleSearchThisArea,
  };
}
