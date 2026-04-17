"use client";

import { useEffect, useRef } from "react";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import "leaflet.markercluster";
import "leaflet.markercluster/dist/MarkerCluster.css";
import "leaflet.markercluster/dist/MarkerCluster.Default.css";
import { styleForProducer } from "@/lib/map-categories";

/**
 * MapComponent — raw-Leaflet map with custom category-colored markers
 * and clustering. Covers docs/archive/MAP_IMPROVEMENTS.md items #4, #5, #6, #10.
 *
 * Clustering: uses vanilla `leaflet.markercluster` (not
 * react-leaflet-cluster) because this component drives Leaflet
 * directly without react-leaflet.
 *
 * Bug fix (#10): the old marker had Leaflet's default `alt="Marker"`,
 * which on some hover tooltips shows up as "arker" after letter
 * truncation. Now we:
 *   - Set `alt: producer.name` explicitly
 *   - Set `title: producer.name` for the browser tooltip
 *   - Bind a Leaflet tooltip with the actual name
 *   - Defensively skip producers without name/lat/lng
 *
 * Parent communicates via `registerApi` callback (not refs — next/dynamic
 * doesn't reliably forward refs).
 */

// docs/archive/MAP_IMPROVEMENTS.md #5 — category color + emoji lookup lives in
// lib/map-categories.js (shared with MapClient since this component is
// dynamically loaded with ssr:false).

/** Create a teardrop divIcon, color + emoji by category.
 *
 * MEH-14: when `visited` is true we dim the marker (0.55 opacity) so
 * producers the user has already browsed fade into the background.
 * Active + hovered states override dim so the current focus is always
 * crisp.
 */
function createCategoryMarker(
  producer,
  { active = false, hovered = false, visited = false } = {},
) {
  const { color, emoji } = styleForProducer(producer);
  const size = active ? 44 : hovered ? 38 : 32;
  const iconOffset = active ? 22 : hovered ? 19 : 16;
  const dimmed = visited && !active && !hovered;
  const opacity = dimmed ? 0.55 : 1;
  const borderColor = dimmed ? "#9ca3af" : color;

  const html = `
    <div class="mehamakor-marker ${active ? "active" : ""} ${hovered ? "hovered" : ""} ${dimmed ? "visited" : ""}"
         style="
           background: ${active ? color : "white"};
           color: ${active ? "white" : color};
           border: 2px solid ${borderColor};
           border-radius: 50% 50% 50% 0;
           transform: rotate(-45deg);
           width: ${size}px;
           height: ${size}px;
           display: flex; align-items: center; justify-content: center;
           box-shadow: 0 2px 8px rgba(0,0,0,0.2);
           opacity: ${opacity};
           transition: all 0.18s ease-out;
         ">
      <span aria-hidden="true" style="transform: rotate(45deg); font-size: ${active ? 20 : 14}px;">
        ${emoji}
      </span>
    </div>
  `;

  return L.divIcon({
    html,
    className: "mehamakor-marker-wrap",
    iconSize: [size, size],
    iconAnchor: [iconOffset, size],
    popupAnchor: [0, -size],
  });
}

