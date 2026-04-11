"use client";

import { useEffect, useRef } from "react";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import "leaflet.markercluster";
import "leaflet.markercluster/dist/MarkerCluster.css";
import "leaflet.markercluster/dist/MarkerCluster.Default.css";
import { Crosshair } from "@phosphor-icons/react";
import { styleForProducer } from "@/lib/map-categories";
import { normalizePhone } from "@/lib/utils";

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

/** Create a teardrop divIcon, color + emoji by category. */
function createCategoryMarker(producer, { active = false, hovered = false } = {}) {
  const { color, emoji } = styleForProducer(producer);
  const size = active ? 44 : hovered ? 38 : 32;
  const iconOffset = active ? 22 : hovered ? 19 : 16;

  const html = `
    <div class="mehamakor-marker ${active ? "active" : ""} ${hovered ? "hovered" : ""}"
         style="
           background: ${active ? color : "white"};
           color: ${active ? "white" : color};
           border: 2px solid ${color};
           border-radius: 50% 50% 50% 0;
           transform: rotate(-45deg);
           width: ${size}px;
           height: ${size}px;
           display: flex; align-items: center; justify-content: center;
           box-shadow: 0 2px 8px rgba(0,0,0,0.2);
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

const escapeHtml = (str) => {
  if (str == null) return "";
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
};

/** docs/archive/MAP_IMPROVEMENTS.md #6 — rich popup with photo, rating, and CTAs. */
function buildPopupHtml(producer) {
  const href = producer.slug ? `/${producer.slug}` : `/producer/${producer.id}`;
  const photo = producer.images?.[0];
  const cat = producer.categories?.[0];
  // tasks_for_claude_code.md task 17: shared normalizer replaces the
  // previous inline logic that handled fewer edge cases (no parens, no
  // dots, no E.164 input). See lib/utils.js.
  const phone = normalizePhone(producer.phone) || null;
  const waUrl = phone
    ? `https://wa.me/${phone}?text=${encodeURIComponent(`היי! מצאתי אותך במהמקור — ${producer.name || ""}`)}`
    : null;

  return `
    <div style="text-align:right;font-family:'DM Sans',Heebo,sans-serif;min-width:240px;max-width:260px;direction:rtl;">
      ${
        photo
          ? `<img src="${escapeHtml(photo)}" alt="${escapeHtml(producer.name || "")}"
                 style="width:100%;height:120px;object-fit:cover;border-radius:8px;margin-bottom:10px;" />`
          : ""
      }
      <div style="font-family:'Frank Ruhl Libre',serif;font-weight:700;font-size:16px;color:#1C1A17;line-height:1.2;">
        ${escapeHtml(producer.name || "עסק")}
      </div>
      <div style="color:#6B6B6B;font-size:12px;margin-top:3px;">
        ${escapeHtml(producer.city || "")}${cat ? ` · ${escapeHtml(cat.emoji || "")} ${escapeHtml(cat.name || "")}` : ""}
      </div>
      ${
        producer.reviews_count > 0
          ? `<div style="color:#8B6914;font-size:12px;margin-top:5px;">
               ⭐ ${Number(producer.avg_rating).toFixed(1)} (${producer.reviews_count})
             </div>`
          : ""
      }
      <div style="display:flex;gap:6px;margin-top:10px;">
        <a href="${escapeHtml(href)}"
           style="flex:1;background:#2e6853;color:#fff;padding:8px;border-radius:6px;
                  text-align:center;text-decoration:none;font-size:13px;font-weight:500;">
          פרטים מלאים
        </a>
        ${
          waUrl
            ? `<a href="${escapeHtml(waUrl)}" target="_blank" rel="noopener noreferrer"
                 aria-label="שלח הודעת ווטסאפ"
                 style="background:#25D366;color:#fff;padding:8px 12px;border-radius:6px;
                        text-decoration:none;font-size:16px;line-height:1;">
                 💬
               </a>`
            : ""
        }
      </div>
    </div>
  `;
}

