"use client";

import { useEffect } from "react";
import { MapContainer, TileLayer, Marker, useMap } from "react-leaflet";
// MEH-1305 B: nav chips carry a MapPin, not a generic NavigationArrow. The
// ticket's first choice was official Waze / Google-Maps brand glyphs (documented
// exception, like the WhatsApp logo), but no clean/legal inline-SVG source is
// reachable from the CC sandbox, so it uses the ticket's PRE-APPROVED fallback:
// Phosphor MapPin for both, differentiated by the visible label (NN/g: an icon
// always pairs with a visible label).
import { MapPin } from "@phosphor-icons/react";
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
          {/* MEH-1233 B5: Waze sits next to Google on ALL viewports (was
              mobile-only, so the desktop audit saw only Google). The Israeli
              audience defaults to Waze for navigation. MEH-1305 B: labels
              shortened to the bare brand name ("Waze" / "מפות Google") — the
              repeated "פתיחה ב-" ×2 was pure bloat; the destination is obvious
              from the section. Full label lives in the i18n value. */}
          <a
            href={wazeUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-1.5 border border-text text-text px-4 py-2 min-h-[44px] rounded-sm text-sm hover:bg-green-50 transition"
          >
            <MapPin size={16} weight="regular" aria-hidden="true" />
            {t("open_in_waze")}
          </a>
          <a
            href={gmapsUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-1.5 border border-text text-text px-4 py-2 min-h-[44px] rounded-sm text-sm hover:bg-green-50 transition"
          >
            <MapPin size={16} weight="regular" aria-hidden="true" />
            {t("open_in_google")}
          </a>
        </div>
      )}
    </section>
  );
}
