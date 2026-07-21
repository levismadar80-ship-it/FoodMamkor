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
import { styleForProducer } from "@/lib/map-categories";
import { categoryGlyphSvg } from "@/lib/marker-glyph";

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
 *   - Set `alt: producer.name` explicitly
 *   - Set `title: producer.name` for the browser tooltip
 *   - Bind a Leaflet tooltip with the actual name
 *   - Defensively skip producers without name/lat/lng
 *
 * Parent communicates via `registerApi` callback (not refs — next/dynamic
 * doesn't reliably forward refs).
 */

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
  const inner = imgUrl
    ? `<img src="${imgUrl}" loading="lazy" alt="${escapeHtmlAttr(producer.name)}" style="width:100%;height:100%;object-fit:cover;display:block;" />`
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
  const approxRing = approximate ? ",0 0 0 7px rgba(46,104,83,0.14)" : "";
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
    className: "mehamakor-marker-wrap",
    iconSize: [size, size],
    iconAnchor: [size / 2, size / 2],
  });
}

// MEH-1412 (MEH-1388 chunk 3): pickup / market_stand points render as a
// SECONDARY outline marker — smaller (26px), hollow (white fill), category-
// colour ring + category glyph in the category colour (weight "regular", not
// the primary's white fill) — so a producer's self-pickup / market points read
// as visually distinct from its primary business pin. No photo, no verified
// badge (a pickup point is a place, not the business identity). Inline hex is
// the same divIcon raw-HTML exception documented above createCategoryMarker.
function createSecondaryMarker(
  producer,
  { active = false, hovered = false, visited = false, approximate = false } = {},
) {
  const size = 26;
  const dimmed = visited && !active && !hovered;
  const opacity = dimmed ? 0.7 : 1;
  const grayscale = dimmed ? "filter:grayscale(1);" : "";
  const { color: categoryColor, icon: GlyphIcon } = styleForProducer(producer);
  const borderWidth = active ? 3 : 2;
  const borderStyle = approximate ? "dashed" : "solid";
  const activeRing = active ? ",0 0 0 4px rgba(46,104,83,0.22)" : "";
  const hoverRing = hovered && !active ? ",0 0 0 3px rgba(46,104,83,0.18)" : "";
  const approxRing = approximate ? ",0 0 0 7px rgba(46,104,83,0.14)" : "";
  const boxShadow = `0 1px 5px rgba(0,0,0,0.2)${activeRing}${hoverRing}${approxRing}`;
  const glyph = categoryGlyphSvg(GlyphIcon, {
    color: categoryColor,
    weight: "regular",
    size: 14,
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
    className: "mehamakor-marker-wrap mehamakor-marker-secondary",
    iconSize: [size, size],
    iconAnchor: [size / 2, size / 2],
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

  // Expose imperative API via a callback prop
  useEffect(() => {
    if (!registerApi) return;
    const api = {
      focusProducer: (producerId) => {
        const entry = markersRef.current.get(producerId);
        if (!entry || !entry.markers?.length || !mapInstanceRef.current) return;
        const prev = activeIdRef.current;
        activeIdRef.current = producerId;
        if (prev) refreshMarkerIcon(prev);
        refreshMarkerIcon(producerId);
        // MEH-1412: a producer owns N markers now — fly to its primary location
        // (fallback: first marker).
        const primary =
          entry.markers.find((m) => m.location?.is_primary) || entry.markers[0];
        const latlng = primary.marker.getLatLng();
        const coordCheck = CoordSchema.safeParse({ lat: latlng?.lat, lng: latlng?.lng });
        if (!coordCheck.success) return;
        // Suppress the "search this area" banner on programmatic flyTo.
        programmaticMoveRef.current = true;
        mapInstanceRef.current.flyTo([coordCheck.data.lat, coordCheck.data.lng], 14, { duration: 1.2 });
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
      maxClusterRadius: 60,
      disableClusteringAtZoom: 11,
      iconCreateFunction: (cluster) => {
        // MEH-1412 (MEH-1388 chunk 3): the cluster badge counts UNIQUE
        // businesses, not markers — a 10-location producer contributes 1, not
        // 10. Each marker carries `producerId` (set in the marker loop); dedupe
        // the cluster's leaf markers by it. getAllChildMarkers() flattens nested
        // sub-clusters, so the count is correct at every zoom.
        const uniqueBusinesses = new Set(
          cluster.getAllChildMarkers().map((m) => m.producerId),
        );
        const count = uniqueBusinesses.size;
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
      const locations = Array.isArray(p.locations) ? p.locations : [];

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
            active: false,
            hovered: false,
            visited: visitedSet.has(p.id),
          }),
          // MEH-30 #8: no Leaflet tooltip/popup — marker click opens the bottom
          // sheet in MapClient (onProducerClickRef). ALL of a producer's markers
          // open the SAME producer card. Hover syncs card highlight, not a tooltip.
          alt: markerLabel,
          title: markerLabel,
          keyboard: true,
        });
        // MEH-1412: tag the marker with its business id so the cluster badge can
        // dedupe by producer (unique-business count, not marker count).
        marker.producerId = p.id;

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
      let hadUsableLocation = false;
      locations.forEach((loc) => {
        const lat = loc?.lat;
        const lng = loc?.lng;
        const usable =
          typeof lat === "number" &&
          typeof lng === "number" &&
          !isNaN(lat) &&
          !isNaN(lng);
        if (!usable) return;
        hadUsableLocation = true;
        const secondary = loc?.kind === "pickup" || loc?.kind === "market_stand";
        if (secondary && !showSecondaryLayer) return; // hidden by the layer toggle
        addMarker(loc);
      });

      // Fallback ONLY when the producer had NO usable location at all (empty
      // locations[] or every row coord-invalid) — parity with the chunk-2
      // COALESCE (adversarial-review finding). A producer whose usable points
      // were merely toggled off is intentionally left off-map.
      if (!hadUsableLocation) {
        addMarker({
          kind: "branch",
          is_primary: true,
          lat: p.lat,
          lng: p.lng,
          precision: "exact",
          label: null,
        });
      }

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

  return (
    <div ref={containerRef} className="w-full h-full min-h-[500px] rounded-lg" />
  );
}
