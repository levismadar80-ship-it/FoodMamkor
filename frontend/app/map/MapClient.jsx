"use client";

import { useEffect, useRef, useState, useCallback, useMemo } from "react";
import dynamic from "next/dynamic";
import Link from "next/link";
import { ArrowLeft, Crosshair, MagnifyingGlass, X, MapTrifold, List as ListIcon, Leaf, Star, Rows, MapPinLine } from "@phosphor-icons/react";
import api from "@/lib/api";
import { showToast } from "@/lib/toast";
import { GeoSearchSchema } from "@/lib/schemas";
import MapProducerCard from "@/components/MapProducerCard";
import CitySearch from "@/components/CitySearch";
import { CATEGORY_LEGEND } from "@/lib/map-categories";
import { getRecentlyViewedIds } from "@/lib/recently-viewed";
import { optimizeCloudinary } from "@/lib/cloudinary";
import MapBottomSheet, { PEEK, HALF, FULL } from "@/components/MapBottomSheet";
import LocationModal from "@/components/LocationModal";
import { useUserCity } from "@/lib/use-user-city";
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
  const [legendOpen, setLegendOpen] = useState(false);
  const { city: userCity, setCity: setUserCity } = useUserCity();
  const [locationModalOpen, setLocationModalOpen] = useState(false);

  // MEH-14: mobile map/list toggle. Desktop ignores this (always shows both).
  const [mobileView, setMobileView] = useState("map");

  const [visitedIds, setVisitedIds] = useState([]);
  const [showMapHint, setShowMapHint] = useState(false);

  // MEH-58 Phase 2 — desktop split ratio + mobile bottom sheet snap.
  const [splitRatio, setSplitRatio] = useState("40fr 60fr");
  const [sheetSnap, setSheetSnap] = useState(PEEK);

  const mapApiRef = useRef(null);
  // Direct ref to the Leaflet map instance. Both desktop + mobile MapComponents
  // set this via the `mapRef` prop, but the VISIBLE map always wins because the
  // hidden container (display:none, 0×0) produces degenerate bounds — we validate
  // below before using them.
  const mapRef = useRef(null);
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

  // MEH-41: prompt for city on first /map visit when no city is saved.
  // Depends on userCity so the effect re-runs when use-user-city hydrates
  // from localStorage (which initialises to null, then sets the real value
  // in its own useEffect). Without the dependency the 800ms timer fires
  // even when a city IS already saved — stale closure on null.
  const locationModalFiredRef = useRef(false);
  useEffect(() => {
    if (locationModalFiredRef.current || userCity) return;
    const timer = setTimeout(() => {
      locationModalFiredRef.current = true;
      setLocationModalOpen(true);
    }, 800);
    return () => clearTimeout(timer);
  }, [userCity]);

  const handleMapCitySelected = useCallback((city) => {
    setUserCity(city);
    setCityFilter(city);
    loadProducers({ delivery_city: city });
    // NOTE: deliberately no flyTo here. The initial view must stay anchored at
    // [31.7683, 35.2137] zoom 8 (country-wide) — LocationModal only filters
    // the producer list by delivery_city, it doesn't pan the map. Users who
    // want to zoom into their city use the "קרוב אליי" (goToMyLocation)
    // button or pan manually.
  }, [setUserCity]);

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
      .catch((err) => {
        // eslint-disable-next-line no-console
        console.error("[חפשי באזור זה] GET /producers failed:", err);
        setAllProducers([]);
        showToast("לא הצלחנו לטעון עסקים — נסי שוב", "error");
      });
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
    setCommittedBounds(null);
    setMapMoved(false);
    setSelectedProducer(null);
    setActiveProducerId(null);
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
    setSelectedProducer(null);
    setActiveProducerId(null);
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

  // docs/archive/MAP_IMPROVEMENTS.md #1 — map moved → show "search this area" button.
  // Also dismisses the onboarding hint immediately: panning means the user
  // has already engaged with the map so the hint is no longer useful, and
  // both elements share top-4 left-1/2 — letting them stack is confusing.
  const handleMapMove = useCallback(() => {
    setMapMoved(true);
    if (typeof window !== "undefined" && !sessionStorage.getItem("map_tour_shown")) {
      setShowMapHint(false);
      sessionStorage.setItem("map_tour_shown", "1");
    }
  }, []);

  const handleMapCanvasClick = useCallback(() => {
    setSelectedProducer(null);
    setActiveProducerId(null);
  }, []);

  // MEH-14 / old bug #14: commit the current viewport AND refetch
  // producers from the backend with lat/lng/radius_km so the list
  // below reflects the area currently on screen. Previously the click
  // only did a local filter, so stale initial data was never refreshed.
  // Now it's true geo-awareness — powered by the existing Haversine
  // SQL on /producers.
  const handleSearchThisArea = useCallback(() => {
    // `mapPane` renders in two places (desktop + mobile CSS slots). Both mount
    // a MapComponent that calls mapRef.current = leafletInstance. The HIDDEN
    // container (display:none, 0×0 px) produces degenerate bounds where
    // north===south and east===west. Detect this and fall back to `mapBounds`
    // (React state), which is only updated by real user-initiated moveend events
    // on the VISIBLE map — so after any pan it holds the correct viewport.
    // Use NE/SW corner accessors (same data as getNorth/etc, but Leaflet's
    // canonical viewport API). A hidden (display:none, 0×0 px) container makes
    // getBounds() collapse to a single point → ne.lat === sw.lat. Detect and
    // fall back to mapBounds (React state), which is set only by real moveend
    // events from the VISIBLE map.
    const rawBounds = mapRef.current?.getBounds();
    const ne = rawBounds?.getNorthEast();
    const sw = rawBounds?.getSouthWest();
    const boundsAreValid =
      ne && sw &&
      !isNaN(ne.lat) && !isNaN(ne.lng) &&
      !isNaN(sw.lat) && !isNaN(sw.lng) &&
      (ne.lat !== sw.lat || ne.lng !== sw.lng);
    const liveBounds = boundsAreValid
      ? { north: ne.lat, south: sw.lat, east: ne.lng, west: sw.lng }
      : mapBounds;

    setCommittedBounds(liveBounds);
    setMapMoved(false);

    const centerRadius = boundsToCenterRadius(liveBounds);

    // Zod validates lat/lng/radius_km before the fetch:
    //   - radius_km < 1  → degenerate viewport (NaN/0 from hidden map)
    //   - radius_km > 200 → backend Haversine full-table scan → 500
    // delivery_city excluded: geo-radius = "producers physically here",
    // delivery_city = "producers who deliver to my city" — different questions.
    const { delivery_city: _excluded, ...chipParams } = buildParams();
    const geoValidation = GeoSearchSchema.safeParse({
      lat: centerRadius?.lat,
      lng: centerRadius?.lng,
      radius_km: centerRadius?.radius_km,
    });
    if (!geoValidation.success) {
      // Zod v4: issues (not errors). Fall back to a generic Hebrew message
      // if the shape ever changes again.
      const msg = geoValidation.error.issues?.[0]?.message || "חיפוש לא תקין";
      showToast(msg, "info");
      return;
    }
    const params = { ...chipParams, ...geoValidation.data };
    if (process.env.NODE_ENV !== "production") {
      // eslint-disable-next-line no-console
      console.log("[חפשי באזור זה] GET /producers", params);
    }
    api
      .get("/producers", { params })
      .then((r) => setAllProducers(r.data))
      .catch(() => setAllProducers([]));
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
      className="flex gap-2 overflow-x-auto pb-1 -mx-4 px-4 scrollbar-hide"
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
      {/* RTL overflow spacer — CSS padding-inline-end is clipped on overflow-x
          containers, so a shrink-0 flex child is the reliable way to reserve
          space past the last chip. Bumped to w-8 (32px) because w-4 (16px)
          still cropped the אורגני chip edge on narrow mobile viewports. */}
      <div className="shrink-0 w-8" aria-hidden="true" />
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
        onMapCanvasClick={handleMapCanvasClick}
        registerApi={registerMapApi}
        mapRef={mapRef}
        visitedIds={visitedIds}
      />
      {showMapHint && (
        <div
          // eslint-disable-next-line no-restricted-syntax -- rtl-ok: horizontal centering idiom
          className="absolute top-4 left-1/2 -translate-x-1/2 z-[900] px-5 py-2.5 rounded-[10px] text-white text-sm font-medium shadow-lg animate-[slide-up_0.25s_ease-out] pointer-events-none"
          style={{ backgroundColor: "#2E4A2E" }}
          role="status"
        >
          לחצי על סמן עסק כדי לראות פרטים · גלגלי ברשימה מימין לכל העסקים
        </div>
      )}
      {mapMoved && (
        // eslint-disable-next-line no-restricted-syntax -- rtl-ok: horizontal centering idiom
        <div className="absolute top-4 left-1/2 -translate-x-1/2 z-[1000]">
          <button type="button" onClick={(e) => { e.stopPropagation(); handleSearchThisArea(); }} className="bg-white border border-border rounded-full px-5 py-2.5 text-sm font-medium shadow-[0_2px_12px_rgba(0,0,0,0.12)] hover:bg-light transition flex items-center gap-2 focus-visible:ring-2 focus-visible:ring-primary/40">
            <MagnifyingGlass size={16} weight="bold" className="text-primary" />
            חפשי באזור זה
          </button>
        </div>
      )}
      {!mapMoved && visibleProducers.length === 0 && allProducers.length > 0 && (
        // eslint-disable-next-line no-restricted-syntax -- rtl-ok: horizontal centering idiom
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
          id={`card-${p.id}`}
          ref={(el) => { if (el) cardRefs.current.set(p.id, el); else cardRefs.current.delete(p.id); }}
          onMouseEnter={() => handleCardMouseEnter(p.id)}
          onMouseLeave={handleCardMouseLeave}
          className={`${hoveredProducerId === p.id ? "ring-2 ring-primary rounded-[16px]" : ""} ${activeProducerId === p.id ? "border-2 border-primary rounded-[16px] bg-[#EAF3DE10]" : ""} transition`}
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
          <h3 className="font-headline text-lg font-bold text-site-text mb-2">לא נמצאו עסקים</h3>
          <p className="text-site-muted text-sm mb-3">נסי להזיז את המפה או לשנות מסננים.</p>
          <button
            type="button"
            onClick={() => {
              setChipState({ categoryKey: "all", organic: false, has_delivery: false, verified: false, grass_fed: false });
              setActiveCategoryNames(null);
              setCommittedBounds(null);
              setCityFilter("");
              loadProducers();
            }}
            className="text-sm text-primary font-medium hover:underline"
          >
            אפסי סינון
          </button>
        </div>
      )}
    </div>
  );

  // Desktop mini-popup when a producer is selected (desktop only, replaces mobile sheet)
  const desktopMiniPopup = selectedProducer && (() => {
    const p = selectedProducer;
    const imageUrl = optimizeCloudinary(p.images?.[0]);
    return (
      // eslint-disable-next-line no-restricted-syntax -- rtl-ok: map overlay, physically pinned to corner
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
          <p className="text-xs text-site-muted mt-0.5">
            {[p.categories?.[0]?.name, p.city, p.starting_price_label || p.price_range].filter(Boolean).join(" · ")}
          </p>
          {p.phone && (
            <a href={`https://wa.me/${p.phone.replace(/\D/g, "")}?text=${encodeURIComponent(`היי! מצאתי אותך במהמקור — ${p.name || ""}`)}`} target="_blank" rel="noopener noreferrer" onClick={() => { try { navigator.sendBeacon?.(`/api/producers/${p.id}/whatsapp-click`); } catch {} }} className="mt-2 w-full flex items-center justify-center gap-2 bg-[#25D366] text-white rounded-[8px] py-2 font-medium text-sm transition hover:bg-[#20b858]">
              <svg viewBox="0 0 24 24" width="16" height="16" fill="white"><path d="M20.52 3.48A11.9 11.9 0 0012.04 0C5.45 0 .1 5.35.1 11.94c0 2.1.55 4.15 1.6 5.96L0 24l6.27-1.64a11.9 11.9 0 005.77 1.47h.01c6.59 0 11.94-5.35 11.94-11.94 0-3.19-1.24-6.19-3.47-8.41z"/></svg>
              WhatsApp
            </a>
          )}
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
            {/* Legend — collapsible, closed by default, inside sidebar */}
            <details open={legendOpen} onToggle={(e) => setLegendOpen(e.currentTarget.open)} className="mt-2">
              <summary className="text-[11px] text-site-muted tracking-wider font-body uppercase cursor-pointer hover:text-site-text transition select-none">
                קטגוריות {legendOpen ? "▲" : "▼"}
              </summary>
              <div className="mt-1 space-y-0.5">
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
                  <button type="button" onClick={() => setActiveCategoryNames(null)} className="w-full text-[13px] text-primary hover:underline mt-1 pt-1 border-t border-border">הצגי הכל</button>
                )}
              </div>
            </details>
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
          {/* Selected producer detail card — pinned at top of sheet */}
          {selectedProducer && (() => {
            const sp = selectedProducer;
            const spImg = optimizeCloudinary(sp.images?.[0]);
            const spHref = sp.slug ? `/${sp.slug}` : `/producer/${sp.id}`;
            const spPhone = sp.phone?.replace(/\D/g, "");
            return (
              <div className="mb-3 bg-white rounded-[12px] border border-primary overflow-hidden shadow-sm">
                <div className="relative w-full h-[140px]">
                  {spImg ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={spImg} alt={sp.name || ""} className="w-full h-full object-cover" />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center text-5xl" style={{ backgroundColor: "#EAF3DE" }} aria-hidden="true">🌿</div>
                  )}
                  {spImg && (
                    <div className="absolute inset-0 pointer-events-none" style={{ background: "linear-gradient(to top, rgba(0,0,0,0.4), transparent)" }} />
                  )}
                  {/* eslint-disable-next-line no-restricted-syntax -- rtl-ok: map overlay close button, physically positioned */}
                  <button type="button" onClick={() => setSelectedProducer(null)} className="absolute top-2 right-2 w-8 h-8 rounded-full bg-white/90 flex items-center justify-center text-site-muted" aria-label="סגור">
                    <X size={14} weight="bold" />
                  </button>
                </div>
                <div className="p-3">
                  <h3 className="font-headline font-bold text-site-text line-clamp-1" style={{ fontSize: "18px" }}>{sp.name}</h3>
                  <p style={{ fontSize: "13px", color: "#6B6B6B", marginTop: 2 }}>{sp.city}{sp.categories?.[0]?.name ? ` · ${sp.categories[0].name}` : ""}</p>
                  {(sp.is_verified || sp.is_organic || sp.is_kosher) && (
                    <div className="flex flex-wrap gap-1 mt-1.5">
                      {sp.is_verified && <span className="text-[10px] bg-primary/10 text-primary px-1.5 py-0.5 rounded-full">✓ מאומת</span>}
                      {sp.is_organic && <span className="text-[10px] bg-primary/10 text-primary px-1.5 py-0.5 rounded-full">🌿 אורגני</span>}
                      {sp.is_kosher && <span className="text-[10px] bg-primary/10 text-primary px-1.5 py-0.5 rounded-full">✡️ כשר</span>}
                    </div>
                  )}
                  {spPhone && (
                    <a href={`https://wa.me/${spPhone}?text=${encodeURIComponent(`היי! מצאתי אותך במהמקור — ${sp.name || ""}`)}`} target="_blank" rel="noopener noreferrer" onClick={() => { try { navigator.sendBeacon?.(`/api/producers/${sp.id}/whatsapp-click`); } catch {} }} className="mt-2 w-full flex items-center justify-center gap-2 bg-[#25D366] text-white rounded-[8px] py-2.5 font-medium text-sm transition hover:bg-[#20b858]">
                      <svg viewBox="0 0 24 24" width="16" height="16" fill="white"><path d="M20.52 3.48A11.9 11.9 0 0012.04 0C5.45 0 .1 5.35.1 11.94c0 2.1.55 4.15 1.6 5.96L0 24l6.27-1.64a11.9 11.9 0 005.77 1.47h.01c6.59 0 11.94-5.35 11.94-11.94 0-3.19-1.24-6.19-3.47-8.41z"/></svg>
                      WhatsApp
                    </a>
                  )}
                </div>
              </div>
            );
          })()}
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

      {/* MEH-41: location modal — show on first visit when no city saved */}
      <LocationModal
        open={locationModalOpen}
        onClose={() => setLocationModalOpen(false)}
        onSelectCity={handleMapCitySelected}
      />
    </>
  );
}

