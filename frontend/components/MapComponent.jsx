"use client";

import { useEffect, useRef } from "react";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import "leaflet.markercluster";
import "leaflet.markercluster/dist/MarkerCluster.css";
import "leaflet.markercluster/dist/MarkerCluster.Default.css";

/**
 * MapComponent — raw-Leaflet map with custom category-colored markers
 * and clustering. Covers MAP_IMPROVEMENTS.md items #4, #5, #6, #10.
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

// MAP_IMPROVEMENTS.md #5 — category color + emoji lookup.
// Keys match category.name from the DB. Fallback to primary+leaf.
const CATEGORY_STYLES = {
  "בשר, עוף ודגים": { color: "#c04040", emoji: "🥩" },
  "ירקות, פירות ומשקים": { color: "#2e6853", emoji: "🥬" },
  "חלב וגבינות": { color: "#4a90d9", emoji: "🥛" },
  "לחמים ואפייה": { color: "#8B6914", emoji: "🍞" },
  "שמנים ודבש": { color: "#e8a020", emoji: "🫒" },
  "טיפוח וסבונים": { color: "#9b59b6", emoji: "🧴" },
};
const DEFAULT_STYLE = { color: "#2e6853", emoji: "🌿" };

function styleForProducer(producer) {
  const firstCategory = producer?.categories?.[0]?.name;
  return (firstCategory && CATEGORY_STYLES[firstCategory]) || DEFAULT_STYLE;
}

/** Create a teardrop divIcon, color + emoji by category. */
function createCategoryMarker(producer, { active = false, hovered = false } = {}) {
  const { color, emoji } = styleForProducer(producer);
  const size = active ? 44 : hovered ? 38 : 32;
  const iconOffset = active ? 22 : hovered ? 19 : 16;

  const html = `
    <div class="mehamekor-marker ${active ? "active" : ""} ${hovered ? "hovered" : ""}"
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
    className: "mehamekor-marker-wrap",
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

/** MAP_IMPROVEMENTS.md #6 — rich popup with photo, rating, and CTAs. */
function buildPopupHtml(producer) {
  const href = producer.slug ? `/${producer.slug}` : `/producer/${producer.id}`;
  const photo = producer.images?.[0];
  const cat = producer.categories?.[0];
  const phone = producer.phone
    ? producer.phone.replace(/[-\s]/g, "").replace(/^0/, "972")
    : null;
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
        mapInstanceRef.current.flyTo(latlng, 14, { duration: 1.2 });
        setTimeout(() => entry.marker.openPopup(), 1250);
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

    // Cluster group for markers — MAP_IMPROVEMENTS.md #4
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
          className: "mehamekor-cluster",
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
      // MAP_IMPROVEMENTS.md #1 — notify parent that the map moved so
      // it can show "search this area" button
      onMapMoveRef.current?.();
    });

    return () => {
      if (mapInstanceRef.current) {
        mapInstanceRef.current.remove();
        mapInstanceRef.current = null;
        clusterGroupRef.current = null;
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
      // MAP_IMPROVEMENTS.md #10 — defensive null checks:
      // skip producers without coordinates or identifying data
      if (!p || typeof p.lat !== "number" || typeof p.lng !== "number") return;
      if (!p.id) return;

      const marker = L.marker([p.lat, p.lng], {
        icon: createCategoryMarker(p, { active: false, hovered: false }),
        // MAP_IMPROVEMENTS.md #10 — set alt + title to producer name so
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
        className: "mehamekor-tooltip",
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
  }, [producers]);

  const goToMyLocation = () => {
    if (!mapInstanceRef.current || !navigator.geolocation) return;
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const { latitude, longitude } = pos.coords;
        mapInstanceRef.current.flyTo([latitude, longitude], 13, { duration: 1.2 });
        L.circleMarker([latitude, longitude], {
          radius: 8,
          color: "#2e6853",
          fillColor: "#2e6853",
          fillOpacity: 0.85,
          weight: 2,
        })
          .addTo(mapInstanceRef.current)
          .bindPopup("המיקום שלי")
          .openPopup();
      },
      () => alert("לא הצלחנו לקבל את המיקום שלך"),
    );
  };

  return (
    <div className="relative">
      <div ref={mapRef} className="w-full h-full min-h-[500px] rounded-[16px]" />
      {/* MAP_IMPROVEMENTS.md #2 — "near me" — already in place, polished
          with Phosphor-style pill and flyTo animation above. */}
      <button
        onClick={goToMyLocation}
        className="absolute bottom-6 left-4 z-[1000] bg-white rounded-[10px] px-3 py-2 shadow-md hover:bg-light transition text-sm flex items-center gap-1.5 border border-border focus-visible:ring-2 focus-visible:ring-primary/40"
        title="קרוב אלי"
        aria-label="מרכז מפה על המיקום שלי"
      >
        📍 קרוב אלי
      </button>
    </div>
  );
}
