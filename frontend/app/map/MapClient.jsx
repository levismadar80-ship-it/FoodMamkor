"use client";

import { useEffect, useRef, useState, useCallback, useMemo } from "react";
import dynamic from "next/dynamic";
import Link from "next/link";
import { MagnifyingGlass, X } from "@phosphor-icons/react";
import api from "@/lib/api";
import ProducerCard from "@/components/ProducerCard";
import CitySearch from "@/components/CitySearch";
import Breadcrumb from "@/components/Breadcrumb";

const MapComponent = dynamic(() => import("@/components/MapComponent"), { ssr: false });

/**
 * Category styling mirrored from MapComponent.CATEGORY_STYLES. Kept here
 * (and not exported from MapComponent) because MapComponent is dynamically
 * imported with ssr:false; its exports aren't available at render time on
 * the server pass. The spec lists these in two places; we keep them in
 * sync manually.
 */
const CATEGORY_LEGEND = [
  { name: "בשר, עוף ודגים", color: "#c04040", emoji: "🥩" },
  { name: "ירקות, פירות ומשקים", color: "#2e6853", emoji: "🥬" },
  { name: "חלב וגבינות", color: "#4a90d9", emoji: "🥛" },
  { name: "לחמים ואפייה", color: "#8B6914", emoji: "🍞" },
  { name: "שמנים ודבש", color: "#e8a020", emoji: "🫒" },
  { name: "טיפוח וסבונים", color: "#9b59b6", emoji: "🧴" },
];

