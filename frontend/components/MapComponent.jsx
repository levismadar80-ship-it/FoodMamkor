"use client";

import { useEffect, useRef } from "react";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import "leaflet-defaulticon-compatibility/dist/leaflet-defaulticon-compatibility.css";
import "leaflet-defaulticon-compatibility";
import "leaflet.markercluster";
import "leaflet.markercluster/dist/MarkerCluster.css";
import "leaflet.markercluster/dist/MarkerCluster.Default.css";
import { useTranslations } from "next-intl";
import { optimizeCloudinary, IMAGE_RATIOS } from "@/lib/cloudinary";
import { showToast } from "@/lib/toast";
import { setUserLocation } from "@/lib/user-location";
import { CoordSchema } from "@/lib/schemas";
import { styleForProducer } from "@/lib/category-registry";
import { categoryGlyphSvg } from "@/lib/marker-glyph";
import { producerPoints } from "@/lib/producerPoints";

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
 *   - Set `title: producer.name` for the browser tooltip
 *   - Bind a Leaflet tooltip with the actual name
 *   - Defensively skip producers without name/lat/lng
 *
 * This list used to open with "Set `alt: producer.name` explicitly". That line
 * was wrong from the day it was written — Leaflet only applies `alt` to an <img>
 * icon, and these markers are divIcons, so the option was silently dropped
 * (MEH-1619, measured). `title` is what actually carries the name here; the
 * option itself is gone.
 *
 * Parent communicates via `registerApi` callback (not refs — next/dynamic
 * doesn't reliably forward refs).
 */

// MEH-1568: cluster radius by zoom. Below zoom 11 the map shows a region, so a
// wide 60px grid keeps the country readable; from 11 up the user is inside a
// town and a 40px grid stops neighbouring-but-distinct pins from being welded
// together. Named (not inline) per exec §10 / eslint no-magic-numbers.
const CLUSTER_TIGHT_RADIUS_ZOOM = 11;
const CLUSTER_RADIUS_WIDE = 60;
const CLUSTER_RADIUS_TIGHT = 40;

// MEH-1611: framing a selected business's points. Padding keeps the outermost
// pins off the viewport edge (and clear of the bottom sheet's top edge on
// mobile); the zoom cap stops a tight cluster of points from slamming the
// camera to street level. Named per exec §10 / eslint no-magic-numbers.
const FIT_PADDING_PX = 40;
const FIT_MAX_ZOOM = 15;

// docs/archive/MAP_IMPROVEMENTS.md #5 — category color + icon lookup lives in
// lib/map-categories.js (shared with MapClient since this component is
// dynamically loaded with ssr:false).

/**
 * Circle map pin — S5 FINAL (MEH-763 Chunk 2); no-photo fallback reworked by MEH-936.
 *
 * Anatomy (uniform 36px circle):
 *   - Round photo: producer's first image, square Cloudinary crop, lazy.
 *   - No-photo fallback (MEH-936): the producer's category Phosphor glyph
 *     (white, weight="fill") on the category colour — same mapping as the legend
 *     (MapPane.jsx) + the card dots. Empty/null category → DEFAULT (Leaf on
 *     primary). Replaces the MEH-638 name-monogram.
 *   - Border: 2px primary; selected (active) → 3px primary-dark.
 *   - Verified badge: FROZEN (MEH-762 handoff) — white-on-green ✓, bottom-end.
 *   - Rings: hover → subtle primary; active → primary glow; premium → gold.
 *   - Visited: grayscale + opacity 0.7 (dimmed but still legible — MEH-1277;
 *     0.4 on a 36px circle read as disabled/broken rather than "visited").
 *
 * MEH-936 intentionally OVERRIDES the MEH-763 F2 lock ("category colour/icon
 * only in legend + card dots; markers carry no category colour, so the
 * '≤4 category colours, deuteranopia-safe' rule holds by construction"). The
 * no-photo fallback now carries BOTH the category colour AND its distinct glyph
 * shape — redundant encoding (colour + shape, never colour alone) is the
 * WCAG-recommended way to convey category to colour-blind users, so this
 * strengthens deuteranopia-safety rather than weakening it. Photo markers are
 * unchanged and still carry no category colour.
 *
 * Was a category-colour circle + white Phosphor icon sized 28/32/36 by state.
 */
// Inline hex in the divIcon HTML below is required — Leaflet renders a raw HTML
// string, so Tailwind tokens can't apply. Values map to design tokens:
// #2e6853 = primary, #2E4A2E = primary-dark, #fff = surface, #896714 = accent.

// MEH-1060 (SEO-14): the marker photo is a meaningful image (the producer),
// not decorative — it needs an alt for image indexing + a11y (matches the
// ProducerCard `alt={producer.name}` pattern). Because the marker HTML is a
// raw string injected via Leaflet's divIcon, producer.name must be
// HTML-attribute-escaped so it can't break out of the alt="..." quotes.
function escapeHtmlAttr(str) {
  return String(str ?? "")
    .replace(/&/g, "&amp;")
    .replace(/"/g, "&quot;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

// MEH-1611: focus-on-select. When one business is selected, every OTHER
// business's pin is DEMOTED (faded + desaturated) rather than removed — the
// Airbnb map-search pattern: the surrounding supply stays legible as context,
// so the map never lies about what is in the area. Anti-pattern (explicitly
// rejected): hiding non-selected pins on a discovery map; full isolation lives
// on the entity page (store-locator pattern), which is this ticket's chunk 2.
//
// The demote itself is pure CSS (globals.css `.mehamakor-map-focused`) driven by
// ONE class toggle on the map container — no per-marker JS, no layer add/remove
// (MEH-1424's O(N²) lesson). The only thing JS must know per marker is whether
// it belongs to the SELECTED business, and that rides here in the divIcon's
// className: Leaflet re-applies the icon every time a marker renders out of a
// cluster, so the flag survives clustering/panning with zero bookkeeping.
const MARKER_WRAP_CLASS = "mehamakor-marker-wrap";
const MARKER_FOCUSED_CLASS = "mehamakor-marker-focused";
const MAP_FOCUSED_CLASS = "mehamakor-map-focused";

function markerWrapClass(active) {
  return active ? `${MARKER_WRAP_CLASS} ${MARKER_FOCUSED_CLASS}` : MARKER_WRAP_CLASS;
}

function createCategoryMarker(
  producer,
  { active = false, hovered = false, visited = false, approximate = false } = {},
) {
  // S5 FINAL: all markers are uniform 36px circles; state shows via border +
  // rings, not size (drops the old 28/32/36 size jump).
  const size = 36;
  const dimmed = visited && !active && !hovered;
  // MEH-1277: visited = grayscale + 0.7 (was 0.4). Strong transparency on a
  // small 36px circle read as disabled/broken; desaturation + softer opacity
  // stays distinct from a fresh pin yet legible (Airbnb "viewed" pattern).
  const opacity = dimmed ? 0.7 : 1;
  const grayscale = dimmed ? "filter:grayscale(1);" : "";
  const isPremium = producer.plan === "premium";
  const isVerified = producer.verification_tier === "verified"; // MEH-766 ch1: doc-verification tier

  // Round photo (square crop), else MEH-936 category-glyph fallback. No
  // onerror→fallback swap: strict CSP blocks inline handlers, so we branch on
  // image presence. The glyph + colour come from styleForProducer (the legend's
  // single source of truth); empty/null category degrades to DEFAULT (Leaf on
  // primary). Glyph SVG is memoized in lib/marker-glyph (keyed by component ref).
  const imgUrl = producer.images?.[0]
    ? optimizeCloudinary(producer.images[0], { aspectRatio: IMAGE_RATIOS.square })
    : null;
  const { color: categoryColor, icon: GlyphIcon } = styleForProducer(producer);
  // raw img: this is an HTML *string* handed to Leaflet's divIcon, not JSX.
  // next/image is a React component and cannot be serialised into it — there
  // is no React tree here to render into. Structural, not a preference.
  const inner = imgUrl
    // MEH-1976: onerror degrades a failed load (the MEH-1925 Cloudinary 401)
    // to the category colour instead of the browser's broken-image glyph. It
    // does NOT restore the category glyph SVG — re-injecting that markup from
    // inside an HTML attribute needs escaping this string cannot do safely, so
    // the pin reads as a clean coloured circle rather than the full empty
    // state. Inline handlers DO fire here: next.config.js:84 ships
    // script-src 'unsafe-inline' (checked, not assumed).
    ? `<img src="${imgUrl}" loading="lazy" alt="${escapeHtmlAttr(producer.name)}" onerror="this.style.display='none';this.parentNode.style.background='${categoryColor}'" style="width:100%;height:100%;object-fit:cover;display:block;" />`
    : `<div style="width:100%;height:100%;display:flex;align-items:center;justify-content:center;background:${categoryColor};">${categoryGlyphSvg(GlyphIcon)}</div>`;

  // Verified badge — tiny white-on-green checkmark, bottom-right.
  // pointer-events:none prevents intercepting marker clicks.
  // FROZEN (MEH-762 handoff): glyph + semantics kept byte-identical.
  const verifiedBadge = isVerified
    ? `<div style="
        position:absolute;bottom:-2px;right:-2px;z-index:1;
        width:12px;height:12px;border-radius:50%;
        background:#2e6853;border:1.5px solid #fff;
        display:flex;align-items:center;justify-content:center;
        font-size:7px;color:#fff;font-weight:700;line-height:1;
        pointer-events:none;
      ">✓</div>`
    : "";

  // Border: 2px primary default; selected (active) → 3px state-selected.
  // The hex stays inline (Leaflet divIcon = raw HTML string); #2E4A2E equals
  // the `state-selected` token (= primary-dark, MEH-763 #970) by design.
  const borderWidth = active ? 3 : 2;
  const borderColor = active ? "#2E4A2E" : "#2e6853";

  // Single box-shadow value (avoids cascade overwrite): drop shadow + state ring
  // (active glow / hover ring) + premium gold ring (6px, outside the others).
  const activeRing = active ? ",0 0 0 4px rgba(46,104,83,0.22)" : "";
  const hoverRing = hovered && !active ? ",0 0 0 3px rgba(46,104,83,0.18)" : "";
  // MEH-1065: accent token value #896714 (retired the stale gold that failed AA, MEH-917).
  // Inline hex required — Leaflet divIcon renders raw HTML, no Tailwind class here.
  const premiumRing = isPremium ? ",0 0 0 6px #896714" : "";
  // MEH-1412: precision=approximate (e.g. a private home) → soft outer halo so
  // the pin reads as "around here", not a pinpoint address. Inline rgba is the
  // primary token (#2e6853), same divIcon raw-HTML exception noted above.
  // MEH-1569: 7px → 4px. The halo is drawn OUTSIDE the 36px circle, so at 7px it
  // added 14px to the pin's effective footprint (36 → 50) and roughly doubled the
  // overlap area wherever approximate pins sit close together — the density
  // complaint this ticket fixes. 4px keeps the "around here" read without the
  // pile-up. Same value in createSecondaryMarker; keep the two in step.
  const approxRing = approximate ? ",0 0 0 4px rgba(46,104,83,0.14)" : "";
  const boxShadow = `0 2px 8px rgba(0,0,0,0.2)${activeRing}${hoverRing}${premiumRing}${approxRing}`;

  const html = `
    <div style="position:relative;width:${size}px;height:${size}px;">
      <div style="
        width:${size}px;height:${size}px;border-radius:50%;overflow:hidden;
        border:${borderWidth}px solid ${borderColor};
        box-shadow:${boxShadow};
        opacity:${opacity};
        ${grayscale}
        transition:all 0.18s ease-out;
      ">
        ${inner}
      </div>
      ${verifiedBadge}
    </div>`;

  return L.divIcon({
    html,
    className: markerWrapClass(active),
    iconSize: [size, size],
    iconAnchor: [size / 2, size / 2],
  });
}

// MEH-1412 (MEH-1388 chunk 3): pickup / market_stand points render as a
// SECONDARY outline marker — smaller (24px), hollow (white fill), category-
// colour ring + category glyph in the category colour (weight "regular", not
// the primary's white fill) — so a producer's self-pickup / market points read
// as visually distinct from its primary business pin. No photo, no verified
// badge (a pickup point is a place, not the business identity). Inline hex is
// the same divIcon raw-HTML exception documented above createCategoryMarker.
function createSecondaryMarker(
  producer,
  { active = false, hovered = false, visited = false, approximate = false } = {},
) {
  // MEH-1569: 26px → 24px. Against the 36px primary pin (createCategoryMarker,
  // :100 — 36px since the MEH-763 S5 uniform-circle pass), 26px read as "almost
  // the same size", so a business's branch did not stand out from its own pickup
  // points in a dense stack. 24px makes the primary clearly dominant (36 vs 24).
  //
  // DO NOT drop this below 24 — WCAG 2.2 SC 2.5.8 (AA) sets the minimum target
  // size at 24×24 CSS px, and these markers are real targets: they carry a click
  // handler, `keyboard: true`, and role="button" + aria-label (MEH-765). The SC's
  // spacing exception (a 24px circle around the target must not intersect a
  // neighbour's) fails **by definition** in exactly the dense/spiderfied stacks
  // this ticket exists to declutter, so it cannot rescue a smaller pin here.
  // Israeli accessibility compliance (IS 5568) treats this as a legal
  // requirement, not a preference. This shipped briefly at 22px in PR #2203 and
  // was corrected to 24 the same day.
  const size = 24;
  const dimmed = visited && !active && !hovered;
  const opacity = dimmed ? 0.7 : 1;
  const grayscale = dimmed ? "filter:grayscale(1);" : "";
  const { color: categoryColor, icon: GlyphIcon } = styleForProducer(producer);
  const borderWidth = active ? 3 : 2;
  // Preserved: dashed border still carries `approximate` on the secondary pin —
  // only the halo shrinks (MEH-1569), so the precision signal survives at 24px.
  const borderStyle = approximate ? "dashed" : "solid";
  const activeRing = active ? ",0 0 0 4px rgba(46,104,83,0.22)" : "";
  const hoverRing = hovered && !active ? ",0 0 0 3px rgba(46,104,83,0.18)" : "";
  // MEH-1569: 7px → 4px, matching createCategoryMarker above.
  const approxRing = approximate ? ",0 0 0 4px rgba(46,104,83,0.14)" : "";
  const boxShadow = `0 1px 5px rgba(0,0,0,0.2)${activeRing}${hoverRing}${approxRing}`;
  const glyph = categoryGlyphSvg(GlyphIcon, {
    color: categoryColor,
    weight: "regular",
    // MEH-1569: 14 → 12 → 13. Dropped to 12 for the 22px circle in PR #2203,
    // then back up to 13 when the circle returned to 24px (see the size constant
    // above) — the glyph keeps its breathing room inside the border, which eats
    // 4px of the diameter.
    size: 13,
  });
  const html = `
    <div style="
      width:${size}px;height:${size}px;border-radius:50%;
      background:#fff;
      border:${borderWidth}px ${borderStyle} ${categoryColor};
      box-shadow:${boxShadow};
      opacity:${opacity};
      ${grayscale}
      display:flex;align-items:center;justify-content:center;
      transition:all 0.18s ease-out;
    ">${glyph}</div>`;
  return L.divIcon({
    html,
    className: `${markerWrapClass(active)} mehamakor-marker-secondary`,
    iconSize: [size, size],
    iconAnchor: [size / 2, size / 2],
  });
}

// MEH-1568: a cluster whose leaves ALL belong to one business is not a "1" —
// it is that business shown N times. The old badge rendered the unique-business
// count (correct semantics, MEH-1412) which read as a bug on a 9-pickup cluster:
// a green circle saying "1". This renders the business's own category marker
// (same visual language as createCategoryMarker: 36px circle, category colour +
// glyph from styleForProducer, 2px primary border) with a small count dot
// carrying the MARKER count, so "9 points of one business" is legible at a
// glance. No photo — a cluster is a group of places, not the business identity
// portrait, and the glyph fallback is already the no-photo language (MEH-936).
// Inline hex is the same divIcon raw-HTML exception documented above
// createCategoryMarker; #2e6853 = primary, #fff = surface. The count dot's
// physical `right`/`top` are raw CSS inside a Leaflet divIcon (not Tailwind
// logical props) — same exception as createCategoryMarker's verified badge.
function createSingleBusinessClusterIcon(producer, markerCount) {
  const size = 36;
  const { color: categoryColor, icon: GlyphIcon } = styleForProducer(producer);
  const html = `
    <div style="position:relative;width:${size}px;height:${size}px;">
      <div style="
        width:${size}px;height:${size}px;border-radius:50%;overflow:hidden;
        border:2px solid #2e6853;
        box-shadow:0 2px 8px rgba(0,0,0,0.2);
        display:flex;align-items:center;justify-content:center;
        background:${categoryColor};
      ">${categoryGlyphSvg(GlyphIcon)}</div>
      <div style="
        position:absolute;top:-4px;right:-4px;
        min-width:18px;height:18px;padding:0 4px;box-sizing:border-box;
        border-radius:9px;background:#2e6853;border:2px solid #fff;
        display:flex;align-items:center;justify-content:center;
        font-family:'DM Sans',sans-serif;font-size:11px;font-weight:600;
        line-height:1;color:#fff;pointer-events:none;
      ">${markerCount}</div>
    </div>`;
  return L.divIcon({
    html,
    // Keeps `mehamakor-cluster` so globals.css:276 (transparent background) and
    // the marker-presence specs (15-map-markers.spec.ts:28) still match; the
    // modifier lets 24-producer-locations.spec.ts scope the unique-business
    // badge invariant to MULTI-business clusters only.
    className: "mehamakor-cluster mehamakor-cluster-single",
    iconSize: [size, size],
  });
}

// MEH-1412: pick the marker style for a single producer_location row.
// branch (+ the empty-locations fallback synthesised in the marker loop) →
// the primary category pin; pickup / market_stand → the secondary outline.
// precision flows through to both so an approximate point anchors softly.
function createLocationIcon(producer, location, state = {}) {
  const kind = location?.kind;
  const opts = { ...state, approximate: location?.precision === "approximate" };
  return kind === "pickup" || kind === "market_stand"
    ? createSecondaryMarker(producer, opts)
    : createCategoryMarker(producer, opts);
}

// MEH-1611: the [lat, lng] pairs of a producer's markers, Zod-checked.
// Rule 19 — every coordinate crossing into a Leaflet call is validated first,
// so one NaN row can never poison the bounds the camera is fitted to (it is
// dropped instead, and a business whose rows are ALL invalid yields [], which
// focusProducer treats as "no camera move").
function usablePoints(markers = []) {
  return markers
    .map(({ marker }) => {
      const latlng = marker?.getLatLng?.();
      const check = CoordSchema.safeParse({ lat: latlng?.lat, lng: latlng?.lng });
      return check.success ? [check.data.lat, check.data.lng] : null;
    })
    .filter(Boolean);
}

export default function MapComponent({
  producers = [],
  onProducerClick,
  onProducerHover,
  onBoundsChange,
  onMapMove,
  onMapCanvasClick,
  registerApi,
  // Caller-owned ref that receives the live Leaflet map instance. Used by
  // MapClient to call getBounds() directly without going through the API
  // abstraction. Both desktop + mobile MapComponents set this; the VISIBLE
  // one wins because the hidden container produces degenerate bounds (detected
  // in MapClient before use).
  mapRef: parentMapRef = null,
  // MEH-14: IDs of producers the user has already viewed (from
  // recently_viewed sessionStorage). These markers render dimmed.
  visitedIds = null,
  // MEH-1412 (MEH-1388 chunk 3): show/hide the pickup + market_stand secondary
  // marker layer. Default true (all points visible); MapClient owns the toggle.
  showSecondaryLayer = true,
  // MEH-1611: id of the business the user has selected, or null. Drives the
  // focus-on-select demote (see markerWrapClass above).
  //
  // DECLARATIVE ON PURPOSE — do NOT re-plumb this as imperative api calls.
  // Selection is cleared in EIGHT places (useMapFilters.js:158,173,199,224,257
  // on every filter change · useMapSync.js:186 canvas click · MapClient.jsx:584
  // card close), so an imperative "clearFocus()" would have to be threaded
  // through all of them and would silently rot the moment a ninth appears —
  // the two-parallel-mechanisms smell (.claude/rules/workflow.md §Smell #1).
  // React state is already the single owner of "who is selected"; this prop
  // just mirrors it onto the map.
  focusedProducerId = null,
}) {
  const t = useTranslations("map.component");
  const visitedSet =
    visitedIds instanceof Set
      ? visitedIds
      : new Set(Array.isArray(visitedIds) ? visitedIds : []);
  const containerRef = useRef(null); // DOM node for L.map()
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
  const onMapCanvasClickRef = useRef(onMapCanvasClick);
  onMapCanvasClickRef.current = onMapCanvasClick;

  // Refresh a single marker's icon based on active/hover/visited state
  const refreshMarkerIcon = (id) => {
    const entry = markersRef.current.get(id);
    if (!entry) return;
    // MEH-1412: a producer now owns N markers (one per location) — refresh the
    // active/hover/visited state on ALL of them so highlighting a card lights
    // every one of that business's pins.
    const state = {
      active: activeIdRef.current === id,
      hovered: hoveredIdRef.current === id,
      visited: visitedSet.has(id),
    };
    entry.markers.forEach(({ marker, location }) => {
      marker.setIcon(createLocationIcon(entry.producer, location, state));
    });
  };

  // MEH-1611: the ONLY writer of the focus state. Both entry points (the
  // `focusedProducerId` prop effect and the imperative focusProducer API) route
  // through here, so the container class and the icons can never disagree about
  // who is selected. Returns nothing; camera work stays with the caller.
  // `id = null` rather than `id ?? null` inside: a default parameter already
  // covers the undefined case (the prop's own default), and an explicit null
  // is the target value anyway.
  const applyFocus = (id = null) => {
    if (activeIdRef.current === id) return;
    const prev = activeIdRef.current;
    activeIdRef.current = id;
    if (prev) refreshMarkerIcon(prev);
    if (id) refreshMarkerIcon(id);
    // MEH-1663: demote the surroundings ONLY when the selected business actually
    // owns a pin. The class fades every marker that is not tagged focused
    // (globals.css:359), so selecting a business with zero markers would grey the
    // whole map and highlight nothing — a worse read than no demote at all.
    // Unreachable until MEH-1663: handleCardClick used to refuse any producer with
    // NULL lat/lng, which is exactly the zero-marker population. Now that selection
    // is (correctly) no longer gated on coordinates, a delivery-only business with
    // NO location row at all — served by the non-geo /producers list, which applies
    // no pinnable filter (producer_listing.py:138, require_physical is geo-only and
    // defaults False) — reaches this line. It selects and navigates; it just must
    // not pretend to have a point on the map.
    const hasPins = id !== null && (markersRef.current.get(id)?.markers?.length ?? 0) > 0;
    containerRef.current?.classList.toggle(MAP_FOCUSED_CLASS, hasPins);
  };

  // Expose imperative API via a callback prop
  useEffect(() => {
    if (!registerApi) return;
    const api = {
      focusProducer: (producerId) => {
        const entry = markersRef.current.get(producerId);
        if (!entry || !entry.markers?.length || !mapInstanceRef.current) return;
        applyFocus(producerId);
        // MEH-1611: a business with several points must be FRAMED, not flown to.
        const points = usablePoints(entry.markers);
        if (points.length === 0) return;

        // Suppress the "search this area" banner on our own camera moves — both
        // branches below are programmatic (moveend fires once for either).
        programmaticMoveRef.current = true;
        if (points.length >= 2) {
          mapInstanceRef.current.fitBounds(points, {
            padding: [FIT_PADDING_PX, FIT_PADDING_PX],
            // Without a cap, a business whose points sit metres apart would fit
            // to street level and lose all surrounding context.
            maxZoom: FIT_MAX_ZOOM,
          });
          return;
        }
        // Single usable point → the existing flyTo, unchanged.
        mapInstanceRef.current.flyTo(points[0], 14, { duration: 1.2 });
      },
      setHoveredProducer: (producerId) => {
        const prev = hoveredIdRef.current;
        if (prev === producerId) return;
        hoveredIdRef.current = producerId;
        if (prev) refreshMarkerIcon(prev);
        if (producerId) refreshMarkerIcon(producerId);
      },
      // MEH-30 #1 — "near me" was an absolute overlay button inside this
      // component. Button now lives in MapClient (inline with the city
      // search) and calls this imperative method on success. Geolocation
      // + the "my location" marker stay here because they operate on
      // the internal `mapInstanceRef` and `myLocationMarkerRef`.
      // MEH-970: optional onSuccess({lat,lng}) lets the caller (MapClient)
      // run the empty-near-me guard against the loaded producer set after the
      // map has flown to the user. Backwards-compatible — existing one-arg
      // callers are unaffected. Geolocation + marker logic stay here.
      goToMyLocation: (onPermissionDenied, onSuccess) => {
        if (!mapInstanceRef.current || !navigator.geolocation) return;
        navigator.geolocation.getCurrentPosition(
          (pos) => {
            const { latitude, longitude } = pos.coords;
            if (!latitude || !longitude || isNaN(latitude) || isNaN(longitude)) {
              showToast.error(t("geo_invalid"));
              return;
            }
            // MEH-1230: persist the fix so the /map "מרחק" sort unlocks and card
            // distance labels render live (useUserLocation subscribers re-render on
            // the dispatched event). No prior code path ever wrote user_location.
            setUserLocation(latitude, longitude);
            const latlng = [latitude, longitude];
            programmaticMoveRef.current = true;
            mapInstanceRef.current.flyTo(latlng, 13, { duration: 1.2 });
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
              }).addTo(mapInstanceRef.current);
            }
            onSuccess?.({ lat: latitude, lng: longitude });
          },
          // PERMISSION_DENIED (err.code === 1) → hand off to MapClient so it can
          // open the city-search fallback (LocationModal) instead of a dead-end
          // toast on a map that looks empty. Technical failures (2/3) keep the toast.
          (err) => {
            if (err?.code === 1) {
              onPermissionDenied?.();
              return;
            }
            showToast.error(t("geo_failure"));
          },
        );
      },
      getMap: () => mapInstanceRef.current,
      // Used by MapClient.registerMapApi to skip hidden (0×0) containers
      // so the mobile map (display:none on desktop) never overwrites the
      // visible desktop map's API reference, and vice-versa on mobile.
      getContainer: () => containerRef.current,
    };
    registerApi(api);
    return () => registerApi(null);
    // refreshMarkerIcon closes over the latest visitedSet via the
    // module-scope `visitedSet` variable; intentionally fire-once on
    // mount so we don't tear down + re-register the parent's API
    // every time the visited list changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [registerApi]);

  // Initialize the map once
  useEffect(() => {
    if (!containerRef.current || mapInstanceRef.current) return;

    mapInstanceRef.current = L.map(containerRef.current, { zoomControl: true }).setView(
      // Default view — MEH-932: fixed center on the Israel producer band
      // [32.4, 34.95] zoom 8, not Jerusalem [31.7683, 35.2137]. The Jerusalem
      // center pulled half the Mediterranean + Arabic-labelled neighbours into
      // frame on mobile; this recenters north-west onto the coastal/central
      // producer cluster. FIXED center/zoom only — the auto-fitBounds was
      // deliberately removed (see the producers effect below), so this setView
      // is the single source of the initial camera. Zoom 8 keeps the whole
      // producer band (incl. north/Golan) in-frame; tighter zoom 9 is an option
      // pending mobile preview QA (MEH-932 PR notes).
      [32.4, 34.95],
      8,
    );
    // Expose initial center for E2E tests (05-map-navigation.spec.ts)
    if (typeof window !== "undefined") window.__MAP_CENTER__ = [32.4, 34.95];
    L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
    }).addTo(mapInstanceRef.current);

    // MEH-58 Phase 1: cluster below zoom 11, green circle + white count.
    clusterGroupRef.current = L.markerClusterGroup({
      // MEH-1424: chunkedLoading must stay OFF now that markers arrive via
      // bulk addLayers(). Chunked mode makes addLayers ASYNC (it re-schedules
      // itself with setTimeout), and clearLayers() does NOT cancel the pending
      // continuation — a rapid refetch (search-this-area, layer toggle) could
      // re-add stale markers from the previous feed after the wipe. With the
      // flag off the same code path runs to completion synchronously, still
      // with a single _refreshClustersIcons() pass, preserving both the perf
      // win and the pre-bulk synchronous timing semantics. (The old true value
      // was dead anyway: singular addLayer never engaged chunking.)
      chunkedLoading: false,
      showCoverageOnHover: false,
      // MEH-1568: radius tightens once the user is zoomed into a town — 60px
      // over-clusters at street level, where the point of zooming in is to pull
      // neighbouring pins apart. markercluster accepts a zoom->radius function
      // (leaflet.markercluster-src.js:971-985).
      maxClusterRadius: (zoom) =>
        zoom >= CLUSTER_TIGHT_RADIUS_ZOOM ? CLUSTER_RADIUS_TIGHT : CLUSTER_RADIUS_WIDE,
      // MEH-1568: `disableClusteringAtZoom: 11` REMOVED — it was the map's dead
      // zone. It caps the group's internal _maxZoom at 10
      // (leaflet.markercluster-src.js:975-976), which switches clustering off
      // above zoom 11 AND makes the spiderfy path unreachable: _zoomOrSpiderfy
      // only spiderfies when a cluster survives down to _maxZoom
      // (leaflet.markercluster-src.js:868-888). Consequence: two markers at
      // identical coordinates stacked forever and the lower one was
      // permanently unclickable at EVERY zoom — certain once a business owns
      // several pickup points (MEH-1388). With the option gone, clustering runs
      // at every zoom and a cluster that cannot be split by zooming spiderfies
      // its leaves into a clickable ring instead.
      // spiderfyOnMaxZoom is left at its default `true`
      // (leaflet.markercluster-src.js:25) — verified in the installed 1.5.3,
      // not assumed; stated here so the dependency is explicit.
      iconCreateFunction: (cluster) => {
        // MEH-1412 (MEH-1388 chunk 3): the cluster badge counts UNIQUE
        // businesses, not markers — a 10-location producer contributes 1, not
        // 10. Each marker carries `producerId` (set in the marker loop); dedupe
        // the cluster's leaf markers by it. getAllChildMarkers() flattens nested
        // sub-clusters, so the count is correct at every zoom.
        const childMarkers = cluster.getAllChildMarkers();
        const uniqueBusinesses = new Set(childMarkers.map((m) => m.producerId));
        const count = uniqueBusinesses.size;
        // MEH-1568: one business, many points → its category marker + a point
        // count, instead of a green circle reading "1" (which looked like a
        // broken badge). `producer` is tagged onto every marker in the loop
        // below alongside producerId.
        if (count === 1 && childMarkers[0]?.producer) {
          return createSingleBusinessClusterIcon(
            childMarkers[0].producer,
            childMarkers.length,
          );
        }
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

    mapInstanceRef.current.on("click", () => {
      onMapCanvasClickRef.current?.();
    });

    // MEH-30 follow-up: Leaflet reads the container height once on
    // `L.map()` init. If the parent was 0px at that exact moment (e.g.
    // sticky layout above hadn't stabilized, iOS Safari URL bar was
    // still shrinking the viewport, a parent used grid/flex that
    // resolved later), Leaflet happily renders the map at 0–60px and
    // never recomputes. Force a resize pass once the first frame
    // settles + on any subsequent container resize.
    const scheduleInvalidate = () => {
      if (!mapInstanceRef.current) return;
      requestAnimationFrame(() => mapInstanceRef.current?.invalidateSize());
    };
    scheduleInvalidate();
    setTimeout(scheduleInvalidate, 150);
    setTimeout(scheduleInvalidate, 500);
    let resizeObserver = null;
    if (typeof ResizeObserver !== "undefined" && containerRef.current) {
      resizeObserver = new ResizeObserver(scheduleInvalidate);
      resizeObserver.observe(containerRef.current);
    }
    // Expose the Leaflet instance to the caller-owned ref only when this
    // container is visible (non-zero size). On desktop the mobile map lives
    // inside a display:none element — let it win parentMapRef would give
    // MapClient a degenerate 0×0 Leaflet instance for getBounds() calls.
    const rect = containerRef.current?.getBoundingClientRect();
    if (parentMapRef && rect && (rect.width > 0 || rect.height > 0)) {
      parentMapRef.current = mapInstanceRef.current;
    }

    return () => {
      if (resizeObserver) resizeObserver.disconnect();
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

    // MEH-1424: collect every marker and hand the whole batch to
    // addLayers(bulk) ONCE after the loop, instead of addLayer per marker.
    // Each singular addLayer re-runs iconCreateFunction on every affected
    // cluster, and since MEH-1412 that function walks the cluster's whole
    // subtree (getAllChildMarkers) to dedupe businesses — per-marker adds
    // made the initial load O(N²): measured 663 icon builds / 96k marker
    // walks for a 345-marker feed (1.17M walks at 1,150 markers), vs 9
    // builds / ~2k walks with the bulk add, which runs ONE clustering pass
    // and one icon build per visible cluster. Bulk add stays synchronous —
    // see the chunkedLoading:false note on the group options above.
    const bulkMarkers = [];

    producers.forEach((p) => {
      if (!p || !p.id) return;

      // MEH-1412 (MEH-1388 chunk 3): fan a producer's physical presence points
      // (locations[], from chunk 2's serializer) into one marker each — branch
      // (+ the fallback below) → the primary category pin, pickup/market_stand →
      // the secondary outline (createLocationIcon). If locations[] is empty OR
      // no row had usable coords, the post-loop fallback pins the producer's own
      // lat/lng mirror so no business disappears (parity with the chunk-2
      // backend COALESCE — Expand overlap + the all-coords-invalid edge).

      const markerLabel = p.name || t("marker_singular");
      const entryMarkers = [];

      // Build + register one marker for a single location row. Returns true if a
      // marker was added (usable coords), false otherwise.
      const addMarker = (loc) => {
        // docs/archive/MAP_IMPROVEMENTS.md #10 — defensive null checks: skip a
        // location without usable coordinates (never render a NaN marker).
        const lat = loc?.lat;
        const lng = loc?.lng;
        if (
          typeof lat !== "number" ||
          typeof lng !== "number" ||
          isNaN(lat) ||
          isNaN(lng)
        )
          return false;

        const marker = L.marker([lat, lng], {
          icon: createLocationIcon(p, loc, {
            // MEH-1611: was hardcoded `false`. A refetch that rebuilds every
            // marker ("חפשי באזור זה", a layer toggle, a filter change) happens
            // while a business can still be selected — hardcoding false dropped
            // the selected business's own focus flag, so the CSS demote then
            // faded it along with everything else.
            active: activeIdRef.current === p.id,
            hovered: hoveredIdRef.current === p.id,
            visited: visitedSet.has(p.id),
          }),
          // MEH-30 #8: no Leaflet tooltip/popup — marker click opens the bottom
          // sheet in MapClient (onProducerClickRef). ALL of a producer's markers
          // open the SAME producer card. Hover syncs card highlight, not a tooltip.
          //
          // MEH-1619: `alt: markerLabel` used to sit here and did nothing. Leaflet
          // applies alt ONLY to an <img> icon (leaflet-src.js:7907-7909); these are
          // divIcons, so it rendered a DIV with no alt attribute (measured). The
          // accessible name comes from `title` (applied to any element, :7903) plus
          // the role="button" + aria-label set in the `add` handler below (MEH-765).
          title: markerLabel,
          // Effective, not decorative — measured tabindex="0" on the rendered pin.
          keyboard: true,
        });
        // MEH-1412: tag the marker with its business id so the cluster badge can
        // dedupe by producer (unique-business count, not marker count).
        marker.producerId = p.id;
        // MEH-1568: the producer itself, so a single-business cluster can render
        // that business's category marker (colour + glyph) rather than a "1".
        marker.producer = p;

        // MEH-765: keyboard a11y — the divIcon has no native `alt`, so set
        // role + accessible name on each marker's element via the `add` event
        // (fires each time it renders out of a cluster). Idempotent.
        marker.on("add", () => {
          const el = marker.getElement();
          if (el) {
            el.setAttribute("role", "button");
            el.setAttribute("aria-label", markerLabel);
          }
        });

        // MEH-1412: pass the clicked LOCATION alongside the producer so the
        // selected-card can show the point's label (business name + label).
        // ALL of a producer's markers still open the SAME producer card.
        marker.on("click", () => onProducerClickRef.current?.(p, loc));
        marker.on("mouseover", () => onProducerHoverRef.current?.(p.id));
        marker.on("mouseout", () => onProducerHoverRef.current?.(null));

        bulkMarkers.push(marker); // MEH-1424: batched into one addLayers below
        entryMarkers.push({ marker, location: loc });
        return true;
      };

      // MEH-1412: render each usable location. Secondary points
      // (pickup/market_stand) are suppressed when the layer toggle is off — but
      // a suppressed point still COUNTS as a usable location, so the coord
      // fallback below does not fire for a producer whose only points are hidden
      // pickups (it stays off-map while the layer is hidden rather than
      // reappearing as a primary pin).
      // MEH-1670: the three rules above now live in producerPoints(), so the
      // /map viewport filter derives points the same way instead of reading
      // Producer.lat/lng on its own (which dropped a delivery-only business from
      // the list while its pickup pin was on screen). Behaviour here is
      // unchanged — including the synthesised fallback row, which the module
      // builds with the same fields this loop used to inline.
      producerPoints(p, { includeSecondary: showSecondaryLayer }).forEach(({ location }) =>
        addMarker(location),
      );

      if (entryMarkers.length === 0) return;
      markersRef.current.set(p.id, { markers: entryMarkers, producer: p });
    });

    // MEH-1424: single bulk add — one clustering pass + one icon build per
    // visible cluster (see the comment on bulkMarkers above).
    clusterGroupRef.current.addLayers(bulkMarkers);

    // MEH-58 QA: removed auto-fitBounds that overrode the initial center
    // (MEH-932: now [32.4, 34.95] zoom 8, the fixed producer-band view). The
    // fitBounds was centering on wherever the producers clustered (often
    // northern Israel when test data was sparse), making the map look
    // off-center on load.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [producers, visitedIds, showSecondaryLayer]);

  // MEH-1611: mirror the selected business onto the map.
  //
  // Declared AFTER the marker effect on purpose: on the first commit the
  // markers must exist before we try to refresh their icons. Two writes total,
  // both O(1) in the number of markers on screen:
  //   1. the container class, which the CSS uses to demote everyone else;
  //   2. an icon refresh for the outgoing + incoming business only (≤ its own
  //      point count) so their focus flag / active ring flip.
  // Nothing is added to or removed from the cluster group — marker count before
  // a selection and after it is identical by construction.
  useEffect(() => {
    applyFocus(focusedProducerId);
    // applyFocus is redefined every render and closes over the current
    // visitedSet; depending on it would re-run this effect on every render for
    // no benefit (its own equality check already makes a repeat call a no-op).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [focusedProducerId]);

  return (
    <div ref={containerRef} className="w-full h-full min-h-[500px] rounded-lg" />
  );
}
