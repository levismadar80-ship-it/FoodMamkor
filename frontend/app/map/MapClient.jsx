"use client";

import { useEffect, useRef, useState, useCallback, useMemo } from "react";
import dynamic from "next/dynamic";
import Link from "next/link";
import { MagnifyingGlass, X, MapTrifold } from "@phosphor-icons/react";
import api from "@/lib/api";
import ProducerCard from "@/components/ProducerCard";
import CitySearch from "@/components/CitySearch";
import Breadcrumb from "@/components/Breadcrumb";
import { CATEGORY_LEGEND } from "@/lib/map-categories";

const MapComponent = dynamic(() => import("@/components/MapComponent"), { ssr: false });

export default function MapPage() {
  const [allProducers, setAllProducers] = useState([]);
  const [categories, setCategories] = useState([]);
  const [cityFilter, setCityFilter] = useState("");
  // `mapBounds` is the map's live viewport (updates on every pan/zoom).
  // `committedBounds` is the bounds the grid is actually filtered by —
  // only updated when the user explicitly clicks "חפשי באזור זה".
  // This is the Airbnb pattern: pan freely without the list shifting
  // underneath you (bug #14 fix).
  const [mapBounds, setMapBounds] = useState(null);
  const [committedBounds, setCommittedBounds] = useState(null);
  const [activeProducerId, setActiveProducerId] = useState(null);

  // docs/archive/MAP_IMPROVEMENTS.md #3 — hover sync state shared between cards and map.
  const [hoveredProducerId, setHoveredProducerId] = useState(null);

  // docs/archive/MAP_IMPROVEMENTS.md #1 — "search this area" state.
  // `mapMoved` flips to true after any user-initiated pan/zoom; clicking
  // the button commits `mapBounds → committedBounds` so the grid filter
  // actually updates (see bug #14 fix above).
  const [mapMoved, setMapMoved] = useState(false);

  // docs/archive/MAP_IMPROVEMENTS.md #7 — mobile bottom-sheet producer selection.
  const [selectedProducer, setSelectedProducer] = useState(null);

  // docs/archive/MAP_IMPROVEMENTS.md #8 — legend = filter. `activeCategoryNames` is
  // the current inclusion set. null means "all enabled" (default).
  const [activeCategoryNames, setActiveCategoryNames] = useState(null);
  const [chips, setChips] = useState({ kosher: false, organic: false, has_delivery: false, verified: false });

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

  const chipParams = (overrides = {}) => {
    const c = { ...chips, ...overrides };
    const p = {};
    if (c.kosher) p.kosher = true;
    if (c.organic) p.organic = true;
    if (c.has_delivery) p.has_delivery = true;
    if (c.verified) p.verified = true;
    return p;
  };

  const toggleChip = (key) => {
    const next = { ...chips, [key]: !chips[key] };
    setChips(next);
    const params = chipParams({ [key]: !chips[key] });
    if (cityFilter) params.delivery_city = cityFilter;
    loadProducers(params);
  };

  const handleCityFilter = () => {
    const params = { ...chipParams() };
    if (cityFilter) params.delivery_city = cityFilter;
    loadProducers(params);
    // When the user changes city, clear any committed bounds filter so
    // the grid shows ALL matches for the new city — not a stale viewport
    // from the previous city.
    setCommittedBounds(null);
    setMapMoved(false);
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

  // docs/archive/MAP_IMPROVEMENTS.md #3 — hover sync: map → card
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

  // docs/archive/MAP_IMPROVEMENTS.md #1 — map moved → show "search this area" button
  const handleMapMove = useCallback(() => {
    setMapMoved(true);
  }, []);

  // Bug #14 fix: commit the current viewport to `committedBounds` so the
  // grid below re-filters to it. Previously this only called
  // `loadProducers()` which refetches the full list from the backend
  // without changing any filter state — the button was a no-op. Now the
  // grid genuinely updates only when the user asks.
  const handleSearchThisArea = useCallback(() => {
    setCommittedBounds(mapBounds);
    setMapMoved(false);
  }, [mapBounds]);

  // docs/archive/MAP_IMPROVEMENTS.md #8 — toggle a single category from the legend
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

  // Bug #14 fix: filter the grid by `committedBounds`, NOT the live
  // `mapBounds`, so panning doesn't continuously reshuffle the list.
  // When `committedBounds` is null (initial state or after a reset) we
  // show everything.
  const visibleProducers = useMemo(() => {
    if (!committedBounds) return filteredByCategory;
    return filteredByCategory.filter((p) => {
      if (typeof p.lat !== "number" || typeof p.lng !== "number") return false;
      return (
        p.lat >= committedBounds.south &&
        p.lat <= committedBounds.north &&
        p.lng >= committedBounds.west &&
        p.lng <= committedBounds.east
      );
    });
  }, [filteredByCategory, committedBounds]);

  return (
    <div className="max-w-7xl mx-auto px-4 py-6">
      <Breadcrumb
        items={[{ href: "/", label: "בית" }, { label: "מפה" }]}
        className="mb-3"
      />
      <h1 className="font-headline text-3xl font-bold mb-6 text-site-text">מפת בתי עסק</h1>

      {/* Filters (top bar) — city search only. Category filter lives in
          the legend widget overlaid on the map (docs/archive/MAP_IMPROVEMENTS.md #8).
          FEEDBACK_FIXES fix 4: `overflow-visible` so the autocomplete
          dropdown isn't clipped; `w-full` wrapper so the CitySearch
          gets the full viewport width on mobile.
          tasks_for_claude_code.md PR 2 (task 3): desktop width bumped
          from w-72 (288px) → w-96 (384px) so longer Hebrew city names
          like "ראשון לציון" / "מעלה אדומים" no longer truncate in the
          input or its autocomplete dropdown. The dropdown inherits
          `w-full` from this same wrapper so the single width change
          fixes both. */}
      <div className="flex flex-col md:flex-row gap-4 mb-4 overflow-visible">
        <div className="w-full md:w-96">
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

      {/* Filter chips — task 12 */}
      <div className="flex gap-2 mb-6 overflow-x-auto pb-1 -mx-1 px-1 scrollbar-hide">
        {[
          { key: "kosher", label: "כשר", icon: "✡️" },
          { key: "organic", label: "אורגני", icon: "🌿" },
          { key: "has_delivery", label: "משלוח", icon: "🚚" },
          { key: "verified", label: "מאומת בלבד", icon: "✅" },
        ].map((chip) => (
          <button
            key={chip.key}
            type="button"
            onClick={() => toggleChip(chip.key)}
            className={`inline-flex items-center gap-1.5 whitespace-nowrap px-4 py-2 rounded-full text-sm font-medium border transition shrink-0 ${
              chips[chip.key]
                ? "bg-primary text-white border-primary"
                : "bg-white text-site-text border-border hover:border-primary hover:text-primary"
            }`}
          >
            <span aria-hidden="true">{chip.icon}</span>
            {chip.label}
          </button>
        ))}
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

        {/* docs/archive/MAP_IMPROVEMENTS.md #1 — "search this area" floating button */}
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

        {/* docs/archive/MAP_IMPROVEMENTS.md #8 — legend that doubles as filter */}
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

        {/* docs/archive/MAP_IMPROVEMENTS.md #9 — empty state overlay when nothing visible */}
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

      {/* docs/archive/MAP_IMPROVEMENTS.md #7 — mobile bottom sheet for selected producer
          Improvement #12: the drag handle was inside a flex-between row
          (where mx-auto doesn't do anything), and the close button was
          absolute-positioned inside that same row — leaving the handle
          flush-left. Restructured: handle is its own centered block, X
          is absolute relative to the dialog. */}
      {selectedProducer && (
        <div
          className="md:hidden fixed bottom-16 inset-x-3 z-[900] bg-white rounded-[20px] border border-border shadow-[0_-4px_32px_rgba(0,0,0,0.12)] p-4 pt-3 max-h-[55vh] overflow-auto animate-[slide-up_0.25s_ease-out]"
          role="dialog"
          aria-modal="true"
          aria-label="פרטי העסק שנבחר"
        >
          <div
            className="w-10 h-1 bg-border rounded-full mx-auto mb-3"
            aria-hidden="true"
          />
          <button
            type="button"
            onClick={() => setSelectedProducer(null)}
            className="absolute top-3 left-3 p-1.5 rounded-full text-site-muted hover:text-site-text hover:bg-light focus-visible:ring-2 focus-visible:ring-primary/40"
            aria-label="סגור"
          >
            <X size={18} weight="bold" />
          </button>
          <ProducerCard producer={selectedProducer} referrer="search" />
        </div>
      )}

      {/* Producer grid below map — filtered by committed bounds + categories */}
      <div>
        <div className="flex items-center justify-between flex-wrap gap-3 mb-4">
          <h2 className="font-headline text-2xl font-bold text-site-text">
            בתי עסק{committedBounds ? " באזור" : ""} ({visibleProducers.length})
          </h2>
          {committedBounds && (
            <button
              type="button"
              onClick={() => {
                setCommittedBounds(null);
                setMapMoved(false);
              }}
              className="text-sm text-primary hover:underline focus-visible:ring-2 focus-visible:ring-primary/40 rounded"
            >
              הצגי את כל הארץ ←
            </button>
          )}
        </div>
        <div className="grid grid-cols-2 gap-3 md:gap-6 lg:grid-cols-4">
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
                referrer="search"
              />
            </div>
          ))}
        </div>
        {visibleProducers.length === 0 && (
          <div className="text-center py-16">
            <div className="inline-flex items-center justify-center w-24 h-24 rounded-full bg-light mb-6" aria-hidden="true">
              <MapTrifold size={44} weight="duotone" className="text-primary" />
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
