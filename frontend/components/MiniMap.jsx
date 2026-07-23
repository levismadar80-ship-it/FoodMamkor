"use client";

import { useEffect, useId } from "react";
import { MapContainer, TileLayer, Marker, useMap } from "react-leaflet";
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

// MEH-1334 chunk 3: real brand glyphs from the approved design bundle —
// resolves the MEH-1305 B fallback (Phosphor MapPin) now that a clean inline
// SVG source exists. Brand-lock (mockup RTL notes): the logos are NOT
// mirrored and NOT recolored.
function WazeGlyph() {
  return (
    <svg viewBox="0 0 24 24" width="19" height="19" aria-hidden="true">
      <path
        fill="#33CCFF"
        d="M12 2C6.5 2 2 6.3 2 11.6c0 2.9 1.4 5.5 3.6 7.2-.2.5-.6 1.1-1.3 1.6-.4.3-.3.9.2 1 1.7.4 3.4.1 4.7-.6.9.2 1.8.3 2.8.3 5.5 0 10-4.3 10-9.5S17.5 2 12 2z"
      />
      <circle cx="9" cy="10" r="1.3" fill="#1C1A17" />
      <circle cx="15" cy="10" r="1.3" fill="#1C1A17" />
      <path
        d="M8.5 13.5c.8 1.5 2 2.3 3.5 2.3s2.7-.8 3.5-2.3"
        fill="none"
        stroke="#1C1A17"
        strokeWidth="1.4"
        strokeLinecap="round"
      />
    </svg>
  );
}

function GoogleMapsGlyph() {
  // clipPath id must be unique per mount (useId) — duplicate SVG ids break
  // the clip when the component ever renders twice on one page.
  const clipId = useId();
  return (
    <svg viewBox="0 0 24 34" width="14" height="19" aria-hidden="true">
      <defs>
        <clipPath id={clipId}>
          <path d="M12 0C5.4 0 0 5.4 0 12c0 8.5 12 22 12 22s12-13.5 12-22C24 5.4 18.6 0 12 0z" />
        </clipPath>
      </defs>
      <g clipPath={`url(#${clipId})`}>
        <rect x="-2" y="-2" width="28" height="38" fill="#34A853" />
        <polygon fill="#FBBC04" points="-2,10 26,-8 26,4 -2,24" />
        <polygon fill="#EA4335" points="-2,-2 13,-2 -2,15" />
        <polygon fill="#4285F4" points="7,-2 26,-2 26,10 13,5" />
      </g>
      <circle cx="12" cy="11" r="4.2" fill="#fff" />
    </svg>
  );
}

/**
 * Static mini map + Waze / Google navigation buttons.
 *
 * MEH-1334 chunk 3: no longer renders its own <section>/heading — it lives
 * inside the merged "הגעה ומיקום" location section (ProducerSections owns
 * the heading and the address line). Deep links unchanged: Waze universal
 * link (NOT waze://) + Google dir API (revision-1 #9).
 */
export default function MiniMap({ lat, lng, name }) {
  const t = useTranslations("map.mini");

  const hasCoords = lat != null && lng != null && !isNaN(Number(lat)) && !isNaN(Number(lng));
  const wazeUrl = `https://waze.com/ul?ll=${lat},${lng}&navigate=yes`;
  const gmapsUrl = `https://www.google.com/maps/dir/?api=1&destination=${lat},${lng}`;

  if (!hasCoords) return null;

  return (
    <div>
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

      {/* Navigation — brand pill buttons (mockup .navbtn anatomy). MEH-1233 B5:
          Waze next to Google on ALL viewports. Accessible names keep the full
          "open in …" purpose via aria-label (WCAG 2.4.6). */}
      <div className="flex gap-3 mt-3">
        <a
          href={wazeUrl}
          target="_blank"
          rel="noopener noreferrer"
          aria-label={t("open_in_waze_aria")}
          className="flex-1 flex items-center justify-center gap-2 border border-border bg-white text-text px-4 py-2 min-h-[44px] rounded-full text-sm font-medium hover:bg-green-50 transition focus-visible:ring-2 focus-visible:ring-primary/40"
        >
          <WazeGlyph />
          {t("open_in_waze")}
        </a>
        <a
          href={gmapsUrl}
          target="_blank"
          rel="noopener noreferrer"
          aria-label={t("open_in_google_aria")}
          className="flex-1 flex items-center justify-center gap-2 border border-border bg-white text-text px-4 py-2 min-h-[44px] rounded-full text-sm font-medium hover:bg-green-50 transition focus-visible:ring-2 focus-visible:ring-primary/40"
        >
          <GoogleMapsGlyph />
          {t("open_in_google")}
        </a>
      </div>
    </div>
  );
}