export default function MapPage() {
  const [allProducers, setAllProducers] = useState([]);
  const [categories, setCategories] = useState([]);
  const [cityFilter, setCityFilter] = useState("");
  const [mapBounds, setMapBounds] = useState(null);
  const [activeProducerId, setActiveProducerId] = useState(null);

  // MAP_IMPROVEMENTS.md #3 — hover sync state shared between cards and map.
  const [hoveredProducerId, setHoveredProducerId] = useState(null);

  // MAP_IMPROVEMENTS.md #1 — "search this area" state.
  // `mapMoved` flips to true after any user-initiated pan/zoom; when the
  // user clicks the button we re-fetch producers constrained to current
  // bounds and flip it back.
  const [mapMoved, setMapMoved] = useState(false);

  // MAP_IMPROVEMENTS.md #7 — mobile bottom-sheet producer selection.
  const [selectedProducer, setSelectedProducer] = useState(null);

  // MAP_IMPROVEMENTS.md #8 — legend = filter. `activeCategoryNames` is
  // the current inclusion set. null means "all enabled" (default).
  const [activeCategoryNames, setActiveCategoryNames] = useState(null);

  const mapApiRef = useRef(null);
  const cardRefs = useRef(new Map()); // producer.id → card wrapper DOM node

  const registerMapApi = useCallback((api) => {
    mapApiRef.current = api;
  }, []);

  useEffect(() => {
    api.get("/categories").then((r) => setCategories(r.data)).catch(() => {});
    loadProducers();
  }, []);

  // Deep-link from /producer/:id → sessionStorage → flyTo + popup + highlight card
  useEffect(() => {
    if (allProducers.length === 0) return;
    let focus;
    try {
      const raw = sessionStorage.getItem("focusProducer");
      if (!raw) return;
      focus = JSON.parse(raw);
      sessionStorage.removeItem("focusProducer");
    } catch {
      return;
    }
    if (!focus?.id) return;
    setActiveProducerId(focus.id);

    // Give the map a tick to mount + markers to register before flying
    const t = setTimeout(() => {
      mapApiRef.current?.focusProducer(focus.id);
    }, 400);
    return () => clearTimeout(t);
  }, [allProducers]);

  const loadProducers = (params = {}) => {
    api
      .get("/producers", { params })
      .then((r) => setAllProducers(r.data))
      .catch(() => setAllProducers([]));
  };

  const handleCityFilter = () => {
    const params = {};
    if (cityFilter) params.delivery_city = cityFilter;
    loadProducers(params);
  };

  const handleBoundsChange = useCallback((bounds) => {
    setMapBounds(bounds);
  }, []);

  // Card click → fly map to producer + open popup + highlight card
  const handleCardClick = useCallback((producer) => {
    if (!producer?.lat || !producer?.lng) return;
    setActiveProducerId(producer.id);
    setSelectedProducer(producer);
    document
      .getElementById("map-container")
      ?.scrollIntoView({ behavior: "smooth", block: "start" });
    setTimeout(() => mapApiRef.current?.focusProducer(producer.id), 250);
  }, []);

  // Marker click → highlight matching card + scroll to it + mobile sheet
  const handleMarkerClick = useCallback((producer) => {
    setActiveProducerId(producer.id);
    setSelectedProducer(producer);
    const el = cardRefs.current.get(producer.id);
    if (el) el.scrollIntoView({ behavior: "smooth", block: "center" });
  }, []);

  // MAP_IMPROVEMENTS.md #3 — hover sync: map → card
  const handleMarkerHover = useCallback((producerId) => {
    setHoveredProducerId(producerId);
  }, []);

  // Card → map
  const handleCardMouseEnter = useCallback((producerId) => {
    setHoveredProducerId(producerId);
    mapApiRef.current?.setHoveredProducer(producerId);
  }, []);
  const handleCardMouseLeave = useCallback(() => {
    setHoveredProducerId(null);
    mapApiRef.current?.setHoveredProducer(null);
  }, []);

  // MAP_IMPROVEMENTS.md #1 — map moved → show "search this area" button
  const handleMapMove = useCallback(() => {
    setMapMoved(true);
  }, []);

  const handleSearchThisArea = useCallback(() => {
    // Re-filter the already-loaded list against the current bounds, OR
    // request the backend to filter by bbox. For simplicity we do a
    // client-side refetch (producers list is small in MVP); the bounds
    // filter below handles actual filtering.
    loadProducers();
    setMapMoved(false);
  }, []);

  // MAP_IMPROVEMENTS.md #8 — toggle a single category from the legend
  const toggleCategory = (name) => {
    setActiveCategoryNames((prev) => {
      if (prev === null) {
        // start from "all active" and deselect this one
        return CATEGORY_LEGEND.map((c) => c.name).filter((n) => n !== name);
      }
      if (prev.includes(name)) {
        const next = prev.filter((n) => n !== name);
        return next.length === 0 ? null : next;
      }
      return [...prev, name];
    });
  };

  const isCategoryActive = (name) =>
    activeCategoryNames === null || activeCategoryNames.includes(name);

  // Apply category + bounds filters to the full list
  const filteredByCategory = useMemo(() => {
    if (activeCategoryNames === null) return allProducers;
    const set = new Set(activeCategoryNames);
    return allProducers.filter((p) => {
      const cat = p.categories?.[0]?.name;
      return cat && set.has(cat);
    });
  }, [allProducers, activeCategoryNames]);

  const visibleProducers = useMemo(() => {
    if (!mapBounds) return filteredByCategory;
    return filteredByCategory.filter((p) => {
      if (typeof p.lat !== "number" || typeof p.lng !== "number") return false;
      return (
        p.lat >= mapBounds.south &&
        p.lat <= mapBounds.north &&
        p.lng >= mapBounds.west &&
        p.lng <= mapBounds.east
      );
    });
  }, [filteredByCategory, mapBounds]);

  return (
    <div className="max-w-7xl mx-auto px-4 py-6">
      <Breadcrumb
        items={[{ href: "/", label: "בית" }, { label: "מפה" }]}
        className="mb-3"
      />
      <h1 className="font-headline text-3xl font-bold mb-6 text-site-text">מפת בתי עסק</h1>

      {/* Filters (top bar) — city search only. Category filter lives in
          the legend widget overlaid on the map (MAP_IMPROVEMENTS.md #8).
          FEEDBACK_FIXES fix 4: `overflow-visible` so the autocomplete
          dropdown isn't clipped; `w-full` wrapper so the CitySearch
          gets the full viewport width on mobile. */}
      <div className="flex flex-col md:flex-row gap-4 mb-6 overflow-visible">
        <div className="w-full md:w-72">
          <CitySearch
            id="map-city-search"
            label="סנן לפי עיר"
            value={cityFilter}
            onChange={setCityFilter}
            onSubmit={handleCityFilter}
            placeholder="חפשי עיר..."
          />
        </div>
      </div>

      {/* Map container with overlays */}
      <div id="map-container" className="relative h-[500px] mb-8">
        <MapComponent
          producers={filteredByCategory}
          onProducerClick={handleMarkerClick}
          onProducerHover={handleMarkerHover}
          onBoundsChange={handleBoundsChange}
          onMapMove={handleMapMove}
          registerApi={registerMapApi}
        />

        {/* MAP_IMPROVEMENTS.md #1 — "search this area" floating button */}
        {mapMoved && (
          <div className="absolute top-4 left-1/2 -translate-x-1/2 z-[1000]">
            <button
              type="button"
              onClick={handleSearchThisArea}
              className="bg-white border border-border rounded-full px-5 py-2.5 text-sm font-medium shadow-[0_2px_12px_rgba(0,0,0,0.12)] hover:bg-light transition flex items-center gap-2 focus-visible:ring-2 focus-visible:ring-primary/40"
            >
              <MagnifyingGlass size={16} weight="bold" className="text-primary" />
              חפשי באזור זה
            </button>
          </div>
        )}

        {/* MAP_IMPROVEMENTS.md #8 — legend that doubles as filter */}
        <div
          className="absolute bottom-4 right-4 z-[1000] bg-white rounded-[12px] shadow-[0_2px_12px_rgba(0,0,0,0.1)] border border-border p-3 max-w-[200px]"
          role="group"
          aria-label="סינון לפי קטגוריה"
        >
          <div className="text-[11px] text-site-muted tracking-wider mb-2 font-body uppercase">
            קטגוריות
          </div>
          {CATEGORY_LEGEND.map((cat) => {
            const active = isCategoryActive(cat.name);
            return (
              <button
                key={cat.name}
                type="button"
                onClick={() => toggleCategory(cat.name)}
                className={`w-full flex items-center gap-2 px-1.5 py-1 rounded-md text-right transition ${
                  active ? "opacity-100" : "opacity-40"
                } hover:bg-light`}
                aria-pressed={active}
              >
                <span
                  className="w-3 h-3 rounded-full shrink-0"
                  style={{ background: cat.color }}
                  aria-hidden="true"
                />
                <span className="text-xs text-site-text">
                  {cat.emoji} {cat.name.split(",")[0]}
                </span>
              </button>
            );
          })}
          {activeCategoryNames !== null && (
            <button
              type="button"
              onClick={() => setActiveCategoryNames(null)}
              className="w-full text-[11px] text-primary hover:underline mt-2 pt-2 border-t border-border"
            >
              הצגי הכל
            </button>
          )}
        </div>

        {/* MAP_IMPROVEMENTS.md #9 — empty state overlay when nothing visible */}
        {!mapMoved && visibleProducers.length === 0 && allProducers.length > 0 && (
          <div
            className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 z-[1000] bg-white rounded-[16px] p-6 shadow-[0_4px_24px_rgba(0,0,0,0.1)] text-center max-w-[280px]"
            role="status"
          >
            <div className="text-4xl mb-3" aria-hidden="true">🌱</div>
            <h3 className="font-headline text-lg font-bold text-site-text mb-2">
              אין עסקים באזור זה עדיין
            </h3>
            <p className="text-site-muted text-sm mb-4">
              מכירה מישהי שתוכל להצטרף?
            </p>
            <Link
              href="/register/producer"
              className="inline-block bg-primary text-white px-4 py-2 rounded-[8px] text-sm hover:bg-primary-light transition"
            >
              הוסיפי עסק +
            </Link>
          </div>
        )}
      </div>

      {/* MAP_IMPROVEMENTS.md #7 — mobile bottom sheet for selected producer */}
      {selectedProducer && (
        <div
          className="md:hidden fixed bottom-16 inset-x-3 z-[900] bg-white rounded-[20px] border border-border shadow-[0_-4px_32px_rgba(0,0,0,0.12)] p-4 max-h-[55vh] overflow-auto animate-[slide-up_0.25s_ease-out]"
          role="dialog"
          aria-label="פרטי העסק שנבחר"
        >
          <div className="flex items-start justify-between mb-2">
            <div className="w-10 h-1 bg-border rounded-full mx-auto" aria-hidden="true" />
            <button
              type="button"
              onClick={() => setSelectedProducer(null)}
              className="absolute top-3 right-3 p-1 text-site-muted hover:text-site-text"
              aria-label="סגור"
            >
              <X size={18} weight="bold" />
            </button>
          </div>
          <ProducerCard producer={selectedProducer} />
        </div>
      )}

      {/* Producer grid below map — filtered by visible bounds + categories */}
      <div>
        <h2 className="font-headline text-2xl font-bold mb-4 text-site-text">
          בתי עסק באזור ({visibleProducers.length})
        </h2>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
          {visibleProducers.map((p) => (
            <div
              key={p.id}
              ref={(el) => {
                if (el) cardRefs.current.set(p.id, el);
                else cardRefs.current.delete(p.id);
              }}
              onMouseEnter={() => handleCardMouseEnter(p.id)}
              onMouseLeave={handleCardMouseLeave}
              className={
                hoveredProducerId === p.id
                  ? "ring-2 ring-primary rounded-[16px] transition"
                  : "transition"
              }
            >
              <ProducerCard
                producer={p}
                active={activeProducerId === p.id}
                onClick={handleCardClick}
              />
            </div>
          ))}
        </div>
        {visibleProducers.length === 0 && (
          <div className="text-center py-16">
            <div className="inline-flex items-center justify-center w-24 h-24 rounded-full bg-light mb-6 text-5xl" aria-hidden="true">
              🗺️
            </div>
            <h3 className="font-headline text-xl font-bold text-site-text mb-2">
              אין עסקים באזור המפה הנוכחי 🌱
            </h3>
            <p className="text-site-muted mb-5 max-w-md mx-auto">
              נסי להזיז את המפה, להקטין את הזום, או לשנות את המסננים למעלה.
            </p>
            <Link
              href="/register/producer"
              className="inline-block border border-primary text-primary px-5 py-2 rounded-[8px] hover:bg-light transition text-sm font-medium"
            >
              מכירה מישהי? הזמיני אותה
            </Link>
          </div>
        )}
      </div>
    </div>
  );
}
