import { useCallback, useEffect, useRef, useState } from "react";

import { showToast } from "@/lib/toast";
import { useUserCity } from "@/lib/use-user-city";
import { getRecentlyViewedIds } from "@/lib/recently-viewed";
import { PEEK } from "@/components/MapBottomSheet";

/**
 * Owns the first-visit and shell-UX state of /map: onboarding hint
 * timer, location-modal trigger, focusProducer deep-link, body class
 * for sheet open, GPS center button, legend open/close, recently-
 * viewed visitedIds, split-pane ratio, and bottom-sheet snap.
 *
 * Verbatim extraction from MapClient.jsx:
 *   :77 showCityPicker
 *   :79-80 legendOpen + legendRef
 *   :82-89 legend click-outside effect
 *   :90 useUserCity()
 *   :91 locationModalOpen
 *   :96 visitedIds
 *   :97 showMapHint
 *   :100 splitRatio
 *   :101 sheetSnap (default PEEK)
 *   :102 gpsLoading
 *   :132 setVisitedIds(getRecentlyViewedIds()) — moved to its own
 *        mount-only effect (the source bundled it into the
 *        producers/categories fetch effect; split is harmless)
 *   :135-154 onboarding hint timers + once-click dismiss
 *   :161 locationModalFiredRef
 *   :162-169 location modal trigger effect
 *   :171-180 handleMapCitySelected
 *   :185-193 body class for sheet open
 *   :196-215 focusProducer deep-link from /producer/:id
 *   :430-455 handleGpsClick
 *
 * Cross-hook dependencies are passed in via props:
 *   - mapApiRef ← useMapSync (deep-link focusProducer + GPS flyTo)
 *   - allProducers ← useProducersFeed (deep-link gate)
 *   - selectedProducer ← useMapFilters (body class effect)
 *   - setActiveProducerId ← useMapFilters (deep-link)
 *   - setCityFilter ← useMapFilters (handleMapCitySelected)
 *   - loadProducers ← useProducersFeed (handleMapCitySelected)
 *
 * Note: `sortBy` and `mobileView` from MapClient.jsx (lines 78, 94)
 * are NOT moved here. `sortBy` is shell-only JSX state (sort
 * dropdown); `mobileView` is currently unused (preserved verbatim,
 * not deleted, per regression rule 1). Both stay inline in
 * MapClient.jsx after slimming.
 */
