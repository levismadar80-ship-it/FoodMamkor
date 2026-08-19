import { useEffect, useMemo, useRef, useState } from "react";

import { CATEGORY_LEGEND } from "@/lib/category-registry";
import {
  CATEGORY_CHIPS,
  TOGGLE_CHIPS,
  chipStateToParams,
  resolveCategoryId,
} from "@/lib/map-chips";
// MEH-2131: the chip-state default is derived from the taxonomy — see the
// useState below for the three-way drift that made a hand-written copy a bad
// idea, and for why `categoryKeys` stays out of it.
import { defaultsForKeys } from "@/lib/filter-taxonomy";
import { haversineKm } from "@/lib/distance";
import { producerInBounds, producerPoints } from "@/lib/producerPoints";

/**
 * Pure client-side ordering for the /map card list — the sort dropdown's
 * first real consumer (the select previously wrote `sortBy` state that
 * nothing read). Returns a NEW array; never mutates the input.
 *
 *   - "nearest": haversine ASC to userLoc; producers without coords last.
 *     Callers must only offer this mode when userLoc exists (the option is
 *     disabled without GPS); with a null userLoc it degrades to feed order.
 *   - "rating":  avg_rating DESC, tiebreak reviews_count DESC; null-rating
 *     producers last (a null is "unrated", worse than any real 0-review 0.0).
 *   - "newest":  the feed's original index order. `created_at` is NOT in the
 *     serialized list payload (ProducerListOut, schemas/schemas.py:702) and
 *     the Zod ProducerSchema would strip it anyway — but GET /producers's
 *     default order IS created_at DESC (producer_listing.py:127), so feed
 *     order == newest-first. (The id-desc alternative is meaningless on
 *     UUID4 ids.) Caveat: after a geo re-query ("חפשו באזור זה") the feed
 *     arrives distance-ordered, and "newest" then reflects that order.
 */
export function sortProducers(list, sortBy, userLoc) {
  if (!Array.isArray(list) || list.length < 2) return list ?? [];
  if (sortBy === "nearest" && userLoc) {
    // MEH-1938 chunk 3: distance to the CLOSEST point via producerPoints()
    // instead of Producer.lat/lng directly (mirrors ProducerCard.jsx /
    // the backend's haversine_min_km COALESCE).
    const dist = (p) => {
      const pts = producerPoints(p);
      return pts.length > 0
        ? Math.min(...pts.map((pt) => haversineKm(userLoc.lat, userLoc.lng, pt.lat, pt.lng)))
        : Infinity;
    };
    return [...list].sort((a, b) => dist(a) - dist(b));
  }
  if (sortBy === "rating") {
    return [...list].sort((a, b) => {
      const aNull = a.avg_rating == null;
      const bNull = b.avg_rating == null;
      if (aNull !== bNull) return aNull ? 1 : -1;
      return (
        (b.avg_rating ?? 0) - (a.avg_rating ?? 0) ||
        (b.reviews_count ?? 0) - (a.reviews_count ?? 0)
      );
    });
  }
  // "newest" (and any unknown key): feed order — see docblock.
  return list;
}

