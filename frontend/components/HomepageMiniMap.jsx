"use client";

/**
 * Module:   HomepageMiniMap
 * Purpose:  Lazy-loaded mini-map preview on the homepage — discovery
 *           prominence per MEH-538. Click anywhere → /map.
 * Touches:  GET /producers (lazy, on intersection), Leaflet (lazy import
 *           via parent's `dynamic(..., { ssr: false })`), OSM tile layer.
 * Does NOT: Cluster, my-location, hover, bounds tracking, search, filters,
 *           verified/premium badge decoration — those live in
 *           MapComponent.jsx (full /map page).
 * Related:  frontend/lib/map-categories.js:52 (styleForProducer — single
 *             source of truth for category color/icon),
 *           frontend/components/MiniMap.jsx (single-producer detail map
 *             — don't confuse the two; MiniMap takes lat/lng/name for
 *             one producer, this takes an array for the country preview).
 * History:  MEH-538 (creation, 2026-05-15); MEH-604 (2026-05-16 — moved
 *             above the fold; IntersectionObserver replaced with
 *             setTimeout(200) + chained requestIdleCallback; skeleton
 *             extracted to HomepageMiniMapSkeleton.jsx);
 *           MEH-856 (2026-06-18 — default view fitBounds to the business
 *             markers instead of a static Tel-Aviv frame).
 */

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { renderToStaticMarkup } from "react-dom/server";
import { MapContainer, TileLayer, Marker, Tooltip, useMap } from "react-leaflet";
import { ArrowRight, MapTrifold } from "@phosphor-icons/react";
import { useTranslations } from "next-intl";
import L from "leaflet";
import "leaflet/dist/leaflet.css";

import api from "@/lib/api";
import { styleForProducer } from "@/lib/map-categories";

// MEH-538: Tel Aviv (population center) initial frame. MEH-856: this is now
// only the PRE-FIT initial/fallback — FitToBusinesses fitBounds()es to the real
// markers on load so the default view sits on the business base (density), not a
// fixed Tel-Aviv frame. (Chosen over /map's Jerusalem 31.7683,35.2137 as a
// neutral country-level fallback before the marker bounds are known.)
const ISRAEL_CENTER = [32.0853, 34.7818];
const ISRAEL_ZOOM = 8;

// MEH-856: fitBounds tuning — padding (px) around the marker cluster + a zoom
// cap so a single/few producers don't over-zoom to street level.
const FIT_PADDING = [40, 40];
const FIT_MAX_ZOOM = 11;

// MEH-604: above-the-fold means IntersectionObserver fires immediately —
// not useful as a deferral mechanism. Replaced with setTimeout(200) +
// chained requestIdleCallback so Leaflet bundle evaluation lands OUT of
// the LCP measurement window AND outside of any long task.
const POST_FCP_DEFER_MS = 200;

// Build a minimal divIcon for the homepage preview. REUSES the category
// COLOR from styleForProducer (single source of truth) but skips the
// verified-badge / premium-ring / hover-state decorations that
// MapComponent.jsx::createCategoryMarker adds for the full /map page.
// Markers here are 24px (smaller than /map's 28px) since they're meant
// to suggest, not interact.
function createPreviewMarker(producer) {
  const { color, icon: IconComponent } = styleForProducer(producer);
  const iconSvg = renderToStaticMarkup(
    <IconComponent size={12} weight="fill" color="#ffffff" />,
  );
  const html = `
    <div style="
      width:24px;height:24px;border-radius:50%;
      background:${color};
      border:2px solid #fff;
      display:flex;align-items:center;justify-content:center;
      box-shadow:0 2px 6px rgba(0,0,0,0.18);
    ">${iconSvg}</div>`;
  return L.divIcon({
    html,
    className: "mehamakor-homepage-preview-marker",
    iconSize: [24, 24],
    iconAnchor: [12, 12],
  });
}

// MEH-538 Q2: disable ONLY scroll wheel + touch pinch + double-click zoom.
// Keep dragging enabled (users can pan if curious) and keep click handlers
// alive (we use them for marker tooltip + canvas → /map navigation).
function DisableNonClickZoom() {
  const map = useMap();
  useEffect(() => {
    map.scrollWheelZoom.disable();
    map.touchZoom.disable();
    map.doubleClickZoom.disable();
  }, [map]);
  return null;
}

// Canvas-click → /map. Leaflet's `click` fires when the user clicks the
// map background (NOT on a marker — marker clicks are stopped on their
// own handler). Drag-then-release does NOT fire `click`, so this is safe
// alongside dragging.
function CanvasClickToFullMap() {
  const map = useMap();
  const router = useRouter();
  useEffect(() => {
    const onClick = () => router.push("/map");
    map.on("click", onClick);
    return () => {
      map.off("click", onClick);
    };
  }, [map, router]);
  return null;
}

// MEH-856: frame the initial view on the actual business base — fitBounds to the
// plottable markers with padding + a maxZoom cap so a single/few producers don't
// over-zoom. Overrides the static ISRAEL_CENTER/ZOOM (which stay as the pre-fit
// initial value). lat/lng are geographic — not directional, no RTL flip.
function FitToBusinesses({ points }) {
  const map = useMap();
  useEffect(() => {
    if (!points || points.length === 0) return;
    const latlngs = points.map((p) => [p.lat, p.lng]);
    map.fitBounds(L.latLngBounds(latlngs), { padding: FIT_PADDING, maxZoom: FIT_MAX_ZOOM });
  }, [map, points]);
  return null;
}

function PreviewSkeleton() {
  const t = useTranslations("map.homepage_mini");
  return (
    <div className="w-full h-full rounded-[12px] bg-green-50 animate-pulse flex flex-col items-center justify-center gap-3">
      <MapTrifold size={48} className="text-primary/30" />
      <p className="text-fg-muted text-sm">{t("loading")}</p>
    </div>
  );
}

