"use client";

import { useCallback, useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { Crosshair, MapPinLine, Rows } from "@phosphor-icons/react";

import CitySearch from "@/components/CitySearch";
import LocationModal from "@/components/LocationModal";
import MapBottomSheet from "@/components/MapBottomSheet";
import { showToast } from "@/lib/toast";
import { useUserCity } from "@/lib/use-user-city";

import CityPickerModal from "./components/CityPickerModal";
import DesktopMiniPopup from "./components/DesktopMiniPopup";
import FilterChipsBar from "./components/FilterChipsBar";
import MapCardList from "./components/MapCardList";
import MapPane from "./components/MapPane";
import MobileSheetSelectedCard from "./components/MobileSheetSelectedCard";
import { useFirstVisitHints } from "./state/useFirstVisitHints";
import { useMapFilters } from "./state/useMapFilters";
import { useMapSync } from "./state/useMapSync";
import { useProducersFeed } from "./state/useProducersFeed";

/**
 * /map page shell. Compose-only after MEH-407 PR3 — composes 4 hooks
 * + 6 components + a small set of cross-hook handlers/effects that
 * have to live in the shell to keep the hook composition acyclic.
 *
 * Composition order: hooks → cross-hook handlers/effects → JSX shells.
 * Full split rationale + cycle-break notes in
 * docs/REFACTOR_PLAN.md §File 1 ("Implementation note").
 */
export default function MapPage() {
  // MEH-473: i18n Wave 3.
  const t = useTranslations();
  // Self-contained hook (zero cross-hook inputs after 11a).
  const hints = useFirstVisitHints();

  // Shell-level state lifted out of useFirstVisitHints to break
  // the cycle described in commit 11a:
  const userCityCtx = useUserCity();
  const [showCityPicker, setShowCityPicker] = useState(false);
  const [locationModalOpen, setLocationModalOpen] = useState(false);
  const [gpsLoading, setGpsLoading] = useState(false);
  // Source line 78 — desktop sort dropdown UI state, no consumer outside JSX.
  const [sortBy, setSortBy] = useState("default");

  // MEH-945: on mobile the cookie banner is a fixed overlay that covers the
  // bottom strip of the full-bleed map and clips a marker there. Reserve that
  // strip on the map container only while the banner is showing, so the map
  // shrinks above it (Leaflet's ResizeObserver → invalidateSize recenters and
  // lifts the clipped marker into view). Presence is read off the
  // `--cookie-banner-h` CSS var that CookieBanner publishes on <html> (MEH-850);
  // gating on presence keeps the map full-height once consent is given.
  const [cookieBannerVisible, setCookieBannerVisible] = useState(false);
  useEffect(() => {
    const root = document.documentElement;
    const read = () =>
      setCookieBannerVisible(
        parseFloat(getComputedStyle(root).getPropertyValue("--cookie-banner-h")) > 0
      );
    read();
    const mo = new MutationObserver(read);
    mo.observe(root, { attributes: true, attributeFilter: ["style"] });
    return () => mo.disconnect();
  }, []);

  const feed = useProducersFeed();
  const filters = useMapFilters({
    allProducers: feed.allProducers,
    categories: feed.categories,
    loadProducers: feed.loadProducers,
    userCity: userCityCtx.city,
    setUserCity: userCityCtx.setCity,
    setShowCityPicker,
  });
  const sync = useMapSync({
    chipState: filters.chipState,
    cityFilter: filters.cityFilter,
    buildParams: filters.buildParams,
    setActiveProducerId: filters.setActiveProducerId,
    setSelectedProducer: filters.setSelectedProducer,
    setHoveredProducerId: filters.setHoveredProducerId,
    setMapMoved: filters.setMapMoved,
    setCommittedBounds: filters.setCommittedBounds,
    categories: feed.categories,
    setAllProducers: feed.setAllProducers,
    setShowMapHint: hints.setShowMapHint,
    setSheetSnap: hints.setSheetSnap,
  });

  // ============================================================
  // Cross-hook handlers / effects (lifted from useFirstVisitHints
  // in commit 11a to break the composition cycle). Each is a
  // verbatim move from MapClient.jsx pre-refactor source — the
  // file:line citation in the comment matches the source body.
  // ============================================================

  // Was MapClient.jsx:171-180 — handleMapCitySelected
  const handleMapCitySelected = useCallback((city) => {
    userCityCtx.setCity(city);
    filters.setCityFilter(city);
    feed.loadProducers({ delivery_city: city });
    // NOTE: deliberately no flyTo here. The initial view must stay anchored at
    // the MEH-932 producer-band default ([32.4, 34.95] zoom 8, set in
    // MapComponent.jsx:297-305) — LocationModal only filters
    // the producer list by delivery_city, it doesn't pan the map. Users who
    // want to zoom into their city use the "קרוב אליי" (goToMyLocation)
    // button or pan manually.
  }, [userCityCtx, filters, feed]);

  // Was MapClient.jsx:430-455 — handleGpsClick
  const handleGpsClick = useCallback(() => {
    if (gpsLoading) return;
    if (!navigator.geolocation) {
      showToast.error(t("map.client.errors.no_gps"));
      return;
    }
    setGpsLoading(true);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setGpsLoading(false);
        const { latitude: lat, longitude: lng } = pos.coords;
        if (!lat || !lng || isNaN(lat) || isNaN(lng)) return;
        sync.mapApiRef.current?.getMap()?.flyTo([lat, lng], 13, { duration: 1.2 });
      },
      (err) => {
        setGpsLoading(false);
        // PERMISSION_DENIED → open the city-search fallback instead of a toast,
        // so a denied user isn't left staring at an empty-looking map. Technical
        // failures (position unavailable / timeout) keep the toast.
        if (err.code === 1) {
          setLocationModalOpen(true);
          return;
        }
        const msgs = {
          2: t("map.client.errors.position_unavailable"),
          3: t("map.client.errors.timeout"),
        };
        showToast.error(msgs[err.code] ?? t("map.client.errors.gps_unknown"));
      },
      { timeout: 8000, enableHighAccuracy: true }
    );
  }, [gpsLoading, sync.mapApiRef]);

  // MEH-970: the 800ms first-visit auto-open of LocationModal was removed
  // here — /map now renders immediately on the MEH-932 producer-band default
  // with no blocking location gate. LocationModal remains reachable only as
  // the geolocation permission-denied fallback (handleGpsClick, err.code 1).

  // Was MapClient.jsx:196-215 — focusProducer deep-link effect.
  useEffect(() => {
    if (feed.allProducers.length === 0) return;
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
    filters.setActiveProducerId(focus.id);

    // Give the map a tick to mount + markers to register before flying
    const t = setTimeout(() => {
      sync.mapApiRef.current?.focusProducer(focus.id);
    }, 400);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [feed.allProducers]);

  // ============================================================

  const filterChipsBar = (
    <FilterChipsBar
      visibleCategoryChips={filters.visibleCategoryChips}
      chipState={filters.chipState}
      onCategoryChipClick={filters.onCategoryChipClick}
      onToggleChipClick={filters.onToggleChipClick}
      activeFilterTags={filters.activeFilterTags}
      resetAllFilters={filters.resetAllFilters}
    />
  );

  const mapPane = (
    <MapPane
      producers={filters.filteredByCategory}
      onProducerClick={sync.handleMarkerClick}
      onProducerHover={sync.handleMarkerHover}
      onBoundsChange={sync.handleBoundsChange}
      onMapMove={sync.handleMapMove}
      onMapCanvasClick={sync.handleMapCanvasClick}
      registerApi={sync.registerMapApi}
      mapRef={sync.mapRef}
      visitedIds={hints.visitedIds}
      showMapHint={hints.showMapHint}
      mapMoved={filters.mapMoved}
      onSearchThisArea={sync.handleSearchThisArea}
      visibleProducers={filters.visibleProducers}
      allProducers={feed.allProducers}
      gpsLoading={gpsLoading}
      onGpsClick={handleGpsClick}
      legendOpen={hints.legendOpen}
      legendRef={hints.legendRef}
      onLegendToggle={() => hints.setLegendOpen((v) => !v)}
      isCategoryActive={filters.isCategoryActive}
      toggleCategory={filters.toggleCategory}
      activeCategoryNames={filters.activeCategoryNames}
      setActiveCategoryNames={filters.setActiveCategoryNames}
      viewportCategoryCounts={filters.viewportCategoryCounts}
    />
  );

  const cardList = (
    <MapCardList
      visibleProducers={filters.visibleProducers}
      hoveredProducerId={filters.hoveredProducerId}
      activeProducerId={filters.activeProducerId}
      cardRefs={sync.cardRefs}
      onCardMouseEnter={sync.handleCardMouseEnter}
      onCardMouseLeave={sync.handleCardMouseLeave}
      onCardClick={sync.handleCardClick}
      onResetAll={() => {
        filters.setChipState({ categoryKey: "all", organic: false, has_delivery: false, verified: false, grass_fed: false });
        filters.setActiveCategoryNames(null);
        filters.setCommittedBounds(null);
        filters.setCityFilter("");
        feed.loadProducers();
      }}
    />
  );

  // MEH-826: "near you · {region}" subhead — prefer the user's city, fall back
  // to the active city filter. Empty → subhead hidden (no dangling separator).
  const mapRegion = userCityCtx.city || filters.cityFilter;

  return (
    <>
      {/* =================== DESKTOP (lg+) — split view =================== */}
      <div className="hidden lg:grid" style={{ height: "calc(100vh - 64px)", gridTemplateColumns: hints.splitRatio }}>
        {/* List pane (RTL → first child = right) */}
        <div className="overflow-y-auto border-l border-border flex flex-col">
          <div className="p-4 pb-2 flex items-center justify-between shrink-0">
            <h1 className="font-headline-md text-xl font-bold text-text">{t("map.client.title")}</h1>
            <div className="flex gap-1">
              <button type="button" onClick={() => hints.setSplitRatio("50fr 50fr")} aria-label={t("map.client.aria.split_50_50")} className={`p-1.5 rounded-md transition ${hints.splitRatio.startsWith("50") ? "bg-primary text-white" : "text-fg-muted hover:bg-green-50"}`}>
                <Rows size={18} weight="bold" />
              </button>
              <button type="button" onClick={() => hints.setSplitRatio("25fr 75fr")} aria-label={t("map.client.aria.split_25_75")} className={`p-1.5 rounded-md transition ${hints.splitRatio.startsWith("25") ? "bg-primary text-white" : "text-fg-muted hover:bg-green-50"}`}>
                <MapPinLine size={18} weight="bold" />
              </button>
            </div>
          </div>
          <div className="px-4 pb-3 shrink-0">
            <div className="mb-3">
              <CitySearch id="map-city-search-desktop" label={t("map.client.city_search.label")} value={filters.cityFilter} onChange={filters.setCityFilter} onSubmit={filters.handleCityFilter} placeholder={t("map.client.city_search.placeholder")} />
            </div>
            {filterChipsBar}
          </div>
          <div className="flex-1 overflow-y-auto px-4 pb-4">
            <div className="flex items-start justify-between mb-3">
              {/* MEH-826: locked count copy + "near you · {region}" subhead under it */}
              <div>
                <p className="text-xs text-fg-muted">{t("map.client.business_count", { count: filters.visibleProducers.length })}</p>
                {mapRegion && (
                  <p className="text-[11px] text-fg-muted mt-0.5">{t("map.client.subhead", { region: mapRegion })}</p>
                )}
              </div>
              <select
                value={sortBy}
                onChange={(e) => setSortBy(e.target.value)}
                aria-label={t("map.client.sort.aria_label")}
                className="text-xs text-fg-muted bg-transparent border border-border rounded-md px-2 py-1 focus:border-primary focus:outline-none"
              >
                <option value="default">{t("map.client.sort.nearest")}</option>
                <option value="rating">{t("map.client.sort.top_rated")}</option>
                <option value="newest">{t("map.client.sort.newest")}</option>
              </select>
            </div>
            {cardList}
          </div>
        </div>

        {/* Map pane */}
        <div className="relative">
          {mapPane}
          <DesktopMiniPopup
            selectedProducer={filters.selectedProducer}
            onClose={() => filters.setSelectedProducer(null)}
          />
        </div>
      </div>

      {/* =================== MOBILE (below lg) — full map + sheet =================== */}
      <div className="lg:hidden" style={{ height: "calc(100dvh - 64px)", position: "relative" }}>
        {/* Sticky filter bar — MEH-933: offset below the global sticky header
            band (~64px; mirrors the `calc(100dvh - 64px)` container height above)
            so the city-search pill clears the logo/search header instead of
            colliding with it. top-16 = 64px; the map pt below is bumped by the
            same 64px to keep the bar→content gap unchanged (no collision, no gap). */}
        <div className="absolute top-16 inset-x-0 z-[50] px-3 py-2 bg-background/95 backdrop-blur border-b border-border">
          <div className="flex items-center gap-2 mb-2">
            <div className="flex-1">
              <CitySearch id="map-city-search-mobile" label={t("map.client.city_search.label")} value={filters.cityFilter} onChange={filters.setCityFilter} onSubmit={filters.handleCityFilter} placeholder={t("map.client.city_search.placeholder")} />
            </div>
            <button type="button" onClick={() => sync.mapApiRef.current?.goToMyLocation(() => setLocationModalOpen(true))} className="cursor-pointer shrink-0 min-w-[44px] min-h-[44px] rounded-md border border-border bg-white flex items-center justify-center hover:bg-green-50 transition" aria-label={t("map.client.aria.my_location")}>
              <Crosshair size={18} className="text-primary" />
            </button>
          </div>
          {filterChipsBar}
        </div>

        {/* Map fills the rest — MEH-933: pt = 110 (bar height) + 64 (header offset).
            MEH-945: while the cookie banner shows, reserve its footprint at the
            bottom — its own offset (safe-area + 80px, mirroring CookieBanner.jsx:68)
            plus its live --cookie-banner-h, plus a 16px clearance for the known
            ~10px section overflow (the sticky header occupies ~74px but this
            section subtracts only 64px per MEH-933, spilling ~10px past the
            viewport bottom) — so the banner no longer overlays the canvas.
            The map's own `min-h-[500px]` (MapComponent.jsx) would otherwise spill
            back under the banner on short phones, so relax it to 0 ONLY while we're
            reserving — the shell always has a definite height + invalidateSize, so
            the MEH-30 0px guard isn't needed here. Full height restored on dismiss. */}
        <div
          className={`w-full h-full pt-[174px] ${cookieBannerVisible ? "[&_.leaflet-container]:!min-h-0" : ""}`}
          style={cookieBannerVisible ? { paddingBottom: "calc(env(safe-area-inset-bottom) + 96px + var(--cookie-banner-h, 0px))" } : undefined}
        >
          {mapPane}
        </div>

        {/* Bottom sheet */}
        <MapBottomSheet snap={hints.sheetSnap} onSnapChange={hints.setSheetSnap} count={filters.visibleProducers.length}>
          <MobileSheetSelectedCard
            selectedProducer={filters.selectedProducer}
            onClose={() => filters.setSelectedProducer(null)}
          />
          {cardList}
        </MapBottomSheet>
      </div>

      {/* MEH-58 Phase 3: city picker overlay for "משלוח אליי" chip when no city saved */}
      <CityPickerModal
        open={showCityPicker}
        onClose={() => setShowCityPicker(false)}
        onSelectCity={filters.handleCityPickerSelect}
      />

      {/* MEH-41: location modal — show on first visit when no city saved */}
      <LocationModal
        open={locationModalOpen}
        onClose={() => setLocationModalOpen(false)}
        onSelectCity={handleMapCitySelected}
      />
    </>
  );
}
