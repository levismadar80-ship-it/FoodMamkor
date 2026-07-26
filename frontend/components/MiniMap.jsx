"use client";

import { useEffect, useId, useMemo } from "react";
import { MapContainer, TileLayer, Marker, Tooltip, useMap } from "react-leaflet";
import { useTranslations } from "next-intl";
import "leaflet/dist/leaflet.css";
import L from "leaflet";
import { CoordSchema } from "@/lib/schemas";
import { styleForProducer } from "@/lib/category-registry";
import { categoryGlyphSvg } from "@/lib/marker-glyph";

// Fix Leaflet's broken default icon paths in Next.js/webpack builds
delete L.Icon.Default.prototype._getIconUrl;
L.Icon.Default.mergeOptions({
  iconUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png",
  iconRetinaUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png",
  shadowUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png",
});

// MEH-1611 chunk 2: the business's OWN points, rendered on its own page.
//
// This is the store-locator half of the ticket. /map is a discovery surface, so
// there a selected business only DEMOTES its neighbours (chunk 1) — the full
// isolation lives here, on the entity page, where "only this business" is the
// correct and expected answer. Foreign pins are impossible by construction:
// the component is handed one producer's `locations[]` and never fetches.
const SINGLE_POINT_ZOOM = 14;
const FIT_MAX_ZOOM = 15;
const FIT_PADDING_PX = 28;
const PRIMARY_PIN_PX = 32;
const SECONDARY_PIN_PX = 24;

// pickup / market_stand are the business's satellite points; a branch (and any
// unknown kind) is the business itself. Same split as the /map fan-out
// (MEH-1412) so a pin means the same thing on both surfaces.
function isSecondaryKind(kind) {
  return kind === "pickup" || kind === "market_stand";
}

// REUSES: frontend/components/MapComponent.jsx:94-306 — same visual language
// (category colour + glyph from styleForProducer, filled circle for the
// business, hollow ring for a satellite point) built from the same shared
// primitives. Deliberately NOT imported from there: MapComponent pulls in
// leaflet.markercluster + its CSS, and a business page must not ship the whole
// clustering engine to draw ten static pins. The selection/hover/visited states
// are dropped too — nothing on this map is selectable.
// Inline hex is the documented Leaflet divIcon exception (raw HTML string, no
// Tailwind): #fff = surface.
function locationIcon(location, producer) {
  const secondary = isSecondaryKind(location?.kind);
  const { color, icon: GlyphIcon } = styleForProducer(producer);
  const size = secondary ? SECONDARY_PIN_PX : PRIMARY_PIN_PX;
  const inner = secondary
    ? categoryGlyphSvg(GlyphIcon, { color, weight: "regular", size: 13 })
    : categoryGlyphSvg(GlyphIcon);
  const html = `
    <div style="
      width:${size}px;height:${size}px;border-radius:50%;
      background:${secondary ? "#fff" : color};
      border:2px solid ${secondary ? color : "#fff"};
      box-shadow:0 1px 5px rgba(0,0,0,0.2);
      display:flex;align-items:center;justify-content:center;
    ">${inner}</div>`;
  return L.divIcon({
    html,
    className: `mehamakor-minimap-pin${secondary ? " mehamakor-minimap-pin-secondary" : ""}`,
    iconSize: [size, size],
    iconAnchor: [size / 2, size / 2],
  });
}

// The producer's own lat/lng mirror, when it is usable. Kept as a named helper
// so the branch count lives here rather than inflating the component.
function isUsableCoord(lat, lng) {
  return (
    lat != null && lng != null && !Number.isNaN(Number(lat)) && !Number.isNaN(Number(lng))
  );
}

// Rule 19: coordinates are Zod-checked before they reach any Leaflet call, so a
// single malformed row can never NaN the whole viewport — it is dropped and the
// remaining points still frame correctly.
function toUsablePoints(locations) {
  if (!Array.isArray(locations)) return [];
  return locations
    .map((loc) => {
      const check = CoordSchema.safeParse({ lat: loc?.lat, lng: loc?.lng });
      return check.success ? { ...loc, lat: check.data.lat, lng: check.data.lng } : null;
    })
    .filter(Boolean);
}