export function useFirstVisitHints({
  mapApiRef,
  allProducers,
  selectedProducer,
  setActiveProducerId,
  setCityFilter,
  loadProducers,
}) {
  const { city: userCity, setCity: setUserCity } = useUserCity();
  const [locationModalOpen, setLocationModalOpen] = useState(false);
  const [showCityPicker, setShowCityPicker] = useState(false);
  const [legendOpen, setLegendOpen] = useState(false);
  const legendRef = useRef(null);
  const [visitedIds, setVisitedIds] = useState([]);
  const [showMapHint, setShowMapHint] = useState(false);
  const [splitRatio, setSplitRatio] = useState("40fr 60fr");
  const [sheetSnap, setSheetSnap] = useState(PEEK);
  const [gpsLoading, setGpsLoading] = useState(false);
  const locationModalFiredRef = useRef(false);

  // Legend click-outside dismiss
  useEffect(() => {
    if (!legendOpen) return;
    const onClick = (e) => {
      if (legendRef.current && !legendRef.current.contains(e.target)) setLegendOpen(false);
    };
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, [legendOpen]);

  // Recently-viewed seed on mount (was bundled into the producers/
  // categories fetch effect at MapClient.jsx:129-133; harmless split).
  useEffect(() => {
    setVisitedIds(getRecentlyViewedIds());
  }, []);

  // MEH-58 Phase 1: onboarding hint — first visit only (sessionStorage).
  useEffect(() => {
    if (typeof window === "undefined") return;
    if (sessionStorage.getItem("map_tour_shown")) return;
    const show = setTimeout(() => setShowMapHint(true), 3000);
    const dismiss = setTimeout(() => {
      setShowMapHint(false);
      sessionStorage.setItem("map_tour_shown", "1");
    }, 6000);
    const onClick = () => {
      setShowMapHint(false);
      sessionStorage.setItem("map_tour_shown", "1");
    };
    window.addEventListener("click", onClick, { once: true });
    return () => {
      clearTimeout(show);
      clearTimeout(dismiss);
      window.removeEventListener("click", onClick);
    };
  }, []);

  // MEH-41: prompt for city on first /map visit when no city is saved.
  // Depends on userCity so the effect re-runs when use-user-city hydrates
  // from localStorage (which initialises to null, then sets the real value
  // in its own useEffect). Without the dependency the 800ms timer fires
  // even when a city IS already saved — stale closure on null.
  useEffect(() => {
    if (locationModalFiredRef.current || userCity) return;
    const timer = setTimeout(() => {
      locationModalFiredRef.current = true;
      setLocationModalOpen(true);
    }, 800);
    return () => clearTimeout(timer);
  }, [userCity]);

  const handleMapCitySelected = useCallback((city) => {
    setUserCity(city);
    setCityFilter(city);
    loadProducers({ delivery_city: city });
    // NOTE: deliberately no flyTo here. The initial view must stay anchored at
    // [31.7683, 35.2137] zoom 8 (country-wide) — LocationModal only filters
    // the producer list by delivery_city, it doesn't pan the map. Users who
    // want to zoom into their city use the "קרוב אליי" (goToMyLocation)
    // button or pan manually.
  }, [setUserCity, setCityFilter, loadProducers]);

  // MEH-30 follow-up: when the bottom sheet is open, mark the body so
  // CSS can hide the CookieBanner (which otherwise peeks below the
  // sheet's bottom edge — see globals.css `.sheet-open` rule).
  useEffect(() => {
    if (typeof document === "undefined") return;
    if (selectedProducer) {
      document.body.classList.add("sheet-open");
    } else {
      document.body.classList.remove("sheet-open");
    }
    return () => document.body.classList.remove("sheet-open");
  }, [selectedProducer]);

  // Deep-link from /producer/:id → sessionStorage → flyTo + popup + highlight card
  useEffect(() => {
    if (allProducers.length === 0) return;
    let focus;
    try {
      const raw = sessionStorage.getItem("focusProducer");
      if (!raw) return;
      focus = JSON.parse(raw);
      sessionStorage.removeItem("focusProducer");
    } catch {
      return;
    }
    if (!focus?.id) return;
    setActiveProducerId(focus.id);

    // Give the map a tick to mount + markers to register before flying
    const t = setTimeout(() => {
      mapApiRef.current?.focusProducer(focus.id);
    }, 400);
    return () => clearTimeout(t);
  }, [allProducers, mapApiRef, setActiveProducerId]);

  const handleGpsClick = useCallback(() => {
    if (gpsLoading) return;
    if (!navigator.geolocation) {
      showToast("הדפדפן שלך לא תומך ב-GPS", "error");
      return;
    }
    setGpsLoading(true);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setGpsLoading(false);
        const { latitude: lat, longitude: lng } = pos.coords;
        if (!lat || !lng || isNaN(lat) || isNaN(lng)) return;
        mapApiRef.current?.getMap()?.flyTo([lat, lng], 13, { duration: 1.2 });
      },
      (err) => {
        setGpsLoading(false);
        const msgs = {
          1: "לא ניתן גישה למיקום. אפשרי בהגדרות הדפדפן.",
          2: "המיקום שלך לא זמין. נסי מאוחר יותר.",
          3: "לקח יותר מדי זמן. נסי שוב.",
        };
        showToast(msgs[err.code] ?? "לא הצלחנו לקבל את המיקום שלך", "error");
      },
      { timeout: 8000, enableHighAccuracy: true }
    );
  }, [gpsLoading, mapApiRef]);

  return {
    // useUserCity proxy
    userCity,
    setUserCity,
    // hints + shell state
    locationModalOpen,
    setLocationModalOpen,
    showCityPicker,
    setShowCityPicker,
    legendOpen,
    setLegendOpen,
    legendRef,
    visitedIds,
    showMapHint,
    setShowMapHint,
    splitRatio,
    setSplitRatio,
    sheetSnap,
    setSheetSnap,
    gpsLoading,
    // handlers
    handleMapCitySelected,
    handleGpsClick,
  };
}
