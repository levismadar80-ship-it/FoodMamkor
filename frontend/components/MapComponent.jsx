"use client";

import { useEffect, useRef } from "react";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import "leaflet-defaulticon-compatibility/dist/leaflet-defaulticon-compatibility.css";
import "leaflet-defaulticon-compatibility";
import "leaflet.markercluster";
import "leaflet.markercluster/dist/MarkerCluster.css";
import "leaflet.markercluster/dist/MarkerCluster.Default.css";
import { useTranslations } from "next-intl";
import { optimizeCloudinary } from "@/lib/cloudinary";
import { showToast } from "@/lib/toast";
import { CoordSchema } from "@/lib/schemas";

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

// docs/archive/MAP_IMPROVEMENTS.md #5 — category color + icon lookup lives in
// lib/map-categories.js (shared with MapClient since this component is
// dynamically loaded with ssr:false).

/**
 * Circle map pin — S5 FINAL (MEH-763 Chunk 2).
 *
 * Anatomy (uniform 36px circle — identity lives in the photo, NOT a category
 * colour; category colour/icon now appear only in the legend + card dots, so the
 * "≤4 category colours, deuteranopia-safe" rule holds by construction — F2):
 *   - Round photo: producer's first image, square Cloudinary crop, lazy.
 *   - No-photo fallback: MEH-638 monogram — first name letter, white on primary.
 *   - Border: 2px primary; selected (active) → 3px primary-dark.
 *   - Verified badge: FROZEN (MEH-762 handoff) — white-on-green ✓, bottom-end.
 *   - Rings: hover → subtle primary; active → primary glow; premium → gold.
 *   - Visited: opacity 0.4 (dimmed).
 *
 * Was a category-colour circle + white Phosphor icon sized 28/32/36 by state.
 */
// Inline hex in the divIcon HTML below is required — Leaflet renders a raw HTML
// string, so Tailwind tokens can't apply. Values map to design tokens:
// #2e6853 = primary, #2E4A2E = primary-dark, #fff = surface, #8B6914 = accent.
function createCategoryMarker(
  producer,
  { active = false, hovered = false, visited = false } = {},
) {
  // S5 FINAL: all markers are uniform 36px circles; state shows via border +
  // rings, not size (drops the old 28/32/36 size jump).
  const size = 36;
  const dimmed = visited && !active && !hovered;
  const opacity = dimmed ? 0.4 : 1;
  const isPremium = producer.plan === "premium";
  const isVerified = producer.is_verified;

  // Round photo (square crop) or MEH-638 monogram fallback. No onerror→monogram
  // swap: strict CSP blocks inline handlers, so we branch on image presence.
  const imgUrl = producer.images?.[0]
    ? optimizeCloudinary(producer.images[0], { aspectRatio: "1:1" })
    : null;
  const monogram = (producer.name || "").trim().charAt(0).toUpperCase();
  const inner = imgUrl
    ? `<img src="${imgUrl}" loading="lazy" alt="" style="width:100%;height:100%;object-fit:cover;display:block;" />`
    : `<div style="width:100%;height:100%;display:flex;align-items:center;justify-content:center;background:#2e6853;color:#fff;font-family:'Frank Ruhl Libre',serif;font-weight:700;font-size:16px;line-height:1;">${monogram}</div>`;

  // Verified badge — tiny white-on-green checkmark, bottom-right.
  // pointer-events:none prevents intercepting marker clicks.
  // FROZEN (MEH-762 handoff): glyph + semantics kept byte-identical.
  const verifiedBadge = isVerified
    ? `<div style="
        position:absolute;bottom:-2px;right:-2px;z-index:1;
        width:12px;height:12px;border-radius:50%;
        background:#2e6853;border:1.5px solid #fff;
        display:flex;align-items:center;justify-content:center;
        font-size:7px;color:#fff;font-weight:700;line-height:1;
        pointer-events:none;
      ">✓</div>`
    : "";

  // Border: 2px primary default; selected (active) → 3px state-selected.
  // The hex stays inline (Leaflet divIcon = raw HTML string); #2E4A2E equals
  // the `state-selected` token (= primary-dark, MEH-763 #970) by design.
  const borderWidth = active ? 3 : 2;
  const borderColor = active ? "#2E4A2E" : "#2e6853";

  // Single box-shadow value (avoids cascade overwrite): drop shadow + state ring
  // (active glow / hover ring) + premium gold ring (6px, outside the others).
  const activeRing = active ? ",0 0 0 4px rgba(46,104,83,0.22)" : "";
  const hoverRing = hovered && !active ? ",0 0 0 3px rgba(46,104,83,0.18)" : "";
  const premiumRing = isPremium ? ",0 0 0 6px #8B6914" : "";
  const boxShadow = `0 2px 8px rgba(0,0,0,0.2)${activeRing}${hoverRing}${premiumRing}`;

  const html = `
    <div style="position:relative;width:${size}px;height:${size}px;">
      <div style="
        width:${size}px;height:${size}px;border-radius:50%;overflow:hidden;
        border:${borderWidth}px solid ${borderColor};
        box-shadow:${boxShadow};
        opacity:${opacity};
        transition:all 0.18s ease-out;
      ">
        ${inner}
      </div>
      ${verifiedBadge}
    </div>`;

  return L.divIcon({
    html,
    className: "mehamakor-marker-wrap",
    iconSize: [size, size],
    iconAnchor: [size / 2, size / 2],
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
  const t = useTranslations("map.component");
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
      goToMyLocation: (onPermissionDenied) => {
        if (!mapInstanceRef.current || !navigator.geolocation) return;
        navigator.geolocation.getCurrentPosition(
          (pos) => {
            const { latitude, longitude } = pos.coords;
            if (!latitude || !longitude || isNaN(latitude) || isNaN(longitude)) {
              showToast.error(t("geo_invalid"));
              return;
            }
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
          // PERMISSION_DENIED (err.code === 1) → hand off to MapClient so it can
          // open the city-search fallback (LocationModal) instead of a dead-end
          // toast on a map that looks empty. Technical failures (2/3) keep the toast.
          (err) => {
            if (err?.code === 1) {
              onPermissionDenied?.();
              return;
            }
            showToast.error(t("geo_failure"));
          },
        );
      },
      getMap: () => mapInstanceRef.current,
      // Used by MapClient.registerMapApi to skip hidden (0×0) containers
      // so the mobile map (display:none on desktop) never overwrites the
      // visible desktop map's API reference, and vice-versa on mobile.
      getContainer: () => containerRef.current,
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
    // Expose initial center for E2E tests (05-map-navigation.spec.ts)
    if (typeof window !== "undefined") window.__MAP_CENTER__ = [31.7683, 35.2137];
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
    // Expose the Leaflet instance to the caller-owned ref only when this
    // container is visible (non-zero size). On desktop the mobile map lives
    // inside a display:none element — let it win parentMapRef would give
    // MapClient a degenerate 0×0 Leaflet instance for getBounds() calls.
    const rect = containerRef.current?.getBoundingClientRect();
    if (parentMapRef && rect && (rect.width > 0 || rect.height > 0)) {
      parentMapRef.current = mapInstanceRef.current;
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
        alt: p.name || t("marker_singular"),
        title: p.name || t("marker_singular"),
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
    <div ref={containerRef} className="w-full h-full min-h-[500px] rounded-lg" />
  );
}
