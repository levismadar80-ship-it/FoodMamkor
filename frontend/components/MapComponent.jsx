"use client";

import { useEffect, useRef } from "react";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import "leaflet.markercluster";
import "leaflet.markercluster/dist/MarkerCluster.css";
import "leaflet.markercluster/dist/MarkerCluster.Default.css";
import { styleForProducer } from "@/lib/map-categories";
import { showToast } from "@/lib/toast";
import { CoordSchema } from "@/lib/schemas";

// Prevent Leaflet's default PNG icon from ever being used. In webpack/Next.js
// environments, _getIconUrl constructs broken paths that 404 and show orange
// triangles. We use L.divIcon for every marker so this is purely a safety net.
delete L.Icon.Default.prototype._getIconUrl;
L.Icon.Default.mergeOptions({ iconUrl: "", iconRetinaUrl: "", shadowUrl: "" });

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

/**
 * MEH-58 Phase 1 — custom SVG pin marker.
 *
 * Anatomy (default 32×40):
 *   - Teardrop body: fill #2e6853
 *   - White disc Ø26px centered in the body
 *   - Category emoji 13px centered in the disc
 *   - Premium ring: stroke #8B6914 2px around disc when plan=premium
 *   - Verified ✓ badge: 9px white circle bottom-right when is_verified
 *
 * States:
 *   default  → 32×40
 *   selected → 44×54, white ring around the teardrop
 *   visited  → opacity 0.4, body fill #7aa298
 *   hover    → scale(1.15) via CSS transition (desktop only)
 */
function createCategoryMarker(
  producer,
  { active = false, hovered = false, visited = false } = {},
) {
  const { emoji } = styleForProducer(producer);
  const selected = active;
  const w = selected ? 52 : 44;
  const h = selected ? 65 : 55;
  const dimmed = visited && !selected && !hovered;
  const bodyFill = dimmed ? "#7aa298" : "#2e6853";
  const opacity = dimmed ? 0.4 : 1;
  const isPremium = producer.plan === "premium";
  const isVerified = producer.is_verified;

  const discR = selected ? 19 : 18;
  const discCx = w / 2;
  const discCy = selected ? 26 : 22;
  const emojiSize = selected ? 20 : 17;

  const svg = `
<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}">
  <!-- teardrop body -->
  <path d="M${w / 2} ${h} C${w / 2} ${h} 0 ${h * 0.55} 0 ${h * 0.38}
    A${w / 2} ${w / 2} 0 1 1 ${w} ${h * 0.38}
    C${w} ${h * 0.55} ${w / 2} ${h} ${w / 2} ${h}Z"
    fill="${bodyFill}" />
  ${selected ? `<path d="M${w / 2} ${h} C${w / 2} ${h} 0 ${h * 0.55} 0 ${h * 0.38}
    A${w / 2} ${w / 2} 0 1 1 ${w} ${h * 0.38}
    C${w} ${h * 0.55} ${w / 2} ${h} ${w / 2} ${h}Z"
    fill="none" stroke="white" stroke-width="3" />` : ""}
  <!-- white disc -->
  <circle cx="${discCx}" cy="${discCy}" r="${discR}" fill="white" />
  ${isPremium ? `<circle cx="${discCx}" cy="${discCy}" r="${discR}" fill="none" stroke="#8B6914" stroke-width="2" />` : ""}
  <!-- emoji via SVG text — avoids foreignObject innerHTML parsing quirks that
       cause the entire divIcon to throw and fall back to the default PNG icon -->
  <text x="${discCx}" y="${discCy}" text-anchor="middle" dominant-baseline="central"
        font-size="${emojiSize}" font-family="Apple Color Emoji,Segoe UI Emoji,Noto Color Emoji,sans-serif">${emoji}</text>
  ${isVerified ? `
  <circle cx="${discCx + discR * 0.7}" cy="${discCy + discR * 0.7}" r="5.5" fill="#2e6853" stroke="white" stroke-width="1" />
  <text x="${discCx + discR * 0.7}" y="${discCy + discR * 0.7 + 3}" text-anchor="middle" fill="white" font-size="7" font-weight="bold">✓</text>
  ` : ""}
</svg>`;

  const wrapper = `
    <div class="mehamakor-marker ${selected ? "selected" : ""} ${hovered ? "hovered" : ""} ${dimmed ? "visited" : ""}"
         style="opacity:${opacity};transition:transform 0.15s ease-out,opacity 0.15s ease-out;${hovered && !selected ? "transform:scale(1.15);" : ""}">
      ${svg}
    </div>`;

  return L.divIcon({
    html: wrapper,
    className: "mehamakor-marker-wrap",
    iconSize: [w, h],
    iconAnchor: [w / 2, h],
    // popupAnchor removed — marker click goes to bottom sheet, not a Leaflet popup
  });
}