/**
 * Owns all filter / selection state for the /map page and the derived
 * filtered/visible producer lists. Verbatim extraction from
 * MapClient.jsx:41-78, :232-296, :458-500, :503-524.
 *
 * Shape of the state machine (preserved from source):
 *   - `chipState.categoryKeys` ⊆ CATEGORY_CHIPS keys (MEH-1465 multi-select OR;
 *     `[]` = "all"/nothing selected — the reset sentinel)
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
  // MEH-1670: the pickup/market_stand layer toggle, owned by MapClient. The
  // viewport filter needs it so the list drops a business at the same moment
  // the map does — a producer whose only points are hidden pickups is off both.
  showSecondaryLayer = true,
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

  // MEH-14: chip state per the new spec. MEH-1465: categoryKeys is a
  // multi-select OR array (`[]` = "all"/nothing selected); the attribute
  // toggles are independent of it.
  //
  // MEH-1075 completed this to "all TOGGLE_CHIPS keys" by hand, and by MEH-2131
  // the hand-written copy had drifted three ways: it still carried `organic`
  // (the chip and its backend filter were removed in MEH-1259), and it was
  // MISSING `vegetarian` (MEH-1438) and `no_added_sugar` (MEH-1934). Those two
  // worked only through `!undefined` toggling — the exact defect MEH-1075 wrote
  // this literal to fix, reintroduced by the next two axes to land.
  //
  // MEH-2131: derived from the taxonomy instead, so it cannot drift again and
  // `open_for_orders_now` arrives without a fourth hand edit. Behaviour is
  // unchanged for the two missing keys (`undefined` and `false` are both falsy
  // to `chipStateToParams`) and for the dead one (nothing reads `organic`).
  // `categoryKeys` stays explicit — it is not an attribute axis.
  const [chipState, setChipState] = useState({
    categoryKeys: [],
    ...defaultsForKeys(TOGGLE_CHIPS.map((c) => c.key)),
  });

  // MEH-14: build the backend params from the current chip state +
  // optional city. `overrides` lets callers swap in the not-yet-committed
  // chip toggle without waiting for React state.
  const buildParams = (overrideState = chipState, extras = {}) => {
    const params = chipStateToParams(overrideState, categories);
    if (cityFilter) params.delivery_city = cityFilter;
    return { ...params, ...extras };
  };

  // MEH-1075: the sheet's debounced refetch (below) must never outlive a
  // newer instant fetch — a pending timer firing after e.g. a quick-chip
  // click would clobber the fresher results with stale params. Every
  // instant-fetch handler cancels it first (the pending fetch is always
  // subsumed by the newer full-state fetch). Exported for MapClient's
  // inline onResetAll, which fetches through feed.loadProducers directly.
  const sheetFetchTimer = useRef(null);
  const cancelPendingSheetFetch = () => clearTimeout(sheetFetchTimer.current);
  useEffect(() => cancelPendingSheetFetch, []);

  const onCategoryChipClick = (key) => {
    cancelPendingSheetFetch();
    // MEH-1465: multi-select OR. "all" clears the whole set; re-tapping a
    // selected category removes it; any other category is added to the union.
    let categoryKeys;
    if (key === "all") categoryKeys = [];
    else if (chipState.categoryKeys.includes(key))
      categoryKeys = chipState.categoryKeys.filter((k) => k !== key);
    else categoryKeys = [...chipState.categoryKeys, key];
    const next = { ...chipState, categoryKeys };
    setChipState(next);
    loadProducers(buildParams(next));
    setCommittedBounds(null);
    setMapMoved(false);
    setSelectedProducer(null);
    setActiveProducerId(null);
  };

  // MEH-2046 (Option C — non-blocking). The משלוח chip used to return EARLY
  // here: no state change, no fetch, chip visibly dead until a city was picked.
  // On /map that was its primary flow, so the chip's own `?has_delivery=true`
  // never reached the API — and, because the modal then sent `delivery_city`,
  // the parameter was discarded by the service ladder anyway.
  // Now the toggle always applies first and the modal is offered AFTER, as an
  // optional refinement. Dismissing it (MapClient.jsx `onClose` only clears
  // `showCityPicker`) therefore leaves the chip ON and unscoped — "delivers
  // anywhere" — which is a real, useful answer rather than a dead end.
  const applyToggle = (key, { fetch }) => {
    const next = { ...chipState, [key]: !chipState[key] };
    setChipState(next);
    fetch(next);
    setCommittedBounds(null);
    setMapMoved(false);
    setSelectedProducer(null);
    setActiveProducerId(null);
    if (key === "has_delivery" && next.has_delivery && !userCity) {
      setShowCityPicker(true);
    }
  };

  const onToggleChipClick = (key) => {
    cancelPendingSheetFetch();
    applyToggle(key, { fetch: (next) => loadProducers(buildParams(next)) });
  };

  // MEH-1075: sheet-originated toggles — chipState updates IMMEDIATELY (one
  // shared state; the quick chips sync live) but the refetch is debounced so
  // ticking several chips in the open sheet fires one request, not one per
  // click. Quick-chip clicks outside the sheet keep the instant fetch above.
  // MEH-2046: both entry points now share `applyToggle`, so the Option C
  // behaviour cannot drift between the chip row and the sheet — the previous
  // shape duplicated the guard in two places and relied on both being edited
  // together. Only the fetch differs: instant here, debounced there.
  const SHEET_FETCH_DEBOUNCE_MS = 300;

  const onSheetToggleChip = (key) => {
    applyToggle(key, {
      fetch: (next) => {
        clearTimeout(sheetFetchTimer.current);
        sheetFetchTimer.current = setTimeout(
          () => loadProducers(buildParams(next)),
          SHEET_FETCH_DEBOUNCE_MS,
        );
      },
    });
  };

  // MEH-1075: "ניקוי הכל" inside FilterSheet — resets the 7 toggles only.
  // categoryKeys + cityFilter survive (the tag strip's clear-all,
  // resetAllFilters below, still resets everything). Single action → the
  // fetch is instant, and any pending debounced sheet fetch is superseded.
  const clearSheetFilters = () => {
    cancelPendingSheetFetch();
    const next = {
      ...chipState,
      organic: false,
      has_delivery: false,
      pickup_points: false,  // MEH-2046
      verified: false,
      kosher: false,
      grass_fed: false,
      vegan: false,
      gluten_free: false,
      lactose_free: false,
    };
    setChipState(next);
    loadProducers(buildParams(next));
    setCommittedBounds(null);
    setMapMoved(false);
    setSelectedProducer(null);
    setActiveProducerId(null);
  };

  const handleCityPickerSelect = (city) => {
    cancelPendingSheetFetch();
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
    cancelPendingSheetFetch();
    const next = {
      categoryKeys: [],
      organic: false,
      has_delivery: false,
      pickup_points: false,  // MEH-2046
      verified: false,
      kosher: false,
      grass_fed: false,
      vegan: false,
      gluten_free: false,
      lactose_free: false,
    };
    setChipState(next);
    loadProducers(buildParams(next));
    setCommittedBounds(null);
    setMapMoved(false);
    setSelectedProducer(null);
    setActiveProducerId(null);
  };

  const handleCityFilter = () => {
    cancelPendingSheetFetch();
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
    // MEH-1670: was a direct Producer.lat/lng comparison, which dropped a
    // delivery-only business (coords NULL, MEH-1402) out of the list while its
    // pickup pin sat on screen. producerInBounds derives points the same way the
    // marker layer does, so map and list agree by construction.
    return filteredByCategory.filter((p) =>
      producerInBounds(p, committedBounds, { includeSecondary: showSecondaryLayer }),
    );
  }, [filteredByCategory, committedBounds, showSecondaryLayer]);

  // MEH-722: per-category producer counts for the CURRENT viewport, computed
  // PRE category filter (from allProducers ∩ committedBounds, NOT visibleProducers
  // which is already category-filtered). Lets the legend disable a category with
  // 0 businesses in view. committedBounds null (initial / post-reset) → count the
  // whole country. Recomputes on pan via committedBounds change.
  const viewportCategoryCounts = useMemo(() => {
    const inView = !committedBounds
      ? allProducers
      // MEH-1670: same derivation as the list above — otherwise a chip could
      // read 0 while its card is visible in the list.
      : allProducers.filter((p) =>
          producerInBounds(p, committedBounds, { includeSecondary: showSecondaryLayer }),
        );
    const counts = {};
    for (const p of inView) {
      const cat = p.categories?.[0]?.name;
      if (cat) counts[cat] = (counts[cat] ?? 0) + 1;
    }
    return counts;
  }, [allProducers, committedBounds, showSecondaryLayer]);

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
  // MEH-1368 / MEH-1181-A tag-strip rule: removable tags represent ATTRIBUTES
  // ONLY. A category selection is shown by its chip ring in the category row,
  // never mirrored as a removable tag — its exit affordance is the "כל" chip.
  // ("נקו הכל" → resetAllFilters still clears BOTH categories and attributes.)
  const activeFilterTags = useMemo(() => {
    const tags = [];
    TOGGLE_CHIPS.forEach((c) => {
      if (chipState[c.key]) tags.push({ kind: "toggle", key: c.key, label: c.label });
    });
    return tags;
  }, [chipState]);

  // MEH-1368: count of ALL active attribute toggles — drives the inline
  // "סינון · N" count on the FilterChipsBar button. Replaces the old corner
  // badge's sheet-only count (countActiveSheetOnlyFilters), now that the inline
  // quick-chip row is gone and every attribute lives in FilterSheet.
  const activeAttributeCount = useMemo(
    () => TOGGLE_CHIPS.filter((c) => chipState[c.key]).length,
    [chipState],
  );

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
    onSheetToggleChip,
    clearSheetFilters,
    cancelPendingSheetFetch,
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
    activeAttributeCount,
  };
}