export default function MapComponent({
  producers = [],
  onProducerClick,
  onProducerHover,
  onBoundsChange,
  onMapMove,
  registerApi,
  // MEH-14: IDs of producers the user has already viewed (from
  // recently_viewed sessionStorage). These markers render dimmed.
  visitedIds = null,
}) {
  const visitedSet =
    visitedIds instanceof Set
      ? visitedIds
      : new Set(Array.isArray(visitedIds) ? visitedIds : []);
  const mapRef = useRef(null);
  const mapInstanceRef = useRef(null);
  const clusterGroupRef = useRef(null);
  const markersRef = useRef(new Map()); // producer.id → { marker, producer }
  const hoveredIdRef = useRef(null);
  const activeIdRef = useRef(null);
  // MAP_IMPROVEMENTS bug #13 — reuse a single marker for "my location"
  // instead of stacking a fresh circleMarker on every click.
  const myLocationMarkerRef = useRef(null);
  // MAP_IMPROVEMENTS #11 — remember whether we've auto-fit yet so we
  // only do it on the first non-empty batch of producers.
  const hasFitBoundsRef = useRef(false);
  // Programmatic-move guard: when we call flyTo/fitBounds ourselves the
  // resulting `moveend` should NOT mark the map as "user-moved" and
  // should NOT pop the "search this area" button.
  const programmaticMoveRef = useRef(false);

  // Keep latest callbacks in refs so we don't re-init the map whenever
  // the parent passes new arrow functions.
  const onBoundsChangeRef = useRef(onBoundsChange);
  onBoundsChangeRef.current = onBoundsChange;
  const onProducerClickRef = useRef(onProducerClick);
  onProducerClickRef.current = onProducerClick;
  const onProducerHoverRef = useRef(onProducerHover);
  onProducerHoverRef.current = onProducerHover;
  const onMapMoveRef = useRef(onMapMove);
  onMapMoveRef.current = onMapMove;

  // Refresh a single marker's icon based on active/hover/visited state
  const refreshMarkerIcon = (id) => {
    const entry = markersRef.current.get(id);
    if (!entry) return;
    entry.marker.setIcon(
      createCategoryMarker(entry.producer, {
        active: activeIdRef.current === id,
        hovered: hoveredIdRef.current === id,
        visited: visitedSet.has(id),
      }),
    );
  };

  // Expose imperative API via a callback prop
  useEffect(() => {
    if (!registerApi) return;
    const api = {
      focusProducer: (producerId) => {
        const entry = markersRef.current.get(producerId);
        if (!entry || !mapInstanceRef.current) return;
        const prev = activeIdRef.current;
        activeIdRef.current = producerId;
        if (prev) refreshMarkerIcon(prev);
        refreshMarkerIcon(producerId);
        const latlng = entry.marker.getLatLng();
        // Suppress the "search this area" banner on programmatic flyTo.
        programmaticMoveRef.current = true;
        mapInstanceRef.current.flyTo(latlng, 14, { duration: 1.2 });
      },
      setHoveredProducer: (producerId) => {
        const prev = hoveredIdRef.current;
        if (prev === producerId) return;
        hoveredIdRef.current = producerId;
        if (prev) refreshMarkerIcon(prev);
        if (producerId) refreshMarkerIcon(producerId);
      },
      // MEH-30 #1 — "near me" was an absolute overlay button inside this
      // component. Button now lives in MapClient (inline with the city
      // search) and calls this imperative method on success. Geolocation
      // + the "my location" marker stay here because they operate on
      // the internal `mapInstanceRef` and `myLocationMarkerRef`.
      goToMyLocation: () => {
        if (!mapInstanceRef.current || !navigator.geolocation) return;
        navigator.geolocation.getCurrentPosition(
          (pos) => {
            const { latitude, longitude } = pos.coords;
            const latlng = [latitude, longitude];
            programmaticMoveRef.current = true;
            mapInstanceRef.current.flyTo(latlng, 13, { duration: 1.2 });
            if (myLocationMarkerRef.current) {
              myLocationMarkerRef.current.setLatLng(latlng);
            } else {
              myLocationMarkerRef.current = L.circleMarker(latlng, {
                radius: 8,
                color: "#2e6853",
                fillColor: "#2e6853",
                fillOpacity: 0.85,
                weight: 2,
                interactive: true,
              }).addTo(mapInstanceRef.current);
            }
          },
          () => alert("לא הצלחנו לקבל את המיקום שלך"),
        );
      },
      getMap: () => mapInstanceRef.current,
    };
    registerApi(api);
    return () => registerApi(null);
    // refreshMarkerIcon closes over the latest visitedSet via the
    // module-scope `visitedSet` variable; intentionally fire-once on
    // mount so we don't tear down + re-register the parent's API
    // every time the visited list changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [registerApi]);

  // Initialize the map once
  useEffect(() => {
    if (!mapRef.current || mapInstanceRef.current) return;

    mapInstanceRef.current = L.map(mapRef.current, { zoomControl: true }).setView(
      // Default view — Jerusalem at zoom 8 so the whole country fits
      // comfortably on mobile. Previously [31.5, 34.8] (off-coast of
      // Ashdod) which on narrow viewports panned the camera enough to
      // show the Sinai / Saudi border instead of Israel proper.
      [31.7683, 35.2137],
      8,
    );
    L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
    }).addTo(mapInstanceRef.current);

    // Cluster group for markers — docs/archive/MAP_IMPROVEMENTS.md #4
    clusterGroupRef.current = L.markerClusterGroup({
      chunkedLoading: true,
      showCoverageOnHover: false,
      maxClusterRadius: 60,
      iconCreateFunction: (cluster) => {
        const count = cluster.getChildCount();
        return L.divIcon({
          html: `
            <div style="
              background:#2e6853;color:#fff;border-radius:50%;
              width:40px;height:40px;display:flex;align-items:center;
              justify-content:center;font-family:'DM Sans',sans-serif;
              font-size:13px;font-weight:600;border:2px solid #fff;
              box-shadow:0 2px 10px rgba(46,104,83,0.35);
            ">${count}</div>`,
          className: "mehamakor-cluster",
          iconSize: [40, 40],
        });
      },
    });
    mapInstanceRef.current.addLayer(clusterGroupRef.current);

    const fireBounds = () => {
      if (!mapInstanceRef.current) return;
      const b = mapInstanceRef.current.getBounds();
      const bounds = {
        north: b.getNorth(),
        south: b.getSouth(),
        east: b.getEast(),
        west: b.getWest(),
      };
      onBoundsChangeRef.current?.(bounds);
    };

    // Fire once on mount so the grid below matches initial view
    mapInstanceRef.current.whenReady(fireBounds);

    mapInstanceRef.current.on("moveend", () => {
      fireBounds();
      // docs/archive/MAP_IMPROVEMENTS.md #1 — notify parent that the user moved the
      // map so it can show "search this area". Suppress for our own
      // flyTo/fitBounds calls (initial fit, focusProducer, my-location).
      if (programmaticMoveRef.current) {
        programmaticMoveRef.current = false;
        return;
      }
      onMapMoveRef.current?.();
    });

    // MEH-30 follow-up: Leaflet reads the container height once on
    // `L.map()` init. If the parent was 0px at that exact moment (e.g.
    // sticky layout above hadn't stabilized, iOS Safari URL bar was
    // still shrinking the viewport, a parent used grid/flex that
    // resolved later), Leaflet happily renders the map at 0–60px and
    // never recomputes. Force a resize pass once the first frame
    // settles + on any subsequent container resize.
    const scheduleInvalidate = () => {
      if (!mapInstanceRef.current) return;
      requestAnimationFrame(() => mapInstanceRef.current?.invalidateSize());
    };
    scheduleInvalidate();
    setTimeout(scheduleInvalidate, 150);
    setTimeout(scheduleInvalidate, 500);
    let resizeObserver = null;
    if (typeof ResizeObserver !== "undefined" && mapRef.current) {
      resizeObserver = new ResizeObserver(scheduleInvalidate);
      resizeObserver.observe(mapRef.current);
    }

    return () => {
      if (resizeObserver) resizeObserver.disconnect();
      if (mapInstanceRef.current) {
        mapInstanceRef.current.remove();
        mapInstanceRef.current = null;
        clusterGroupRef.current = null;
        myLocationMarkerRef.current = null;
        hasFitBoundsRef.current = false;
      }
    };
  }, []);

  // Re-render markers when producers change
  useEffect(() => {
    if (!mapInstanceRef.current || !clusterGroupRef.current) return;

    // Clear existing markers from the cluster layer
    clusterGroupRef.current.clearLayers();
    markersRef.current = new Map();

    // Defensive: guard against null/empty producers (#10)
    if (!Array.isArray(producers) || producers.length === 0) return;

    producers.forEach((p) => {
      // docs/archive/MAP_IMPROVEMENTS.md #10 — defensive null checks:
      // skip producers without coordinates or identifying data
      if (!p || typeof p.lat !== "number" || typeof p.lng !== "number") return;
      if (!p.id) return;

      const marker = L.marker([p.lat, p.lng], {
        icon: createCategoryMarker(p, {
          active: false,
          hovered: false,
          visited: visitedSet.has(p.id),
        }),
        // MEH-30 #8: no Leaflet tooltip or popup. Marker click opens the
        // bottom sheet in MapClient.jsx (via onProducerClickRef). Hover
        // syncs with card highlight — it is NOT a tooltip.
        alt: p.name || "עסק",
        title: p.name || "עסק",
        keyboard: true,
      });

      marker.on("click", () => onProducerClickRef.current?.(p));
      marker.on("mouseover", () => onProducerHoverRef.current?.(p.id));
      marker.on("mouseout", () => onProducerHoverRef.current?.(null));

      clusterGroupRef.current.addLayer(marker);
      markersRef.current.set(p.id, { marker, producer: p });
    });

    // MAP_IMPROVEMENTS #11 — fit bounds to actual producers on first load.
    // The default view ([31.5, 34.8] zoom 8) is the whole country, which
    // leaves most users staring at empty ocean. Fit once when data first
    // arrives; don't re-fit on subsequent filter changes so the user's
    // panning isn't yanked back. Guarded by programmaticMoveRef so the
    // resulting moveend doesn't pop the "search this area" banner.
    if (!hasFitBoundsRef.current && markersRef.current.size > 0) {
      const latlngs = Array.from(markersRef.current.values()).map((entry) =>
        entry.marker.getLatLng(),
      );
      const bounds = L.latLngBounds(latlngs);
      if (bounds.isValid()) {
        programmaticMoveRef.current = true;
        mapInstanceRef.current.fitBounds(bounds, {
          padding: [40, 40],
          maxZoom: 12,
        });
      }
      hasFitBoundsRef.current = true;
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [producers, visitedIds]);

  return (
    <div ref={mapRef} className="w-full h-full min-h-[500px] rounded-[16px]" />
  );
}
