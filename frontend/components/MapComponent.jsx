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

export default function MapComponent({ producers = [], onProducerClick }) {
  const mapRef = useRef(null);
  const mapInstanceRef = useRef(null);
  const markersRef = useRef([]);

  useEffect(() => {
    if (!mapRef.current || mapInstanceRef.current) return;

    // Israel center
    mapInstanceRef.current = L.map(mapRef.current).setView([31.5, 34.8], 8);
    L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
    }).addTo(mapInstanceRef.current);

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
    markersRef.current = [];

    const escapeHtml = (str) => {
      if (!str) return "";
      return str.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
    };

    producers.forEach((p) => {
      if (!p.lat || !p.lng) return;
      const cats = p.categories?.map((c) => `${escapeHtml(c.emoji || "")} ${escapeHtml(c.name)}`).join(", ") || "";
      const marker = L.marker([p.lat, p.lng], { icon: defaultIcon })
        .addTo(mapInstanceRef.current)
        .bindPopup(`
          <div style="text-align:right;font-family:Heebo,sans-serif;">
            <strong>${escapeHtml(p.name)}</strong><br/>
            <span style="color:#6B6B6B">${escapeHtml(p.city)}</span><br/>
            ${cats}
          </div>
        `);
      marker.on("click", () => onProducerClick?.(p));
      markersRef.current.push(marker);
    });
  }, [producers, onProducerClick]);

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
      <div ref={mapRef} className="w-full h-full min-h-[500px] rounded-[12px]" />
      <button
        onClick={goToMyLocation}
        className="absolute top-3 left-3 z-[1000] bg-white rounded-[12px] px-3 py-2 shadow-md hover:bg-gray-50 transition text-sm"
        title="המיקום שלי"
      >
        📍 המיקום שלי
      </button>
    </div>
  );
}