// Frame every point the business has. lat/lng here are geographic values, not
// layout directions — the RTL logical-property rule does not apply (documented
// exception, .claude/rules/rtl.md "Map geographic controls").
function FitToPoints({ points }) {
  const map = useMap();
  useEffect(() => {
    if (points.length === 0) return;
    if (points.length === 1) {
      map.setView([points[0].lat, points[0].lng], SINGLE_POINT_ZOOM);
      return;
    }
    map.fitBounds(
      points.map((point) => [point.lat, point.lng]),
      { padding: [FIT_PADDING_PX, FIT_PADDING_PX], maxZoom: FIT_MAX_ZOOM },
    );
  }, [map, points]);
  return null;
}

// One pin per point, with its label (and opening hours when the row carries
// them). The tooltip is hover-only, which is a desktop affordance — the
// authoritative, tap-reachable version of the same information is the pickup
// list DeliveryBlock renders in text directly beside this map (MEH-1512), so
// nothing here is reachable only by hovering.
function LocationPins({ points, producer, fallbackLabel }) {
  return points.map((location, index) => {
    const label = location.label || fallbackLabel;
    return (
      <Marker
        key={location.id ?? `${location.lat}-${location.lng}-${index}`}
        position={[location.lat, location.lng]}
        icon={locationIcon(location, producer)}
        title={label}
        alt={label}
      >
        <Tooltip>
          <span className="font-medium">{label}</span>
          {location.opening_hours && (
            <>
              <br />
              <span>{location.opening_hours}</span>
            </>
          )}
        </Tooltip>
      </Marker>
    );
  });
}

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
export default function MiniMap({ lat, lng, name, locations, producer = null }) {
  const t = useTranslations("map.mini");

  // MEH-1611: every usable point the business owns. Memoised so FitToPoints'
  // effect keys on the data, not on a fresh array identity each render.
  const points = useMemo(() => toUsablePoints(locations), [locations]);

  const hasCoords = isUsableCoord(lat, lng);

  // Absent from the DOM entirely when there is nothing to show — no empty map,
  // no placeholder. A business with points but no lat/lng mirror still renders
  // (the points are the content); only "no coordinates anywhere" bails. This
  // guard runs BEFORE the camera/nav target below, which dereferences a point.
  if (!hasCoords && points.length === 0) return null;

  // Initial camera + navigation target. Prefer the producer's own lat/lng
  // mirror so /events, /experiences and every existing producer page keep the
  // exact target they have today; fall back to the primary point (then the
  // first) only for a business that has points but no mirror. FitToPoints
  // re-frames straight after mount when there is more than one point.
  const primaryPoint = points.find((point) => point.is_primary) ?? points[0] ?? null;
  const centerPoint = hasCoords ? { lat: Number(lat), lng: Number(lng) } : primaryPoint;
  const wazeUrl = `https://waze.com/ul?ll=${centerPoint.lat},${centerPoint.lng}&navigate=yes`;
  const gmapsUrl = `https://www.google.com/maps/dir/?api=1&destination=${centerPoint.lat},${centerPoint.lng}`;

  return (
    <div>
      <div className="rounded-lg overflow-hidden border border-border" style={{ height: 300 }}>
        <MapContainer
          key={`${lat}-${lng}-${points.length}`}
          center={[Number(centerPoint.lat), Number(centerPoint.lng)]}
          zoom={SINGLE_POINT_ZOOM}
          style={{ height: "100%", width: "100%" }}
          zoomControl={false}
          attributionControl={false}
        >
          <TileLayer
            url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
            attribution='© OpenStreetMap contributors'
          />
          {/* MEH-1611: one pin per point of THIS business — branch → filled
              category pin, pickup / market_stand → hollow outline. When the
              business has no locations[] rows we keep the original single
              default-icon marker, so /events and /experiences (which pass no
              locations at all) render exactly as before. */}
          {points.length > 0 ? (
            <LocationPins points={points} producer={producer} fallbackLabel={name || t("default_label")} />
          ) : (
            <Marker position={[Number(lat), Number(lng)]} title={name} />
          )}
          <FitToPoints points={points} />
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