function PreviewEmpty() {
  const t = useTranslations("map.homepage_mini");
  return (
    <div className="w-full h-full rounded-[12px] bg-green-50 flex flex-col items-center justify-center gap-2 px-4 text-center">
      <MapTrifold size={48} className="text-primary/40" />
      <p className="text-text text-sm">
        {t("pre_launch_hint")} 🌿
      </p>
    </div>
  );
}

export default function HomepageMiniMap() {
  const t = useTranslations("map.homepage_mini");
  const [shouldLoad, setShouldLoad] = useState(false);
  const [producers, setProducers] = useState(null); // null = not yet fetched

  // MEH-604: setTimeout(200) enforces the floor — Leaflet bundle eval does
  // NOT start before 200ms post-FCP. requestIdleCallback chained after the
  // timeout ensures the eval lands during browser idle time (off a long
  // task), keeping INP healthy. Fallback to direct setShouldLoad if rIC is
  // unavailable (Safari < 16). Rejected alternatives in the MEH-604 PR:
  // Option B (rIC with timeout:200) — pulls Leaflet back INTO the LCP
  // window. Option C (setTimeout only) — can land on a long task → bad INP.
  useEffect(() => {
    if (shouldLoad) return;
    const timer = setTimeout(() => {
      if (typeof requestIdleCallback === "function") {
        requestIdleCallback(() => setShouldLoad(true));
      } else {
        setShouldLoad(true);
      }
    }, POST_FCP_DEFER_MS);
    return () => clearTimeout(timer);
  }, [shouldLoad]);

  // Fetch on shouldLoad. Q3 accepted the duplicate fetch (useHomePage also
  // calls /producers) as the cost of a strict lazy-load contract.
  useEffect(() => {
    if (!shouldLoad) return;
    let cancelled = false;
    api
      .get("/producers")
      .then((r) => {
        if (!cancelled) setProducers(Array.isArray(r.data) ? r.data : []);
      })
      .catch(() => {
        if (!cancelled) setProducers([]);
      });
    return () => {
      cancelled = true;
    };
  }, [shouldLoad]);

  // Q4: "plottable" = lat AND lng both present. Empty state shows when
  // zero plottable markers (not when zero producers, since a producer
  // without coords contributes nothing to the map).
  // MEH-856: memoized so FitToBusinesses keys on a STABLE reference (changes
  // only when `producers` changes). Without this, the filtered array was a new
  // ref every render → the fitBounds effect re-fired and fought user pan.
  const plottable = useMemo(
    () =>
      Array.isArray(producers)
        ? producers.filter((p) => p.lat != null && p.lng != null)
        : null,
    [producers],
  );

  return (
    <section
      aria-label={t("aria")}
      className="mt-6 mb-12 md:mt-12 md:mb-16 px-4 md:px-6"
    >
      <div className="max-w-6xl mx-auto">
        <header className="mb-3 text-center">
          <h2 className="text-xl md:text-2xl font-semibold text-text">
            {t("dot_caption")}
          </h2>
          <p className="text-sm text-fg-muted mt-1">{t("dot_subtitle")}</p>
        </header>

        <div className="rounded-[12px] overflow-hidden border border-border h-[320px] md:h-[420px] relative">
          {!shouldLoad || plottable === null ? (
            <PreviewSkeleton />
          ) : plottable.length === 0 ? (
            <PreviewEmpty />
          ) : (
            <MapContainer
              center={ISRAEL_CENTER}
              zoom={ISRAEL_ZOOM}
              className="w-full h-full"
              zoomControl={false}
              attributionControl={true}
            >
              <TileLayer
                attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
                url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
              />
              <DisableNonClickZoom />
              <CanvasClickToFullMap />
              <FitToBusinesses points={plottable} />
              {plottable.map((producer) => (
                <Marker
                  key={producer.id}
                  // lat/lng are geographic coordinates, NOT directional —
                  // they don't flip in RTL contexts (Leaflet API).
                  position={[producer.lat, producer.lng]}
                  icon={createPreviewMarker(producer)}
                  // MEH-916: accessible name for the role=button marker (axe
                  // aria-command-name) — Leaflet sets this as `title` on the
                  // .leaflet-marker-icon element; React escapes the value.
                  title={producer.name}
                  eventHandlers={{
                    // Marker click → open tooltip only; do NOT navigate to
                    // /map (canvas-click handler handles the background).
                    // Leaflet stops marker clicks from bubbling to the
                    // map's click handler, so we don't need explicit
                    // stopPropagation here.
                    click: (e) => e.target.openTooltip(),
                  }}
                >
                  <Tooltip direction="top" offset={[0, -8]} opacity={0.95}>
                    <div className="text-sm">
                      <div className="font-medium">{producer.name}</div>
                      {producer.categories?.[0]?.name && (
                        <div className="text-xs text-fg-muted">
                          {producer.categories[0].name}
                        </div>
                      )}
                    </div>
                  </Tooltip>
                </Marker>
              ))}
            </MapContainer>
          )}
        </div>

        <div className="mt-3 text-center">
          <Link
            href="/map"
            className="inline-flex items-center gap-1 text-primary hover:text-primary-dark text-sm font-medium"
          >
            {t("open_full")}
            {/* MEH-877: bidi-correct CTA arrow (Footer MEH-867 pattern) —
                forward in both locales: ArrowRight in LTR/en, rtl:rotate-180
                flips it leftward in he. */}
            <ArrowRight size={16} weight="bold" aria-hidden="true" className="rtl:rotate-180" />
          </Link>
        </div>
      </div>
    </section>
  );
}
