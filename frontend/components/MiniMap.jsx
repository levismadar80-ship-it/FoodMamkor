"use client";

import { useCallback, useEffect, useId, useMemo, useRef, useState } from "react";
import { MapContainer, TileLayer, Marker, Tooltip, useMap } from "react-leaflet";
import { useTranslations } from "next-intl";
import { ArrowsOut, X } from "@phosphor-icons/react";
import "leaflet/dist/leaflet.css";
import L from "leaflet";
import { CoordSchema } from "@/lib/schemas";
import { styleForProducer } from "@/lib/category-registry";
import { categoryGlyphSvg } from "@/lib/marker-glyph";
import { useFocusReturn } from "@/lib/use-focus-return";

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

// MEH-1659 — the expand (inline) and close (overlay) buttons share the map's
// control layer, and its geometry is PHYSICAL: Leaflet pins its +/− control to
// the container's top-LEFT in both directions, and react-leaflet exposes no
// logical position for it. A logical `start-*` button would therefore sit on
// top of +/− in `/en` (dir="ltr", app/[locale]/layout.js:189) and a logical
// `end-*` one would do the same in Hebrew — a physical side is the only value
// that clears the control in BOTH locales. This is the documented
// "Map geographic controls" exception in .claude/rules/rtl.md.
//
// In Hebrew (the primary surface) physical-right IS the inline start, so the
// expand button lands at top-start exactly as specced. The close button uses
// the same corner rather than the opposite one: it is where the finger already
// went to open the overlay, and top-end there is the +/− corner.
const MAP_BUTTON_POSITION = "absolute top-3 right-3"; // rtl-ok: map control layer, see above
const MAP_BUTTON_STYLE =
  "z-[1000] flex h-11 w-11 items-center justify-center rounded-full border border-border bg-white text-primary shadow-md transition hover:bg-green-50 focus-visible:ring-2 focus-visible:ring-primary/40";

// pickup / market_stand are the business's satellite points; a branch (and any
// unknown kind) is the business itself. Same split as the /map fan-out
// (MEH-1412) so a pin means the same thing on both surfaces.
function isSecondaryKind(kind) {
  return kind === "pickup" || kind === "market_stand";
}

// MEH-1682 — an unparameterised Tooltip inherits Leaflet's `direction: 'auto'`,
// which chooses a horizontal side by comparing the marker's container x against
// the map centre. Under `html { direction: rtl }` (globals.css) that
// computation is wrong upstream: the tooltip renders detached beside the pin,
// with a lateral gap and no arrow touching anything. Leaflet #7201 — open since
// 2020, still present in the 1.9.4 we ship. Pinning an explicit VERTICAL
// direction sidesteps the horizontal decision entirely, which is both the
// upstream workaround and the pattern already in this repo.
// REUSES: frontend/components/HomepageMiniMap.jsx:262 — same `direction="top"`
// + negative-y offset idiom.
//
// That file is NOT a bug-free control group, though it was read as one: the
// lateral half of this bug is a CSS-origin problem on `.leaflet-tooltip`
// itself (see globals.css, MEH-1682), so it displaced the homepage tooltips by
// their own width too. It escaped only the VERTICAL half, because it already
// pinned a direction. The globals.css rule fixes both surfaces at once; this
// prop pair is what stops THIS map from also picking a broken horizontal side.
// Derived from the shared class + shared mechanism — not measured on the
// homepage, whose map would not render under the sandbox's API mocks.
//
// The offset is what keeps the tooltip OFF the pin rather than on top of it:
// iconAnchor is the pin's CENTRE (locationIcon() below), so the tooltip has to
// rise by half the pin plus a small breath. Two pin sizes → two offsets; using
// one value for both would bury the tooltip inside the 32px primary pin.
const TOOLTIP_GAP_PX = 2;
const PRIMARY_TOOLTIP_OFFSET_Y = -(PRIMARY_PIN_PX / 2 + TOOLTIP_GAP_PX);
const SECONDARY_TOOLTIP_OFFSET_Y = -(SECONDARY_PIN_PX / 2 + TOOLTIP_GAP_PX);

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
function FitToPoints({ points, zoom }) {
  const map = useMap();
  useEffect(() => {
    if (points.length === 0) return;
    if (points.length === 1) {
      map.setView([points[0].lat, points[0].lng], zoom);
      return;
    }
    map.fitBounds(
      points.map((point) => [point.lat, point.lng]),
      { padding: [FIT_PADDING_PX, FIT_PADDING_PX], maxZoom: FIT_MAX_ZOOM },
    );
  }, [map, points, zoom]);
  return null;
}

