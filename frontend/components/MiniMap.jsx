"use client";

import { useEffect, useState } from "react";
import { MapContainer, TileLayer, Marker, useMap } from "react-leaflet";
import { NavigationArrow } from "@phosphor-icons/react";
import { useTranslations } from "next-intl";
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
  const t = useTranslations("map.mini");
  const [isMobile, setIsMobile] = useState(false);
  useEffect(() => {
    setIsMobile(/Android|iPhone|iPad|iPod/i.test(navigator.userAgent));
  }, []);

  const hasCoords = lat != null && lng != null && !isNaN(Number(lat)) && !isNaN(Number(lng));
  const wazeUrl = `https://waze.com/ul?ll=${lat},${lng}&navigate=yes`;
  const gmapsUrl = `https://www.google.com/maps/dir/?api=1&destination=${lat},${lng}`;

  return (
    <section className="mt-8 border-t border-border pt-8">
      <h2 className="font-headline-md text-2xl font-bold text-text mb-4">{t("default_label")}</h2>
      {hasCoords && (
        <div className="rounded-lg overflow-hidden border border-border" style={{ height: 300 }}>
          <MapContainer
            key={`${lat}-${lng}`}
            center={[Number(lat), Number(lng)]}
            zoom={14}
            style={{ height: "100%", width: "100%" }}
            zoomControl={false}
            attributionControl={false}
          >
            <TileLayer
              url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
              attribution='© OpenStreetMap contributors'
            />
            <Marker position={[Number(lat), Number(lng)]} title={name} />
            <DisableInteraction />
          </MapContainer>
        </div>
      )}

      {/* Navigation buttons — only when coordinates are valid */}
      {hasCoords && (
        <div className="flex gap-3 mt-3">
          {isMobile && (
            <a
              href={wazeUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-1.5 border border-text text-text px-4 py-2 rounded-sm text-sm hover:bg-green-50 transition"
            >
              <NavigationArrow size={16} weight="regular" aria-hidden="true" />
              {t("open_in_waze")}-Waze
            </a>
          )}
          <a
            href={gmapsUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-1.5 border border-text text-text px-4 py-2 rounded-sm text-sm hover:bg-green-50 transition"
          >
            <NavigationArrow size={16} weight="regular" aria-hidden="true" />
            {t("open_in_google")}-Google Maps
          </a>
        </div>
      )}
    </section>
  );
}