export default function MapComponent({
  producers = [],
  onProducerClick,
  onProducerHover,
  onBoundsChange,
  onMapMove,
  registerApi,
}) {
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

  // Refresh a single marker's icon based on active/hover state
  const refreshMarkerIcon = (id) => {
    const entry = markersRef.current.get(id);
    if (!entry) return;
    entry.marker.setIcon(
      createCategoryMarker(entry.producer, {
        active: activeIdRef.current === id,
        hovered: hoveredIdRef.current === id,
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
        // Wait for the flyTo to complete before opening the popup so
        // the popup anchors correctly to the new map center.
        mapInstanceRef.current.once("moveend", () => {
          entry.marker.openPopup();
        });
      },
      setHoveredProducer: (producerId) => {
        const prev = hoveredIdRef.current;
        if (prev === producerId) return;
        hoveredIdRef.current = producerId;
        if (prev) refreshMarkerIcon(prev);
        if (producerId) refreshMarkerIcon(producerId);
      },
      getMap: () => mapInstanceRef.current,
    };
    registerApi(api);
    return () => registerApi(null);
  }, [registerApi]);

  // Initialize the map once
  useEffect(() => {
    if (!mapRef.current || mapInstanceRef.current) return;

    mapInstanceRef.current = L.map(mapRef.current, { zoomControl: true }).setView(
      [31.5, 34.8],
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

    return () => {
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
        icon: createCategoryMarker(p, { active: false, hovered: false }),
        // docs/archive/MAP_IMPROVEMENTS.md #10 — set alt + title to producer name so
        // no "Marker" (or truncated "arker") leaks into assistive tech
        // or hover tooltips.
        alt: p.name || "עסק",
        title: p.name || "עסק",
        keyboard: true,
      });

      // Bind a Leaflet tooltip with the real name for hover feedback
      marker.bindTooltip(p.name || "עסק", {
        direction: "top",
        offset: [0, -30],
        className: "mehamakor-tooltip",
      });

      marker.bindPopup(buildPopupHtml(p), {
        maxWidth: 280,
        closeButton: true,
        autoPan: true,
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
  }, [producers]);

  // MAP_IMPROVEMENTS bug #13 — fixed: single reusable marker for "my
  // location" instead of stacking a new one per click. Previous
  // implementation called L.circleMarker().addTo() on every click
  // without ever removing prior markers, leaking DOM + visual clutter.
  const goToMyLocation = () => {
    if (!mapInstanceRef.current || !navigator.geolocation) return;
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const { latitude, longitude } = pos.coords;
        const latlng = [latitude, longitude];
        programmaticMoveRef.current = true;
        mapInstanceRef.current.flyTo(latlng, 13, { duration: 1.2 });

        // Reuse the existing marker if we already dropped one; otherwise
        // create one and cache it for next time.
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
          })
            .addTo(mapInstanceRef.current)
            .bindPopup("המיקום שלי");
        }
        myLocationMarkerRef.current.openPopup();
      },
      () => alert("לא הצלחנו לקבל את המיקום שלך"),
    );
  };

  return (
    <div className="relative">
      <div ref={mapRef} className="w-full h-full min-h-[500px] rounded-[16px]" />
      {/* docs/archive/MAP_IMPROVEMENTS.md #2 — "near me" — already in place, polished
          with Phosphor-style pill and flyTo animation above. */}
      <button
        type="button"
        onClick={goToMyLocation}
        className="absolute bottom-6 left-4 z-[1000] bg-white rounded-[10px] px-3 py-2 shadow-md hover:bg-light transition text-sm flex items-center gap-2 border border-border focus-visible:ring-2 focus-visible:ring-primary/40"
        title="קרוב אלי"
        aria-label="מרכז מפה על המיקום שלי"
      >
        <Crosshair size={16} weight="duotone" className="text-primary" aria-hidden="true" />
        קרוב אלי
      </button>
    </div>
  );
}