// One pin per point, with its label (and opening hours when the row carries
// them). The tooltip is hover-only, which is a desktop affordance — the
// authoritative, tap-reachable version of the same information is the pickup
// list DeliveryBlock renders in text directly beside this map (MEH-1512), so
// nothing here is reachable only by hovering.
function LocationPins({ points, producer, fallbackLabel, onExpand }) {
  return points.map((location, index) => {
    const label = location.label || fallbackLabel;
    // MEH-1682: the same split locationIcon() uses to SIZE the pin, recomputed
    // here because the tooltip's offset has to clear the pin it sits above.
    const secondary = isSecondaryKind(location.kind);
    return (
      <Marker
        key={location.id ?? `${location.lat}-${location.lng}-${index}`}
        position={[location.lat, location.lng]}
        icon={locationIcon(location, producer)}
        // MEH-1659: a pin tap expands, same as a tap on the canvas. Leaflet
        // delivers a marker click to the MARKER and not to the map, so the
        // canvas handler below cannot cover this case (same split as
        // HomepageMiniMap.jsx:253-260). `undefined` in the overlay, where the
        // pins are already at their destination.
        eventHandlers={onExpand ? { click: onExpand } : undefined}
        // MEH-1619: `title` only. An `alt` here would be type-valid and inert:
        // Leaflet applies it ONLY when the icon element is an <img>
        // (`if (icon.tagName === 'IMG') { icon.alt = options.alt || '' }`,
        // leaflet-src.js:7907-7909), and a divIcon renders a <div>. Measured on
        // the live page: the pin element is a DIV with no alt attribute at all.
        // `title` is applied to any element (:7903) — measured present.
        title={label}
      >
        <Tooltip
          direction="top"
          offset={[0, secondary ? SECONDARY_TOOLTIP_OFFSET_Y : PRIMARY_TOOLTIP_OFFSET_Y]}
        >
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

// MEH-1659: the inline preview and the fullscreen overlay are the SAME map with
// opposite gesture policies, so one component owns both states rather than a
// disable-only helper plus an implicit "whatever Leaflet defaults to".
//
// Inline (`interactive={false}`): every gesture off, so a swipe that starts on
// the map scrolls the PAGE — no scroll-trap inside a 300px box. Zoom is still
// reachable there, but through the +/− control, which calls map.zoomIn() and
// does not go through any of these handlers.
// Overlay (`interactive`): everything on — that surface is the map, so a swipe
// SHOULD pan it.
//
// `tap` is listed because the old disable-list carried it; Leaflet 1.9.4 ships
// no such handler (only TapHold, leaflet-src.js:14421), so the guard below is
// what keeps that entry inert instead of a TypeError. Native `click` fires on
// touch regardless — nothing intercepts a tap.
const INTERACTION_HANDLERS = [
  "dragging",
  "touchZoom",
  "doubleClickZoom",
  "scrollWheelZoom",
  "boxZoom",
  "keyboard",
  "tap",
];

function InteractionMode({ interactive }) {
  const map = useMap();
  useEffect(() => {
    for (const name of INTERACTION_HANDLERS) {
      const handler = map[name];
      if (!handler) continue;
      if (interactive) handler.enable();
      else handler.disable();
    }
  }, [map, interactive]);
  return null;
}

// MEH-1659: a tap on the map BACKGROUND expands it. Leaflet's own controls call
// DomEvent.disableClickPropagation on their containers — zoom buttons at
// leaflet-src.js:5559-5560, attribution at :5774 — so pressing +/− or the OSM
// link never reaches this handler and never opens the overlay.
// REUSES: frontend/components/HomepageMiniMap.jsx:104-115 (same canvas-click
// idiom, different destination).
function CanvasClickToExpand({ onExpand }) {
  const map = useMap();
  useEffect(() => {
    if (!onExpand) return undefined;
    map.on("click", onExpand);
    return () => {
      map.off("click", onExpand);
    };
  }, [map, onExpand]);
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

// MEH-1659: the map itself, rendered identically inline and in the overlay —
// same tiles, same attribution, same pins, same framing. Only `interactive` and
// `onExpand` differ, so the two surfaces cannot drift into showing different
// data. `mapKey` gives the overlay its own MapContainer instance: Leaflet must
// measure a container that already has its final size, and the overlay's box
// only exists once it is open.
function MapSurface({ interactive, onExpand, mapKey, center, points, lat, lng, name, fallbackLabel, producer, zoom }) {
  return (
    <MapContainer
      key={mapKey}
      center={[Number(center.lat), Number(center.lng)]}
      zoom={zoom}
      style={{ height: "100%", width: "100%" }}
    >
      {/* MEH-1633: a falsy `attributionControl` prop used to sit on the
          container above. It DELETES the control that the sibling
          `attribution` prop below feeds — the prop stayed type-valid and
          the string stayed right here in the source, so nothing errored
          and review read the attribution as present. The rendered mini-map
          carried ZERO `.leaflet-control-attribution` elements: an ODbL /
          OSM tile-policy violation with a real tile-blocking risk.
          react-leaflet defaults the prop to true, so its ABSENCE is the
          fix — do not re-add it in any form;
          scripts/checks/map-attribution-guard.sh reds the PR if you do.
          MEH-1659: `zoomControl` is now absent for the same reason and by
          the same mechanism — its default is true, and the +/− buttons are
          the inline preview's only zoom affordance.
          The string below is byte-identical to HomepageMiniMap.jsx:236 —
          legal text, never translated.
          REUSES: frontend/components/HomepageMiniMap.jsx:233,236 */}
      <TileLayer
        url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
      />
      {/* MEH-1611: one pin per point of THIS business — branch → filled
          category pin, pickup / market_stand → hollow outline. When the
          business has no locations[] rows we keep the original single
          default-icon marker, so /events and /experiences (which pass no
          locations at all) render exactly as before. */}
      {points.length > 0 ? (
        <LocationPins
          points={points}
          producer={producer}
          fallbackLabel={fallbackLabel}
          onExpand={onExpand}
        />
      ) : (
        <Marker
          position={[Number(lat), Number(lng)]}
          title={name}
          eventHandlers={onExpand ? { click: onExpand } : undefined}
        />
      )}
      <FitToPoints points={points} zoom={zoom} />
      <InteractionMode interactive={interactive} />
      <CanvasClickToExpand onExpand={onExpand} />
    </MapContainer>
  );
}

/**
 * Static mini map + Waze / Google navigation buttons.
 *
 * MEH-1334 chunk 3: no longer renders its own <section>/heading — it lives
 * inside the merged "הגעה ומיקום" location section (ProducerSections owns
 * the heading and the address line). Deep links unchanged: Waze universal
 * link (NOT waze://) + Google dir API (revision-1 #9).
 *
 * MEH-1659: the inline map gains +/− and stops being frozen, and any tap on it
 * opens a fullscreen overlay where every gesture works. All three consumers
 * (producer / events / experiences) get this through the unchanged props API.
 */
export default function MiniMap({
  lat,
  lng,
  name,
  locations,
  producer = null,
  // MEH-1808: both default to today's behaviour, so the producer / events /
  // experiences mounts stay byte-identical — the register confirmation map is
  // the only caller that overrides either. `zoom` because a street-level
  // confirmation needs ~16 where a business page wants neighbourhood context;
  // `showNavigation` because "navigate to your own address" is meaningless in a
  // signup form. Guarded by MiniMap.test.jsx — the defaults are asserted, not
  // assumed.
  zoom = SINGLE_POINT_ZOOM,
  showNavigation = true,
}) {
  const t = useTranslations("map.mini");

  // MEH-1611: every usable point the business owns. Memoised so FitToPoints'
  // effect keys on the data, not on a fresh array identity each render.
  const points = useMemo(() => toUsablePoints(locations), [locations]);

  const hasCoords = isUsableCoord(lat, lng);

  // MEH-1659 — fullscreen overlay state. Declared BEFORE the early return
  // below: hooks may not sit behind a conditional.
  const [expanded, setExpanded] = useState(false);
  const overlayRef = useRef(null);
  const closeRef = useRef(null);
  // Stable identities — CanvasClickToExpand's effect keys on the callback, and
  // a fresh arrow each render would re-bind the Leaflet listener every time.
  const expand = useCallback(() => setExpanded(true), []);
  const collapse = useCallback(() => setExpanded(false), []);

  // Focus returns to whatever opened the overlay once it closes (WCAG 2.4.3).
  // REUSES: frontend/components/LoginPromptModal.jsx:39.
  useFocusReturn(expanded);

  // Esc + Tab-trap + body scroll lock, for as long as the overlay is open.
  // REUSES: frontend/components/LoginPromptModal.jsx:42-77 — same idiom.
  useEffect(() => {
    if (!expanded) return undefined;

    const handleKey = (event) => {
      if (event.key === "Escape") {
        collapse();
        return;
      }
      if (event.key !== "Tab") return;
      // Leaflet's own +/− links and the OSM attribution link are focusable and
      // live inside the overlay, so they are part of the loop by construction.
      const focusables = overlayRef.current?.querySelectorAll(
        'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])',
      );
      if (!focusables?.length) return;
      const first = focusables[0];
      const last = focusables[focusables.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };

    window.addEventListener("keydown", handleKey);
    closeRef.current?.focus();

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    return () => {
      window.removeEventListener("keydown", handleKey);
      document.body.style.overflow = previousOverflow;
    };
  }, [expanded, collapse]);

  // Absent from the DOM entirely when there is nothing to show — no empty map,
  // no placeholder. Runs BEFORE the camera/nav target below, which dereferences
  // a point.
  //
  // The `!hasCoords && points.length > 0` arm is defensive depth, not a live
  // path from the business page: ProducerSections gates the mount on
  // parseHasLocation() (ProducerSections.jsx:45), which requires lat/lng AND
  // has_physical_location !== false, and lat/lng is maintained as the mirror of
  // the primary location. Do NOT "fix" that gate by widening it to
  // `|| locations?.length` — it would bypass the has_physical_location check and
  // put delivery-only businesses back on a map, which is MEH-213.
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

  const surfaceProps = {
    center: centerPoint,
    points,
    lat,
    lng,
    name,
    producer,
    fallbackLabel: name || t("default_label"),
    zoom,
  };

  return (
    <div>
      <div
        className="relative rounded-lg overflow-hidden border border-border"
        style={{ height: 300 }}
      >
        <MapSurface
          {...surfaceProps}
          interactive={false}
          onExpand={expand}
          mapKey={`inline-${lat}-${lng}-${points.length}`}
        />
        <button
          type="button"
          onClick={expand}
          aria-label={t("expand_aria")}
          className={`${MAP_BUTTON_POSITION} ${MAP_BUTTON_STYLE}`}
        >
          <ArrowsOut size={22} weight="bold" aria-hidden="true" />
        </button>
      </div>

      {/* Fullscreen overlay. Mounted only while open, so its MapContainer is a
          fresh instance every time — Leaflet sizes itself against a container
          that already has its final box. z-1150 sits above the global header
          (1050) and the cookie banner (1100) and below the filter sheet
          (1200) — .claude/rules/rtl.md § Map z-index tokens. */}
      {expanded && (
        <div
          ref={overlayRef}
          role="dialog"
          aria-modal="true"
          aria-label={t("expanded_aria")}
          className="fixed inset-0 z-[1150] bg-white"
        >
          <MapSurface {...surfaceProps} interactive mapKey={`overlay-${lat}-${lng}-${points.length}`} />
          <button
            type="button"
            ref={closeRef}
            onClick={collapse}
            aria-label={t("close_aria")}
            className={`${MAP_BUTTON_POSITION} ${MAP_BUTTON_STYLE}`}
          >
            <X size={22} weight="bold" aria-hidden="true" />
          </button>
        </div>
      )}

      {/* Navigation — brand pill buttons (mockup .navbtn anatomy). MEH-1233 B5:
          Waze next to Google on ALL viewports. Accessible names keep the full
          "open in …" purpose via aria-label (WCAG 2.4.6).
          MEH-1808: `showNavigation` defaults to true, so every pre-existing
          consumer renders this block unchanged. */}
      {showNavigation && (
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
      )}
    </div>
  );
}
