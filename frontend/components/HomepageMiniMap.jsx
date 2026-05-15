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
 * History:  MEH-538 (creation, 2026-05-15).
 */

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { renderToStaticMarkup } from "react-dom/server";
import { MapContainer, TileLayer, Marker, Tooltip, useMap } from "react-leaflet";
import { ArrowLeft, MapTrifold } from "@phosphor-icons/react";
import L from "leaflet";
import "leaflet/dist/leaflet.css";

import api from "@/lib/api";
import { styleForProducer } from "@/lib/map-categories";

// MEH-538: Tel Aviv (population center) — Q1 answer. Chosen over /map's
// Jerusalem (31.7683, 35.2137) because this is a full-country preview
// at zoom 8 and the population center gives a more representative initial
// view. Documented in the PR description.
const ISRAEL_CENTER = [32.0853, 34.7818];
const ISRAEL_ZOOM = 8;

// MEH-538: rootMargin "200px" prevents flash by starting the load slightly
// before the section enters the viewport. Single observer instance per
// mount; disconnected after first fire.
const LAZY_LOAD_ROOT_MARGIN = "200px";

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

function PreviewSkeleton() {
  return (
    <div className="w-full h-full rounded-[12px] bg-light animate-pulse flex flex-col items-center justify-center gap-3">
      <MapTrifold size={48} weight="duotone" className="text-primary/30" />
      <p className="text-site-muted text-sm">טוענת מפה...</p>
    </div>
  );
}

function PreviewEmpty() {
  return (
    <div className="w-full h-full rounded-[12px] bg-light flex flex-col items-center justify-center gap-2 px-4 text-center">
      <MapTrifold size={48} weight="duotone" className="text-primary/40" />
      <p className="text-site-text text-sm">
        בקרוב מאוד — בתי עסק ראשונים מצטרפים השבוע 🌿
      </p>
    </div>
  );
}

export default function HomepageMiniMap() {
  const containerRef = useRef(null);
  const [shouldLoad, setShouldLoad] = useState(false);
  const [producers, setProducers] = useState(null); // null = not yet fetched

  // IntersectionObserver — fire once when the section is ~200px from the
  // viewport, then disconnect.
  useEffect(() => {
    const el = containerRef.current;
    if (!el || shouldLoad) return;
    if (typeof IntersectionObserver === "undefined") {
      // Fallback for ancient browsers / SSR (shouldn't hit — "use client")
      setShouldLoad(true);
      return;
    }
    const obs = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) {
          setShouldLoad(true);
          obs.disconnect();
        }
      },
      { rootMargin: LAZY_LOAD_ROOT_MARGIN },
    );
    obs.observe(el);
    return () => obs.disconnect();
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
  const plottable =
    Array.isArray(producers)
      ? producers.filter((p) => p.lat != null && p.lng != null)
      : null;

  return (
    <section
      ref={containerRef}
      aria-label="תצוגה מקדימה של המפה"
      className="mt-6 mb-12 md:mt-12 md:mb-16 px-4 md:px-6"
    >
      <div className="max-w-6xl mx-auto">
        <header className="mb-3 text-center">
          <h2 className="text-xl md:text-2xl font-semibold text-site-text">
            כל בית עסק על המפה
          </h2>
          <p className="text-sm text-site-muted mt-1">גלי בתי עסק לפי מיקום</p>
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
              {plottable.map((producer) => (
                <Marker
                  key={producer.id}
                  // lat/lng are geographic coordinates, NOT directional —
                  // they don't flip in RTL contexts (Leaflet API).
                  position={[producer.lat, producer.lng]}
                  icon={createPreviewMarker(producer)}
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
                        <div className="text-xs text-site-muted">
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
            className="inline-flex items-center gap-1 text-primary hover:text-primary-light text-sm font-medium"
          >
            פתחי מפה מלאה
            <ArrowLeft size={16} weight="bold" aria-hidden="true" />
          </Link>
        </div>
      </div>
    </section>
  );
}
