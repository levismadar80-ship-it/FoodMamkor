import { useCallback, useEffect, useRef, useState } from "react";

import { getRecentlyViewedIds } from "@/lib/recently-viewed";
import { PEEK } from "@/components/MapBottomSheet";

/**
 * Self-contained shell-UX state for /map. NO cross-hook inputs —
 * everything here is either local state or read from
 * sessionStorage / localStorage. This keeps the hook acyclic so it
 * can be called from MapClient.jsx in any order relative to
 * useProducersFeed / useMapFilters / useMapSync.
 *
 * Owns:
 *   - legendOpen + legendRef (with click-outside dismiss)
 *     ← MapClient.jsx:79-80 + :82-89
 *   - visitedIds (seeded once on mount from getRecentlyViewedIds)
 *     ← MapClient.jsx:96 + :132
 *   - splitRatio (desktop) ← MapClient.jsx:100
 *   - sheetSnap (mobile, default PEEK) ← MapClient.jsx:101
 *   - mobileView (legacy state, unused but preserved per regression
 *     rule 1 — grep before delete) ← MapClient.jsx:94
 *
 * REMOVED from this hook in MEH-407 PR3 commit 11a (corrective):
 *   - useUserCity() call → lifted to MapClient.jsx shell
 *   - locationModalOpen + location-modal trigger effect → MapClient.jsx
 *     (depends on userCity which is now shell-level)
 *   - locationModalFiredRef → MapClient.jsx (paired with the trigger)
 *   - showCityPicker → MapClient.jsx (consumed by useMapFilters)
 *   - handleMapCitySelected → MapClient.jsx (uses setUserCity +
 *     setCityFilter + loadProducers — all shell-level / cross-hook)
 *   - handleGpsClick + gpsLoading → MapClient.jsx (uses mapApiRef
 *     from useMapSync; cycle break)
 *   - body-class effect (selectedProducer watcher) → useMapFilters
 *     (selectedProducer is owned there; one-line co-location)
 *   - focusProducer deep-link effect → MapClient.jsx (uses mapApiRef
 *     + allProducers + setActiveProducerId; cycle break)
 *
 * The reason for this trim is the cycle described in MEH-407 PR3
 * plan exec notes: useFirstVisitHints had absorbed useUserCity AND
 * cross-hook handlers/effects, which created a 2-hook cycle with
 * useMapFilters + a 3-hook cycle through useMapSync. Stripping the
 * cycle-inducing surfaces breaks both.
 */
export function useFirstVisitHints() {
  const [legendOpen, setLegendOpen] = useState(false);
  // MEH-1010: legendRef is a callback ref collecting BOTH legend wrapper
  // nodes — MapPane mounts twice (desktop shell + mobile shell,
  // MapClient.jsx render sites), and the old single useRef ended up
  // pointing at the last-mounted (hidden mobile) instance. The
  // click-outside below then saw clicks INSIDE the desktop panel as
  // "outside" and closed it mid-click, swallowing category clicks.
  // React 18 callback refs report unmount as fn(null) without saying
  // which node — stale nodes are pruned by isConnected instead.
  const legendNodesRef = useRef(new Set());
  const legendRef = useCallback((el) => {
    if (!el) return;
    legendNodesRef.current.add(el);
    for (const n of legendNodesRef.current) {
      if (!n.isConnected) legendNodesRef.current.delete(n);
    }
  }, []);
  const [visitedIds, setVisitedIds] = useState([]);
  const [splitRatio, setSplitRatio] = useState("40fr 60fr");
  const [sheetSnap, setSheetSnap] = useState(PEEK);
  // MEH-14: mobile map/list toggle. Desktop ignores this (always shows both).
  const [mobileView, setMobileView] = useState("map");

  // Recently-viewed seed on mount (was bundled into the producers/
  // categories fetch effect at MapClient.jsx:129-133; harmless split).
  useEffect(() => {
    setVisitedIds(getRecentlyViewedIds());
  }, []);

  // Legend click-outside dismiss. MEH-1010: "inside" = inside ANY mounted
  // legend instance (the hidden one can't receive events anyway) — map
  // canvas / anywhere else still closes the panel.
  useEffect(() => {
    if (!legendOpen) return;
    const onClick = (e) => {
      let inside = false;
      for (const n of legendNodesRef.current) {
        if (n.isConnected && n.contains(e.target)) { inside = true; break; }
      }
      if (!inside) setLegendOpen(false);
    };
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, [legendOpen]);

  return {
    legendOpen,
    setLegendOpen,
    legendRef,
    visitedIds,
    splitRatio,
    setSplitRatio,
    sheetSnap,
    setSheetSnap,
    mobileView,
    setMobileView,
  };
}
