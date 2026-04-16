"use client";

import { useEffect, useRef, useState, useCallback, useMemo } from "react";
import dynamic from "next/dynamic";
import Link from "next/link";
import { ArrowLeft, Crosshair, MagnifyingGlass, X, MapTrifold, List as ListIcon, Leaf, Star } from "@phosphor-icons/react";
import api from "@/lib/api";
import ProducerCard from "@/components/ProducerCard";
import CitySearch from "@/components/CitySearch";
import Breadcrumb from "@/components/Breadcrumb";
import { CATEGORY_LEGEND } from "@/lib/map-categories";
import { getRecentlyViewedIds } from "@/lib/recently-viewed";
import { optimizeCloudinary } from "@/lib/cloudinary";
import {
  CATEGORY_CHIPS,
  TOGGLE_CHIPS,
  chipStateToParams,
  resolveCategoryId,
  boundsToCenterRadius,
} from "@/lib/map-chips";

const MapComponent = dynamic(() => import("@/components/MapComponent"), {
  ssr: false,
  loading: () => (
    <div className="w-full h-full rounded-[12px] bg-light animate-pulse flex flex-col items-center justify-center gap-3">
      <MapTrifold size={48} weight="duotone" className="text-primary/30" />
      <p className="text-site-muted text-sm">טוענת מפה...</p>
    </div>
  ),
});

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

  // MEH-14: chip state per the new spec. Exactly one category chip
  // is active at a time ("all" is the reset sentinel); organic +
  // has_delivery are independent toggles on top of that.
  const [chipState, setChipState] = useState({
    categoryKey: "all",
    organic: false,
    has_delivery: false,
  });

  // MEH-14: mobile map/list toggle. Desktop ignores this (always shows both).
  const [mobileView, setMobileView] = useState("map");

  // MEH-14: visited producer IDs from the recently-viewed store (MEH-11).
  // Read once on mount — re-renders mid-session are fine because clicking
  // a card navigates away from /map.
  const [visitedIds, setVisitedIds] = useState([]);

  const mapApiRef = useRef(null);
  const cardRefs = useRef(new Map()); // producer.id → card wrapper DOM node

  const registerMapApi = useCallback((api) => {
    mapApiRef.current = api;
  }, []);

  useEffect(() => {
    api.get("/categories").then((r) => setCategories(r.data)).catch(() => {});
    loadProducers();
    setVisitedIds(getRecentlyViewedIds());
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

  // MEH-14: build the backend params from the current chip state +
  // optional city. `overrides` lets callers swap in the not-yet-committed
  // chip toggle without waiting for React state.
  const buildParams = (overrideState = chipState, extras = {}) => {
    const params = chipStateToParams(overrideState, categories);
    if (cityFilter) params.delivery_city = cityFilter;
    return { ...params, ...extras };
  };

  const onCategoryChipClick = (key) => {
    const next = { ...chipState, categoryKey: key };
    setChipState(next);
    loadProducers(buildParams(next));
    // Changing category clears the bounds filter so users see all
    // matches, not just the ones inside the previous viewport.
    setCommittedBounds(null);
    setMapMoved(false);
  };

  const onToggleChipClick = (key) => {
    const next = { ...chipState, [key]: !chipState[key] };
    setChipState(next);
    loadProducers(buildParams(next));
    setCommittedBounds(null);
    setMapMoved(false);
  };

  const handleCityFilter = () => {
    loadProducers(buildParams());
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

  // MEH-14 / old bug #14: commit the current viewport AND refetch
  // producers from the backend with lat/lng/radius_km so the list
  // below reflects the area currently on screen. Previously the click
  // only did a local filter, so stale initial data was never refreshed.
  // Now it's true geo-awareness — powered by the existing Haversine
  // SQL on /producers.
  const handleSearchThisArea = useCallback(() => {
    setCommittedBounds(mapBounds);
    setMapMoved(false);
    const centerRadius = boundsToCenterRadius(mapBounds);
    if (centerRadius) {
      loadProducers({
        ...buildParams(),
        lat: centerRadius.lat,
        lng: centerRadius.lng,
        radius_km: centerRadius.radius_km,
      });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mapBounds, chipState, categories, cityFilter]);

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

      {/* MEH-14: sticky search + chips + mobile view tabs. `top-16` clears
          the site header; background + backdrop-blur so content scrolls
          underneath without visual bleed. */}
      <div className="sticky top-16 z-[50] -mx-4 px-4 py-3 bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/75 border-b border-border mb-4">
        {/* City search + "near me" (MEH-30 #1 — moved inline here from
            its previous position as an absolute overlay inside the map.
            Sits next to the city search on desktop, stacks below it on
            mobile). */}
        <div className="flex flex-col md:flex-row md:items-end gap-3 mb-3 overflow-visible">
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
          <button
            type="button"
            onClick={() => mapApiRef.current?.goToMyLocation()}
            className="inline-flex items-center justify-center gap-2 bg-white border border-border text-site-text hover:border-primary hover:text-primary rounded-[10px] px-4 py-2.5 text-sm font-medium transition focus-visible:ring-2 focus-visible:ring-primary/40 shrink-0"
            aria-label="מרכז מפה על המיקום שלי"
          >
            <Crosshair size={16} weight="duotone" className="text-primary" aria-hidden="true" />
            קרוב אלי
          </button>
        </div>

        {/* MEH-14 chips — category radio group + independent toggles.
            MEH-15 bug fix: explicit dir="rtl" so "כל" (first in the array)
            renders at the visual right. Without it, overflow-x containers
            can lose inherited RTL direction on some browsers and flip the
            order so the reset sentinel lands at the left edge. */}
        <div
          className="flex gap-2 overflow-x-auto pb-1 -mx-1 pl-1 pr-4 scrollbar-hide"
          role="toolbar"
          aria-label="סינון מפה"
          dir="rtl"
        >
          {CATEGORY_CHIPS.map((chip) => {
            // Hide chips that don't have a matching category in the DB
            // (except "all", which has null matches and is always shown).
            if (chip.key !== "all" && categories.length > 0 && resolveCategoryId(chip, categories) == null) {
              return null;
            }
            const active = chipState.categoryKey === chip.key;
            return (
              <button
                key={chip.key}
                type="button"
                onClick={() => onCategoryChipClick(chip.key)}
                aria-pressed={active}
                className={`whitespace-nowrap px-4 py-2 rounded-full text-sm font-medium border transition shrink-0 ${
                  active
                    ? "bg-primary text-white border-primary"
                    : "bg-white text-site-text border-border hover:border-primary hover:text-primary"
                }`}
              >
                {chip.label}
              </button>
            );
          })}
          {TOGGLE_CHIPS.map((chip) => (
            <button
              key={chip.key}
              type="button"
              onClick={() => onToggleChipClick(chip.key)}
              aria-pressed={!!chipState[chip.key]}
              className={`whitespace-nowrap px-4 py-2 rounded-full text-sm font-medium border transition shrink-0 ${
                chipState[chip.key]
                  ? "bg-primary text-white border-primary"
                  : "bg-white text-site-text border-border hover:border-primary hover:text-primary"
              }`}
            >
              {chip.label}
            </button>
          ))}
        </div>

        {/* MEH-14 mobile map/list toggle tabs. Desktop ignores this. */}
        <div className="md:hidden mt-3 flex bg-white border border-border rounded-full p-1" role="tablist" aria-label="תצוגת מפה או רשימה">
          <button
            type="button"
            role="tab"
            aria-selected={mobileView === "map"}
            onClick={() => setMobileView("map")}
            className={`flex-1 inline-flex items-center justify-center gap-2 px-4 py-2 rounded-full text-sm font-medium transition ${
              mobileView === "map"
                ? "bg-primary text-white"
                : "text-site-muted hover:text-site-text"
            }`}
          >
            <MapTrifold size={16} weight={mobileView === "map" ? "fill" : "duotone"} />
            מפה
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={mobileView === "list"}
            onClick={() => setMobileView("list")}
            className={`flex-1 inline-flex items-center justify-center gap-2 px-4 py-2 rounded-full text-sm font-medium transition ${
              mobileView === "list"
                ? "bg-primary text-white"
                : "text-site-muted hover:text-site-text"
            }`}
          >
            <ListIcon size={16} weight={mobileView === "list" ? "fill" : "duotone"} />
            רשימה ({visibleProducers.length})
          </button>
        </div>
      </div>

      {/* Map container with overlays.
          MEH-14: hide on mobile when "list" view is active.
          MEH-15 bug fix: mobile uses h-[calc(100vh-64px)] so the map fills
          the rest of the viewport below the 64px site header.
          MEH-30 bug fix (this PR): desktop switched from a fixed 500px to
          60vh with a 500px floor — on short/embedded viewports the old
          fixed height could squish the map into a tiny strip at the top;
          60vh + min-h-500 guarantees the map is always at least ~40vh
          regardless of layout pressure from sticky search + chips above. */}
      <div
        id="map-container"
        className={`relative h-[calc(100vh-64px)] min-h-[70vh] md:h-[70vh] md:min-h-[600px] mb-8 ${mobileView === "list" ? "hidden md:block" : ""}`}
      >
        <MapComponent
          producers={filteredByCategory}
          onProducerClick={handleMarkerClick}
          onProducerHover={handleMarkerHover}
          onBoundsChange={handleBoundsChange}
          onMapMove={handleMapMove}
          registerApi={registerMapApi}
          visitedIds={visitedIds}
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

        {/* docs/archive/MAP_IMPROVEMENTS.md #8 — legend that doubles as filter.
            z-[800] per CLAUDE.md map z-index tokens. Hidden on mobile to
            save screen space; filter chips above the map serve the same
            purpose on small screens. */}
        <div
          className="hidden md:block absolute bottom-4 right-4 z-[800] bg-white rounded-[12px] shadow-[0_2px_12px_rgba(0,0,0,0.1)] border border-border p-3 max-w-[200px]"
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
              className="w-full text-[13px] text-primary hover:underline mt-2 pt-2 border-t border-border"
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
            <div className="mb-3 flex justify-center">
              <Leaf size={44} weight="duotone" className="text-primary" aria-hidden="true" />
            </div>
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

      {/* MEH-30 #13 — bottom sheet redesigned Airbnb/Wolt-style. Dedicated
          inline layout (not a reused ProducerCard): image 160px on top
          with gradient + badges + close-X, body below with name / meta /
          rating / price / CTA. z-[600] per CLAUDE.md map z-index tokens. */}
      {selectedProducer && (() => {
        const p = selectedProducer;
        const imageUrl = optimizeCloudinary(p.images?.[0]);
        const category = p.categories?.[0];
        const badges = [];
        if (p.verified) badges.push("✓ מאומת");
        if (p.is_organic) badges.push("🌿 אורגני");
        const rating = Number(p.avg_rating || 0);
        const showRating = rating > 0;
        const priceLabel = p.starting_price_label;
        const producerHref = p.slug ? `/${p.slug}` : `/producer/${p.id}`;

        return (
          <div
            className="fixed bottom-16 inset-x-3 md:bottom-6 md:inset-x-auto md:left-6 md:right-auto md:w-[360px] z-[600] bg-white rounded-[20px] border border-border shadow-[0_-4px_32px_rgba(0,0,0,0.12)] overflow-hidden max-h-[55vh] animate-[slide-up_0.25s_ease-out]"
            role="dialog"
            aria-modal="true"
            aria-label="פרטי העסק שנבחר"
          >
            {/* Image area — 160px with gradient overlay + badges + close button */}
            <div className="relative w-full h-[160px]">
              {imageUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={imageUrl}
                  alt={p.name || ""}
                  className="w-full h-full object-cover"
                />
              ) : (
                <div
                  aria-hidden="true"
                  className="w-full h-full"
                  style={{ backgroundColor: "#EAF3DE" }}
                />
              )}
              {imageUrl && (
                <div
                  aria-hidden="true"
                  className="absolute inset-0 pointer-events-none"
                  style={{
                    background:
                      "linear-gradient(to top, rgba(0,0,0,0.5) 0%, transparent 60%)",
                  }}
                />
              )}
              <button
                type="button"
                onClick={() => setSelectedProducer(null)}
                className="absolute top-2 left-2 w-7 h-7 rounded-full bg-white/95 hover:bg-white text-site-text flex items-center justify-center shadow-sm focus-visible:ring-2 focus-visible:ring-primary/40"
                aria-label="סגור"
              >
                <X size={14} weight="bold" />
              </button>
              {badges.length > 0 && (
                <div className="absolute bottom-2 left-2 flex gap-1.5">
                  {badges.map((b) => (
                    <span
                      key={b}
                      className="bg-white/95 text-site-text rounded-full px-2 py-0.5"
                      style={{ fontSize: "11px", fontWeight: 500 }}
                    >
                      {b}
                    </span>
                  ))}
                </div>
              )}
            </div>

            {/* Body */}
            <div style={{ padding: "12px 14px" }}>
              <h3
                className="font-headline font-bold text-site-text line-clamp-1"
                style={{ fontSize: "17px" }}
              >
                {p.name}
              </h3>
              <p style={{ fontSize: "12px", color: "#6B6B6B", marginTop: 2 }}>
                {p.city}
                {category?.name ? ` · ${category.name}` : ""}
              </p>
              {showRating && (
                <div
                  className="flex items-center gap-1 mt-1"
                  style={{ fontSize: "13px", color: "#8B6914" }}
                >
                  <Star size={14} weight="fill" aria-hidden="true" />
                  <span>{rating.toFixed(1)}</span>
                  <span style={{ color: "#6B6B6B" }}>
                    ({p.reviews_count || 0} ביקורות)
                  </span>
                </div>
              )}
              {priceLabel && (
                <p
                  className="mt-1"
                  style={{ fontSize: "13px", fontWeight: 700, color: "#8B6914" }}
                >
                  {priceLabel}
                </p>
              )}
              <Link
                href={producerHref}
                className="mt-3 w-full inline-flex items-center justify-center gap-2 bg-primary text-white hover:bg-primary-light transition py-2.5 rounded-[10px] font-medium"
                style={{ fontSize: "14px" }}
              >
                לפרופיל המלא
                <ArrowLeft size={14} weight="bold" aria-hidden="true" />
              </Link>
            </div>
          </div>
        );
      })()}

      {/* Producer grid below map — filtered by committed bounds + categories.
          MEH-14: hide on mobile when "map" view is active. */}
      <div className={mobileView === "map" ? "hidden md:block" : ""}>
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
              אין עסקים באזור המפה הנוכחי
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
