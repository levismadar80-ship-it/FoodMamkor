import { useEffect, useMemo, useState } from "react";

import { CATEGORY_LEGEND } from "@/lib/map-categories";
import {
  CATEGORY_CHIPS,
  TOGGLE_CHIPS,
  chipStateToParams,
  resolveCategoryId,
} from "@/lib/map-chips";

/**
 * Owns all filter / selection state for the /map page and the derived
 * filtered/visible producer lists. Verbatim extraction from
 * MapClient.jsx:41-78, :232-296, :458-500, :503-524.
 *
 * Shape of the state machine (preserved from source):
 *   - `chipState.categoryKey` ∈ CATEGORY_CHIPS keys (one active or "all")
 *   - `chipState.organic / has_delivery / verified / grass_fed` independent toggles
 *   - `cityFilter` is the city-search input (text)
 *   - `committedBounds` is the bounds the LIST is filtered by — set
 *     either by chip changes (cleared) or by the "search this area"
 *     button (set, via useMapSync.handleSearchThisArea)
 *   - `activeCategoryNames === null` means "all enabled" (legend default)
 *
 * Cross-hook dependencies are passed in:
 *   - `loadProducers` from useProducersFeed
 *   - `userCity` / `setUserCity` / `setShowCityPicker` from useFirstVisitHints
 *
 * The selection state (selectedProducer / activeProducerId / hoveredProducerId)
 * lives here because chip changes need to clear them in onCategoryChipClick
 * etc; useMapSync also writes them, but reads/writes are purely setter calls
 * passed across the hook boundary.
 */
export function useMapFilters({
  allProducers,
  categories,
  loadProducers,
  userCity,
  setUserCity,
  setShowCityPicker,
}) {
  const [cityFilter, setCityFilter] = useState("");
  const [committedBounds, setCommittedBounds] = useState(null);
  const [activeProducerId, setActiveProducerId] = useState(null);
  const [hoveredProducerId, setHoveredProducerId] = useState(null);
  const [mapMoved, setMapMoved] = useState(false);
  const [selectedProducer, setSelectedProducer] = useState(null);
  const [activeCategoryNames, setActiveCategoryNames] = useState(null);

  // MEH-30 follow-up: when the bottom sheet is open, mark the body so
  // CSS can hide the CookieBanner (which otherwise peeks below the
  // sheet's bottom edge — see globals.css `.sheet-open` rule).
  // Co-located with selectedProducer ownership; was MapClient.jsx:185-193.
  useEffect(() => {
    if (typeof document === "undefined") return;
    if (selectedProducer) {
      document.body.classList.add("sheet-open");
    } else {
      document.body.classList.remove("sheet-open");
    }
    return () => document.body.classList.remove("sheet-open");
  }, [selectedProducer]);

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

  const resetAllFilters = () => {
    const next = {
      categoryKey: "all",
      organic: false,
      has_delivery: false,
      verified: false,
      grass_fed: false,
    };
    setChipState(next);
    loadProducers(buildParams(next));
    setCommittedBounds(null);
    setMapMoved(false);
    setSelectedProducer(null);
    setActiveProducerId(null);
  };

  const handleCityFilter = () => {
    loadProducers(buildParams());
    // When the user changes city, clear any committed bounds filter so
    // the grid shows ALL matches for the new city — not a stale viewport
    // from the previous city.
    setCommittedBounds(null);
    setMapMoved(false);
  };

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

  // MEH-722: per-category producer counts for the CURRENT viewport, computed
  // PRE category filter (from allProducers ∩ committedBounds, NOT visibleProducers
  // which is already category-filtered). Lets the legend disable a category with
  // 0 businesses in view. committedBounds null (initial / post-reset) → count the
  // whole country. Recomputes on pan via committedBounds change.
  const viewportCategoryCounts = useMemo(() => {
    const inView = !committedBounds
      ? allProducers
      : allProducers.filter(
          (p) =>
            typeof p.lat === "number" &&
            typeof p.lng === "number" &&
            p.lat >= committedBounds.south &&
            p.lat <= committedBounds.north &&
            p.lng >= committedBounds.west &&
            p.lng <= committedBounds.east,
        );
    const counts = {};
    for (const p of inView) {
      const cat = p.categories?.[0]?.name;
      if (cat) counts[cat] = (counts[cat] ?? 0) + 1;
    }
    return counts;
  }, [allProducers, committedBounds]);

  // Category chips visible in the current DB (hidden if no matching category loaded yet)
  const visibleCategoryChips = useMemo(
    () =>
      categories.length > 0
        ? CATEGORY_CHIPS.filter(
            (c) => c.key === "all" || resolveCategoryId(c, categories) != null,
          )
        : CATEGORY_CHIPS,
    [categories],
  );

  // Active filters — each tag carries the key needed to remove it.
  const activeFilterTags = useMemo(() => {
    const tags = [];
    if (chipState.categoryKey && chipState.categoryKey !== "all") {
      const cat = CATEGORY_CHIPS.find((c) => c.key === chipState.categoryKey);
      if (cat) tags.push({ kind: "category", key: cat.key, label: cat.label });
    }
    TOGGLE_CHIPS.forEach((c) => {
      if (chipState[c.key]) tags.push({ kind: "toggle", key: c.key, label: c.label });
    });
    return tags;
  }, [chipState]);

  return {
    // state
    chipState,
    setChipState,
    cityFilter,
    setCityFilter,
    activeCategoryNames,
    setActiveCategoryNames,
    committedBounds,
    setCommittedBounds,
    mapMoved,
    setMapMoved,
    selectedProducer,
    setSelectedProducer,
    activeProducerId,
    setActiveProducerId,
    hoveredProducerId,
    setHoveredProducerId,
    // handlers
    buildParams,
    onCategoryChipClick,
    onToggleChipClick,
    handleCityPickerSelect,
    resetAllFilters,
    handleCityFilter,
    toggleCategory,
    isCategoryActive,
    // derived
    filteredByCategory,
    visibleProducers,
    viewportCategoryCounts,
    visibleCategoryChips,
    activeFilterTags,
  };
}
