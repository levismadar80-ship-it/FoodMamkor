"use client";

import { useEffect, useRef, useState, useCallback, useMemo } from "react";
import dynamic from "next/dynamic";
import Link from "next/link";
import { ArrowLeft, Crosshair, MagnifyingGlass, X, MapTrifold, List as ListIcon, Leaf, Star, Rows, MapPinLine } from "@phosphor-icons/react";
import api from "@/lib/api";
import MapProducerCard from "@/components/MapProducerCard";
import CitySearch from "@/components/CitySearch";
import { CATEGORY_LEGEND } from "@/lib/map-categories";
import { getRecentlyViewedIds } from "@/lib/recently-viewed";
import { optimizeCloudinary } from "@/lib/cloudinary";
import MapBottomSheet, { PEEK, HALF, FULL } from "@/components/MapBottomSheet";
import { useUserCity, setUserCity } from "@/lib/useUserCity";
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
    verified: false,
    grass_fed: false,
  });
  const [showCityPicker, setShowCityPicker] = useState(false);
  const [sortBy, setSortBy] = useState("default");
  const userCity = useUserCity();

  // MEH-14: mobile map/list toggle. Desktop ignores this (always shows both).
  const [mobileView, setMobileView] = useState("map");

  const [visitedIds, setVisitedIds] = useState([]);
  const [showMapHint, setShowMapHint] = useState(false);

  // MEH-58 Phase 2 — desktop split ratio + mobile bottom sheet snap.
  const [splitRatio, setSplitRatio] = useState("40fr 60fr");
  const [sheetSnap, setSheetSnap] = useState(PEEK);

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

  // MEH-58 Phase 1: onboarding hint — first visit only (sessionStorage).
  useEffect(() => {
    if (typeof window === "undefined") return;
    if (sessionStorage.getItem("map_tour_shown")) return;
    const show = setTimeout(() => setShowMapHint(true), 3000);
    const dismiss = setTimeout(() => {
      setShowMapHint(false);
      sessionStorage.setItem("map_tour_shown", "1");
    }, 6000);
    const onClick = () => {
      setShowMapHint(false);
      sessionStorage.setItem("map_tour_shown", "1");
    };
    window.addEventListener("click", onClick, { once: true });
    return () => {
      clearTimeout(show);
      clearTimeout(dismiss);
      window.removeEventListener("click", onClick);
    };
  }, []);

  // MEH-30 follow-up: when the bottom sheet is open, mark the body so
  // CSS can hide the CookieBanner (which otherwise peeks below the
  // sheet's bottom edge — see globals.css `.sheet-open` rule).
  useEffect(() => {
    if (typeof document === "undefined") return;
    if (selectedProducer) {
      document.body.classList.add("sheet-open");
    } else {
      document.body.classList.remove("sheet-open");
    }
    return () => document.body.classList.remove("sheet-open");
  }, [selectedProducer]);

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
    if (key === "has_delivery" && !chipState.has_delivery && !userCity) {
      setShowCityPicker(true);
      return;
    }
    const next = { ...chipState, [key]: !chipState[key] };
    setChipState(next);
    loadProducers(buildParams(next));
    setCommittedBounds(null);
    setMapMoved(false);
  };

  const handleCityPickerSelect = (city) => {
    setUserCity(city);
    setShowCityPicker(false);
    setCityFilter(city);
    const next = { ...chipState, has_delivery: true };
    setChipState(next);
    loadProducers(buildParams(next, { delivery_city: city }));
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

  // MEH-58 Phase 2: mobile tap marker → sheet HALF + scroll card.
  // Desktop click marker → mini-popup only (handled by MapComponent).
  const handleMarkerClick = useCallback((producer) => {
    setActiveProducerId(producer.id);
    setSelectedProducer(producer);
    const isDesktop = typeof window !== "undefined" && window.innerWidth >= 1024;
    if (!isDesktop) {
      setSheetSnap(HALF);
    }
    const el = cardRefs.current.get(producer.id);
    if (el) setTimeout(() => el.scrollIntoView({ behavior: "smooth", block: "center" }), 100);
  }, []);

  // docs/archive/MAP_IMPROVEMENTS.md #3 — hover sync: map → card
  const handleMarkerHover = useCallback((producerId) => {
    setHoveredProducerId(producerId);
  }, []);

  // MEH-58 Phase 4: card → marker hover sync with 400ms debounce so
  // fast scrolling through the list doesn't thrash marker icons.
  const hoverTimerRef = useRef(null);
  const handleCardMouseEnter = useCallback((producerId) => {
    if (hoverTimerRef.current) clearTimeout(hoverTimerRef.current);
    hoverTimerRef.current = setTimeout(() => {
      setHoveredProducerId(producerId);
      mapApiRef.current?.setHoveredProducer(producerId);
    }, 400);
  }, []);
  const handleCardMouseLeave = useCallback(() => {
    if (hoverTimerRef.current) clearTimeout(hoverTimerRef.current);
    hoverTimerRef.current = null;
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

  // Shared filter chips bar (used in both desktop + mobile sheet)
  const filterChipsBar = (
    <div
      className="flex gap-2 overflow-x-auto pb-1 pl-1 pr-4 scrollbar-hide"
      role="toolbar"
      aria-label="סינון מפה"
      dir="rtl"
    >
      {CATEGORY_CHIPS.map((chip) => {
        if (chip.key !== "all" && categories.length > 0 && resolveCategoryId(chip, categories) == null) return null;
        const active = chipState.categoryKey === chip.key;
        return (
          <button
            key={chip.key}
            type="button"
            onClick={() => onCategoryChipClick(chip.key)}
            aria-pressed={active}
            className={`whitespace-nowrap px-4 py-2.5 rounded-full text-sm font-medium border transition shrink-0 ${
              active ? "bg-primary text-white border-primary" : "bg-white text-site-text border-border hover:border-primary hover:text-primary"
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
          className={`whitespace-nowrap px-4 py-2.5 rounded-full text-sm font-medium border transition shrink-0 ${
            chipState[chip.key] ? "bg-primary text-white border-primary" : "bg-white text-site-text border-border hover:border-primary hover:text-primary"
          }`}
        >
          {chip.label}
        </button>
      ))}
    </div>
  );

  // Shared map pane (used in both desktop + mobile)
  const mapPane = (
    <div className="relative w-full h-full">
      <MapComponent
        producers={filteredByCategory}
        onProducerClick={handleMarkerClick}
        onProducerHover={handleMarkerHover}
        onBoundsChange={handleBoundsChange}
        onMapMove={handleMapMove}
        registerApi={registerMapApi}
        visitedIds={visitedIds}
      />
      {showMapHint && (
        <div
          className="absolute top-4 left-1/2 -translate-x-1/2 z-[1000] px-5 py-2.5 rounded-[10px] text-white text-sm font-medium shadow-lg animate-[slide-up_0.25s_ease-out] pointer-events-none"
          style={{ backgroundColor: "#2E4A2E" }}
          role="status"
        >
          גלגלי את המפה · לחצי על מרקר לפרטים
        </div>
      )}
      {mapMoved && (
        <div className="absolute top-4 left-1/2 -translate-x-1/2 z-[1000]">
          <button type="button" onClick={handleSearchThisArea} className="bg-white border border-border rounded-full px-5 py-2.5 text-sm font-medium shadow-[0_2px_12px_rgba(0,0,0,0.12)] hover:bg-light transition flex items-center gap-2 focus-visible:ring-2 focus-visible:ring-primary/40">
            <MagnifyingGlass size={16} weight="bold" className="text-primary" />
            חפשי באזור זה
          </button>
        </div>
      )}
      {!mapMoved && visibleProducers.length === 0 && allProducers.length > 0 && (
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 z-[1000] bg-white rounded-[16px] p-6 shadow-[0_4px_24px_rgba(0,0,0,0.1)] text-center max-w-[280px]" role="status">
          <Leaf size={44} weight="duotone" className="text-primary mx-auto mb-3" aria-hidden="true" />
          <h3 className="font-headline text-lg font-bold text-site-text mb-2">אין עסקים באזור זה עדיין</h3>
          <p className="text-site-muted text-sm mb-4">מכירה מישהי שתוכל להצטרף?</p>
          <Link href="/register/producer" className="inline-block bg-primary text-white px-4 py-2 rounded-[8px] text-sm hover:bg-primary-light transition">הוסיפי עסק +</Link>
        </div>
      )}
    </div>
  );

  // Shared card list (used in desktop list pane + mobile sheet)
  const cardList = (
    <div className="space-y-3">
      {visibleProducers.map((p) => (
        <div
          key={p.id}
          ref={(el) => { if (el) cardRefs.current.set(p.id, el); else cardRefs.current.delete(p.id); }}
          onMouseEnter={() => handleCardMouseEnter(p.id)}
          onMouseLeave={handleCardMouseLeave}
          className={hoveredProducerId === p.id ? "ring-2 ring-primary rounded-[16px] transition" : "transition"}
        >
          <MapProducerCard
            producer={p}
            active={activeProducerId === p.id}
            onClick={handleCardClick}
          />
        </div>
      ))}
      {visibleProducers.length === 0 && (
        <div className="text-center py-12">
          <Leaf size={44} weight="duotone" className="text-primary mx-auto mb-3" aria-hidden="true" />
          <h3 className="font-headline text-lg font-bold text-site-text mb-2">אין עסקים באזור</h3>
          <p className="text-site-muted text-sm">נסי להזיז את המפה או לשנות מסננים.</p>
        </div>
      )}
    </div>
  );

  // Desktop mini-popup when a producer is selected (desktop only, replaces mobile sheet)
  const desktopMiniPopup = selectedProducer && (() => {
    const p = selectedProducer;
    const imageUrl = optimizeCloudinary(p.images?.[0]);
    const producerHref = p.slug ? `/${p.slug}` : `/producer/${p.id}`;
    return (
      <div className="absolute bottom-4 right-4 z-[600] bg-white rounded-[16px] border border-border shadow-[0_4px_24px_rgba(0,0,0,0.12)] w-[300px] overflow-hidden">
        {imageUrl && (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={imageUrl} alt={p.name || ""} className="w-full h-[100px] object-cover" />
        )}
        <div className="p-3">
          <div className="flex items-start justify-between gap-2">
            <h3 className="font-headline font-bold text-site-text line-clamp-1" style={{ fontSize: "15px" }}>{p.name}</h3>
            <button type="button" onClick={() => setSelectedProducer(null)} className="shrink-0 w-7 h-7 rounded-full hover:bg-light flex items-center justify-center text-site-muted" aria-label="סגור">
              <X size={14} weight="bold" />
            </button>
          </div>
          <p className="text-xs text-site-muted mt-0.5">{p.city}{p.categories?.[0]?.name ? ` · ${p.categories[0].name}` : ""}</p>
          <div className="flex items-center gap-2 mt-2">
            <Link href={producerHref} className="flex-1 text-center bg-primary text-white text-sm font-medium py-1.5 rounded-[8px] hover:bg-primary-light transition">פרופיל מלא ←</Link>
            {p.phone && (
              <a href={`https://wa.me/${p.phone.replace(/\D/g, "")}?text=${encodeURIComponent(`היי! מצאתי אותך במהמקור — ${p.name || ""}`)}`} target="_blank" rel="noopener noreferrer" onClick={() => { try { navigator.sendBeacon?.(`/api/producers/${p.id}/whatsapp-click`); } catch {} }} className="w-8 h-8 rounded-full bg-[#25D366] flex items-center justify-center shrink-0" aria-label="WhatsApp">
                <svg viewBox="0 0 24 24" width="16" height="16" fill="white"><path d="M20.52 3.48A11.9 11.9 0 0012.04 0C5.45 0 .1 5.35.1 11.94c0 2.1.55 4.15 1.6 5.96L0 24l6.27-1.64a11.9 11.9 0 005.77 1.47h.01c6.59 0 11.94-5.35 11.94-11.94 0-3.19-1.24-6.19-3.47-8.41z"/></svg>
              </a>
            )}
          </div>
        </div>
      </div>
    );
  })();

  return (
    <>
      {/* =================== DESKTOP (lg+) — split view =================== */}
      <div className="hidden lg:grid" style={{ height: "calc(100vh - 64px)", gridTemplateColumns: splitRatio }}>
        {/* List pane (RTL → first child = right) */}
        <div className="overflow-y-auto border-l border-border flex flex-col">
          <div className="p-4 pb-2 flex items-center justify-between shrink-0">
            <h1 className="font-headline text-xl font-bold text-site-text">מפת בתי עסק</h1>
            <div className="flex gap-1">
              <button type="button" onClick={() => setSplitRatio("50fr 50fr")} aria-label="תצוגה 50/50" className={`p-1.5 rounded-md transition ${splitRatio.startsWith("50") ? "bg-primary text-white" : "text-site-muted hover:bg-light"}`}>
                <Rows size={18} weight="bold" />
              </button>
              <button type="button" onClick={() => setSplitRatio("25fr 75fr")} aria-label="תצוגה 25/75" className={`p-1.5 rounded-md transition ${splitRatio.startsWith("25") ? "bg-primary text-white" : "text-site-muted hover:bg-light"}`}>
                <MapPinLine size={18} weight="bold" />
              </button>
            </div>
          </div>
          <div className="px-4 pb-3 shrink-0">
            <div className="mb-3">
              <CitySearch id="map-city-search-desktop" label="סנן לפי עיר" value={cityFilter} onChange={setCityFilter} onSubmit={handleCityFilter} placeholder="חפשי עיר..." />
            </div>
            {filterChipsBar}
          </div>
          <div className="flex-1 overflow-y-auto px-4 pb-4">
            <div className="flex items-center justify-between mb-3">
              <p className="text-xs text-site-muted">{visibleProducers.length} בתי עסק</p>
              <select
                value={sortBy}
                onChange={(e) => setSortBy(e.target.value)}
                className="text-xs text-site-muted bg-transparent border border-border rounded-md px-2 py-1 focus:border-primary focus:outline-none"
              >
                <option value="default">קרוב אליי</option>
                <option value="rating">הכי מדורגות</option>
                <option value="newest">חדש בשוק</option>
              </select>
            </div>
            {cardList}
          </div>
        </div>

        {/* Map pane */}
        <div className="relative">
          {mapPane}
          {desktopMiniPopup}
          <div className="hidden lg:block absolute bottom-4 left-4 z-[800] bg-white rounded-[12px] shadow-[0_2px_12px_rgba(0,0,0,0.1)] border border-border p-3 max-w-[200px]" role="group" aria-label="סינון לפי קטגוריה">
            <div className="text-[11px] text-site-muted tracking-wider mb-2 font-body uppercase">קטגוריות</div>
            {CATEGORY_LEGEND.map((cat) => {
              const catActive = isCategoryActive(cat.name);
              return (
                <button key={cat.name} type="button" onClick={() => toggleCategory(cat.name)} className={`w-full flex items-center gap-2 px-1.5 py-1 rounded-md text-right transition ${catActive ? "opacity-100" : "opacity-40"} hover:bg-light`} aria-pressed={catActive}>
                  <span className="w-3 h-3 rounded-full shrink-0" style={{ background: cat.color }} aria-hidden="true" />
                  <span className="text-xs text-site-text">{cat.emoji} {cat.name.split(",")[0]}</span>
                </button>
              );
            })}
            {activeCategoryNames !== null && (
              <button type="button" onClick={() => setActiveCategoryNames(null)} className="w-full text-[13px] text-primary hover:underline mt-2 pt-2 border-t border-border">הצגי הכל</button>
            )}
          </div>
        </div>
      </div>

      {/* =================== MOBILE (below lg) — full map + sheet =================== */}
      <div className="lg:hidden" style={{ height: "calc(100dvh - 64px)", position: "relative" }}>
        {/* Sticky filter bar at top */}
        <div className="absolute top-0 inset-x-0 z-[50] px-3 py-2 bg-background/95 backdrop-blur border-b border-border">
          <div className="flex items-center gap-2 mb-2">
            <div className="flex-1">
              <CitySearch id="map-city-search-mobile" label="סנן לפי עיר" value={cityFilter} onChange={setCityFilter} onSubmit={handleCityFilter} placeholder="חפשי עיר..." />
            </div>
            <button type="button" onClick={() => mapApiRef.current?.goToMyLocation()} className="cursor-pointer shrink-0 w-10 h-10 rounded-[10px] border border-border bg-white flex items-center justify-center hover:bg-light transition" aria-label="קרוב אלי">
              <Crosshair size={18} weight="duotone" className="text-primary" />
            </button>
          </div>
          {filterChipsBar}
        </div>

        {/* Map fills the rest */}
        <div className="w-full h-full pt-[110px]">
          {mapPane}
        </div>

        {/* Bottom sheet */}
        <MapBottomSheet snap={sheetSnap} onSnapChange={setSheetSnap} count={visibleProducers.length}>
          {cardList}
        </MapBottomSheet>
      </div>

      {/* MEH-58 Phase 3: city picker overlay for "משלוח אליי" chip when no city saved */}
      {showCityPicker && (
        <div className="fixed inset-0 z-[9000] flex items-center justify-center bg-black/40 backdrop-blur-sm px-4" onClick={(e) => { if (e.target === e.currentTarget) setShowCityPicker(false); }}>
          <div className="bg-white rounded-[16px] shadow-[0_8px_40px_rgba(0,0,0,0.15)] w-full max-w-sm p-5 relative">
            <button type="button" onClick={() => setShowCityPicker(false)} className="absolute top-3 left-3 w-8 h-8 rounded-full hover:bg-light flex items-center justify-center text-site-muted" aria-label="סגור">
              <X size={16} weight="bold" />
            </button>
            <h3 className="font-headline text-lg font-bold text-site-text mb-1">לאן לשלוח?</h3>
            <p className="text-site-muted text-sm mb-4">בחרי עיר כדי לסנן לפי משלוח</p>
            <div className="flex flex-wrap gap-2 mb-4">
              {["תל אביב", "ירושלים", "חיפה", "באר שבע"].map((c) => (
                <button key={c} type="button" onClick={() => handleCityPickerSelect(c)} className="px-4 py-2 rounded-full text-sm font-medium border border-border bg-white text-site-text hover:border-primary hover:text-primary transition">{c}</button>
              ))}
            </div>
            <CitySearch id="city-picker-search" label="עיר אחרת" value="" onChange={(v) => { if (v.trim()) handleCityPickerSelect(v.trim()); }} placeholder="הקלידי שם עיר..." />
            <button type="button" onClick={() => setShowCityPicker(false)} className="w-full mt-3 text-center text-sm text-site-muted hover:text-site-text transition py-2">דלגי</button>
          </div>
        </div>
      )}
    </>
  );
}