export default function MapComponent({
  producers = [],
  onProducerClick,
  onProducerHover,
  onBoundsChange,
  onMapMove,
  onMapCanvasClick,
  registerApi,
  // Caller-owned ref that receives the live Leaflet map instance. Used by
  // MapClient to call getBounds() directly without going through the API
  // abstraction. Both desktop + mobile MapComponents set this; the VISIBLE
  // one wins because the hidden container produces degenerate bounds (detected
  // in MapClient before use).
  mapRef: parentMapRef = null,
  // MEH-14: IDs of producers the user has already viewed (from
  // recently_viewed sessionStorage). These markers render dimmed.
  visitedIds = null,
}) {
  const visitedSet =
    visitedIds instanceof Set
      ? visitedIds
      : new Set(Array.isArray(visitedIds) ? visitedIds : []);
  const containerRef = useRef(null); // DOM node for L.map()
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
  const onMapCanvasClickRef = useRef(onMapCanvasClick);
  onMapCanvasClickRef.current = onMapCanvasClick;

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
        const coordCheck = CoordSchema.safeParse({ lat: latlng?.lat, lng: latlng?.lng });
        if (!coordCheck.success) return;
        // Suppress the "search this area" banner on programmatic flyTo.
        programmaticMoveRef.current = true;
        mapInstanceRef.current.flyTo([coordCheck.data.lat, coordCheck.data.lng], 14, { duration: 1.2 });
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
          () => showToast("לא הצלחנו לקבל את המיקום שלך", "error"),
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
    if (!containerRef.current || mapInstanceRef.current) return;

    mapInstanceRef.current = L.map(containerRef.current, { zoomControl: true }).setView(
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

    // MEH-58 Phase 1: cluster below zoom 11, green circle + white count.
    clusterGroupRef.current = L.markerClusterGroup({
      chunkedLoading: true,
      showCoverageOnHover: false,
      maxClusterRadius: 60,
      disableClusteringAtZoom: 11,
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

    mapInstanceRef.current.on("click", () => {
      onMapCanvasClickRef.current?.();
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
    if (typeof ResizeObserver !== "undefined" && containerRef.current) {
      resizeObserver = new ResizeObserver(scheduleInvalidate);
      resizeObserver.observe(containerRef.current);
    }
    // Expose the Leaflet instance to the caller-owned ref AFTER the map is
    // fully set up so getBounds() returns a real viewport.
    if (parentMapRef) parentMapRef.current = mapInstanceRef.current;

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
      if (!p || typeof p.lat !== "number" || typeof p.lng !== "number" || isNaN(p.lat) || isNaN(p.lng)) return;
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

    // MEH-58 QA: removed auto-fitBounds that overrode the initial center
    // [31.7683, 35.2137] zoom 8 (full-country view). The fitBounds was
    // centering on wherever the producers clustered (often northern Israel
    // when test data was sparse), making the map look off-center on load.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [producers, visitedIds]);

  return (
    <div ref={containerRef} className="w-full h-full min-h-[500px] rounded-[16px]" />
  );
}
