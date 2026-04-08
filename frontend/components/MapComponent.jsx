"use client";

import { useEffect, useRef } from "react";
import L from "leaflet";
import "leaflet/dist/leaflet.css";

// Fix Leaflet default icon issue with bundlers
const defaultIcon = L.icon({
  iconUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png",
  iconRetinaUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png",
  shadowUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png",
  iconSize: [25, 41],
  iconAnchor: [12, 41],
  popupAnchor: [1, -34],
});

export default function MapComponent({
  producers = [],
  onProducerClick,
  onBoundsChange,
  registerApi,
}) {
  const mapRef = useRef(null);
  const mapInstanceRef = useRef(null);
  const markersRef = useRef(new Map()); // producer.id → marker
  const onBoundsChangeRef = useRef(onBoundsChange);
  onBoundsChangeRef.current = onBoundsChange;
  const onProducerClickRef = useRef(onProducerClick);
  onProducerClickRef.current = onProducerClick;

  // Expose imperative API via a callback prop — works across next/dynamic
  // which doesn't reliably forward refs in all Next versions.
  useEffect(() => {
    if (!registerApi) return;
    const api = {
      focusProducer: (producerId) => {
        const marker = markersRef.current.get(producerId);
        if (!marker || !mapInstanceRef.current) return;
        const latlng = marker.getLatLng();
        mapInstanceRef.current.flyTo(latlng, 14, { duration: 1.2 });
        setTimeout(() => marker.openPopup(), 1250);
      },
      getMap: () => mapInstanceRef.current,
    };
    registerApi(api);
    return () => registerApi(null);
  }, [registerApi]);

  useEffect(() => {
    if (!mapRef.current || mapInstanceRef.current) return;

    // Israel center
    mapInstanceRef.current = L.map(mapRef.current).setView([31.5, 34.8], 8);
    L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
    }).addTo(mapInstanceRef.current);

    const fireBounds = () => {
      if (!mapInstanceRef.current || !onBoundsChangeRef.current) return;
      const b = mapInstanceRef.current.getBounds();
      onBoundsChangeRef.current({
        north: b.getNorth(),
        south: b.getSouth(),
        east: b.getEast(),
        west: b.getWest(),
      });
    };
    mapInstanceRef.current.on("moveend", fireBounds);

    return () => {
      if (mapInstanceRef.current) {
        mapInstanceRef.current.remove();
        mapInstanceRef.current = null;
      }
    };
  }, []);

  useEffect(() => {
    if (!mapInstanceRef.current) return;

    // Clear existing markers
    markersRef.current.forEach((m) => m.remove());
    markersRef.current = new Map();

    const escapeHtml = (str) => {
      if (!str) return "";
      return str.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
    };

    producers.forEach((p) => {
      if (!p.lat || !p.lng) return;
      const href = p.slug ? `/${p.slug}` : `/producer/${p.id}`;
      const productLine =
        p.top_product_name || p.starting_price_label
          ? `<div style="margin:6px 0;font-size:13px;">
               ${p.top_product_name ? `<span style="color:#1C1A17">${escapeHtml(p.top_product_name)}</span>` : ""}
               ${p.top_product_name && p.starting_price_label ? `<span style="color:#6B6B6B"> · </span>` : ""}
               ${p.starting_price_label ? `<span style="color:#8B6914;font-weight:600">${escapeHtml(p.starting_price_label)}</span>` : ""}
             </div>`
          : "";
      const marker = L.marker([p.lat, p.lng], { icon: defaultIcon })
        .addTo(mapInstanceRef.current)
        .bindPopup(`
          <div style="text-align:right;font-family:'DM Sans',Heebo,sans-serif;min-width:200px;">
            <div style="font-family:'Frank Ruhl Libre',serif;font-weight:700;font-size:16px;color:#1C1A17;">${escapeHtml(p.name)}</div>
            <div style="color:#6B6B6B;font-size:12px;margin-top:2px;">${escapeHtml(p.city || "")}</div>
            ${productLine}
            <a href="${href}" style="display:inline-block;margin-top:8px;background:#2e6853;color:#fff;padding:6px 14px;border-radius:8px;font-size:13px;text-decoration:none;font-weight:500;">מידע נוסף ←</a>
          </div>
        `);
      marker.on("click", () => onProducerClickRef.current?.(p));
      markersRef.current.set(p.id, marker);
    });
  }, [producers]);

  const goToMyLocation = () => {
    if (!mapInstanceRef.current || !navigator.geolocation) return;
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const { latitude, longitude } = pos.coords;
        mapInstanceRef.current.setView([latitude, longitude], 13);
        L.circleMarker([latitude, longitude], {
          radius: 8,
          color: "#2e6853",
          fillColor: "#2e6853",
          fillOpacity: 0.8,
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
      <button
        onClick={goToMyLocation}
        className="absolute top-3 left-3 z-[1000] bg-white rounded-[8px] px-3 py-2 shadow-md hover:bg-light transition text-sm"
        title="המיקום שלי"
        aria-label="מרכז מפה על המיקום שלי"
      >
        📍 המיקום שלי
      </button>
    </div>
  );
}
