"use client";

import { useEffect } from "react";
import { MapContainer, TileLayer, Marker, useMap } from "react-leaflet";
import { NavigationArrow } from "@phosphor-icons/react";
import "leaflet/dist/leaflet.css";
import L from "leaflet";

// Fix Leaflet's broken default icon paths in Next.js/webpack builds
delete L.Icon.Default.prototype._getIconUrl;
L.Icon.Default.mergeOptions({
  iconUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png",
  iconRetinaUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png",
  shadowUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png",
});

// Disable all interaction on the map (static preview)
function DisableInteraction() {
  const map = useMap();
  useEffect(() => {
    map.dragging.disable();
    map.touchZoom.disable();
    map.doubleClickZoom.disable();
    map.scrollWheelZoom.disable();
    map.boxZoom.disable();
    map.keyboard.disable();
    if (map.tap) map.tap.disable();
  }, [map]);
  return null;
}

export default function MiniMap({ lat, lng, name }) {
  const wazeUrl = `waze://ul?ll=${lat},${lng}&navigate=yes`;
  const gmapsUrl = `https://www.google.com/maps/dir/?api=1&destination=${lat},${lng}`;

  return (
    <section className="mt-8 border-t border-border pt-8">
      <h2 className="font-headline text-2xl font-bold text-site-text mb-4">מיקום</h2>
      <div className="rounded-[16px] overflow-hidden border border-border" style={{ height: 300 }}>
        <MapContainer
          center={[lat, lng]}
          zoom={14}
          style={{ height: "100%", width: "100%" }}
          zoomControl={false}
          attributionControl={false}
        >
          <TileLayer
            url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
            attribution='© OpenStreetMap contributors'
          />
          <Marker position={[lat, lng]} title={name} />
          <DisableInteraction />
        </MapContainer>
      </div>

      {/* Navigation buttons */}
      <div className="flex gap-3 mt-3">
        <a
          href={wazeUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="flex items-center gap-1.5 border border-[#1C1A17] text-site-text px-4 py-2 rounded-[6px] text-sm hover:bg-light transition"
        >
          <NavigationArrow size={16} weight="regular" aria-hidden="true" />
          פתחי ב-Waze
        </a>
        <a
          href={gmapsUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="flex items-center gap-1.5 border border-[#1C1A17] text-site-text px-4 py-2 rounded-[6px] text-sm hover:bg-light transition"
        >
          <NavigationArrow size={16} weight="regular" aria-hidden="true" />
          פתחי ב-Google Maps
        </a>
      </div>
    </section>
  );
}
