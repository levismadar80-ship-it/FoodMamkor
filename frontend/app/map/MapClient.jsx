"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  Crosshair,
  MapPinLine,
  Rows,
  X,
} from "@phosphor-icons/react";

import CitySearch from "@/components/CitySearch";
import LocationModal from "@/components/LocationModal";
import MapBottomSheet from "@/components/MapBottomSheet";
import { optimizeCloudinary } from "@/lib/cloudinary";
import { pingWhatsAppBeacon } from "@/lib/contact-tracking";
import { showToast } from "@/lib/toast";
import { useUserCity } from "@/lib/use-user-city";
import { getWhatsAppHref, normalizePhone } from "@/lib/utils";

import CityPickerModal from "./components/CityPickerModal";
import DesktopMiniPopup from "./components/DesktopMiniPopup";
import FilterChipsBar from "./components/FilterChipsBar";
import MapCardList from "./components/MapCardList";
import MapPane from "./components/MapPane";
import { useFirstVisitHints } from "./state/useFirstVisitHints";
import { useMapFilters } from "./state/useMapFilters";
import { useMapSync } from "./state/useMapSync";
import { useProducersFeed } from "./state/useProducersFeed";

/**
 * /map page shell. Compose-only after MEH-407 PR3 — every meaningful
 * piece of logic now lives in 4 hooks (useFirstVisitHints,
 * useProducersFeed, useMapFilters, useMapSync) and 5 components
 * (FilterChipsBar, MapPane, MapCardList, DesktopMiniPopup,
 * CityPickerModal).
 *
 * Inline in this shell (per the corrective commit 11a):
 *   - useUserCity() lifted from useFirstVisitHints to break the
 *     hook composition cycle
 *   - showCityPicker / locationModalOpen / gpsLoading shell-state
 *   - 3 effects: location-modal trigger, focusProducer deep-link,
 *     and the desktop sortBy state (legacy UI control, source line 78)
 *   - 2 handlers: handleMapCitySelected, handleGpsClick
 *   - 2 layout shells (desktop split-pane + mobile bottom-sheet)
 *   - The mobile-sheet pinned-card IIFE (only consumer of
 *     <MapBottomSheet> children prop, not generalizable)
 *
 * Render-order audit vs source: see commit message of step 11.
 */
export default function MapPage() {
  // Self-contained hook (zero cross-hook inputs after 11a).
  const hints = useFirstVisitHints();

  // Shell-level state lifted out of useFirstVisitHints to break
  // the cycle described in commit 11a:
  const userCityCtx = useUserCity();
  const [showCityPicker, setShowCityPicker] = useState(false);
  const [locationModalOpen, setLocationModalOpen] = useState(false);
  const [gpsLoading, setGpsLoading] = useState(false);
  const locationModalFiredRef = useRef(false);
  // Source line 78 — desktop sort dropdown UI state, no consumer outside JSX.
  const [sortBy, setSortBy] = useState("default");

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
    // [31.7683, 35.2137] zoom 8 (country-wide) — LocationModal only filters
    // the producer list by delivery_city, it doesn't pan the map. Users who
    // want to zoom into their city use the "קרוב אליי" (goToMyLocation)
    // button or pan manually.
  }, [userCityCtx, filters, feed]);

  // Was MapClient.jsx:430-455 — handleGpsClick
  const handleGpsClick = useCallback(() => {
    if (gpsLoading) return;
    if (!navigator.geolocation) {
      showToast("הדפדפן שלך לא תומך ב-GPS", "error");
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
        const msgs = {
          1: "לא ניתן גישה למיקום. אפשרי בהגדרות הדפדפן.",
          2: "המיקום שלך לא זמין. נסי מאוחר יותר.",
          3: "לקח יותר מדי זמן. נסי שוב.",
        };
        showToast(msgs[err.code] ?? "לא הצלחנו לקבל את המיקום שלך", "error");
      },
      { timeout: 8000, enableHighAccuracy: true }
    );
  }, [gpsLoading, sync.mapApiRef]);

  // Was MapClient.jsx:162-169 — location-modal trigger effect.
  // Depends on userCity so the effect re-runs when use-user-city
  // hydrates from localStorage (initialises null, then sets the
  // real value in its own useEffect). Without the dependency the
  // 800ms timer fires even when a city IS already saved — stale
  // closure on null.
  useEffect(() => {
    if (locationModalFiredRef.current || userCityCtx.city) return;
    const timer = setTimeout(() => {
      locationModalFiredRef.current = true;
      setLocationModalOpen(true);
    }, 800);
    return () => clearTimeout(timer);
  }, [userCityCtx.city]);

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

  return (
    <>
      {/* =================== DESKTOP (lg+) — split view =================== */}
      <div className="hidden lg:grid" style={{ height: "calc(100vh - 64px)", gridTemplateColumns: hints.splitRatio }}>
        {/* List pane (RTL → first child = right) */}
        <div className="overflow-y-auto border-l border-border flex flex-col">
          <div className="p-4 pb-2 flex items-center justify-between shrink-0">
            <h1 className="font-headline text-xl font-bold text-site-text">מפת בתי עסק</h1>
            <div className="flex gap-1">
              <button type="button" onClick={() => hints.setSplitRatio("50fr 50fr")} aria-label="תצוגה 50/50" className={`p-1.5 rounded-md transition ${hints.splitRatio.startsWith("50") ? "bg-primary text-white" : "text-site-muted hover:bg-light"}`}>
                <Rows size={18} weight="bold" />
              </button>
              <button type="button" onClick={() => hints.setSplitRatio("25fr 75fr")} aria-label="תצוגה 25/75" className={`p-1.5 rounded-md transition ${hints.splitRatio.startsWith("25") ? "bg-primary text-white" : "text-site-muted hover:bg-light"}`}>
                <MapPinLine size={18} weight="bold" />
              </button>
            </div>
          </div>
          <div className="px-4 pb-3 shrink-0">
            <div className="mb-3">
              <CitySearch id="map-city-search-desktop" label="סנן לפי עיר" value={filters.cityFilter} onChange={filters.setCityFilter} onSubmit={filters.handleCityFilter} placeholder="חפשי עיר..." />
            </div>
            {filterChipsBar}
          </div>
          <div className="flex-1 overflow-y-auto px-4 pb-4">
            <div className="flex items-center justify-between mb-3">
              <p className="text-xs text-site-muted">{filters.visibleProducers.length} בתי עסק</p>
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
          <DesktopMiniPopup
            selectedProducer={filters.selectedProducer}
            onClose={() => filters.setSelectedProducer(null)}
          />
        </div>
      </div>

      {/* =================== MOBILE (below lg) — full map + sheet =================== */}
      <div className="lg:hidden" style={{ height: "calc(100dvh - 64px)", position: "relative" }}>
        {/* Sticky filter bar at top */}
        <div className="absolute top-0 inset-x-0 z-[50] px-3 py-2 bg-background/95 backdrop-blur border-b border-border">
          <div className="flex items-center gap-2 mb-2">
            <div className="flex-1">
              <CitySearch id="map-city-search-mobile" label="סנן לפי עיר" value={filters.cityFilter} onChange={filters.setCityFilter} onSubmit={filters.handleCityFilter} placeholder="חפשי עיר..." />
            </div>
            <button type="button" onClick={() => sync.mapApiRef.current?.goToMyLocation()} className="cursor-pointer shrink-0 w-10 h-10 rounded-[10px] border border-border bg-white flex items-center justify-center hover:bg-light transition" aria-label="קרוב אלי">
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
        <MapBottomSheet snap={hints.sheetSnap} onSnapChange={hints.setSheetSnap} count={filters.visibleProducers.length}>
          {/* Selected producer detail card — pinned at top of sheet */}
          {filters.selectedProducer && (() => {
            const sp = filters.selectedProducer;
            const spImg = optimizeCloudinary(sp.images?.[0]);
            const spHref = sp.slug ? `/${sp.slug}` : `/producer/${sp.id}`;
            const spPhone = normalizePhone(sp.phone);
            return (
              <div className="mb-3 bg-white rounded-[12px] border border-primary overflow-hidden shadow-sm">
                <div className="relative w-full h-[140px]">
                  {spImg ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={spImg} alt={sp.name || ""} className="w-full h-full object-cover" />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center text-5xl bg-light" aria-hidden="true">🌿</div>
                  )}
                  {spImg && (
                    <div className="absolute inset-0 pointer-events-none" style={{ background: "linear-gradient(to top, rgba(0,0,0,0.4), transparent)" }} />
                  )}
                  {/* eslint-disable-next-line no-restricted-syntax -- rtl-ok: map overlay close button, physically positioned */}
                  <button type="button" onClick={() => filters.setSelectedProducer(null)} className="absolute top-2 right-2 w-8 h-8 rounded-full bg-white/90 flex items-center justify-center text-site-muted" aria-label="סגור">
                    <X size={14} weight="bold" />
                  </button>
                </div>
                <div className="p-3">
                  <h3 className="font-headline font-bold text-site-text line-clamp-1" style={{ fontSize: "18px" }}>{sp.name}</h3>
                  <p className="text-[13px] text-site-muted mt-0.5">{sp.city}{sp.categories?.[0]?.name ? ` · ${sp.categories[0].name}` : ""}</p>
                  {(sp.is_verified || sp.is_organic || sp.is_kosher) && (
                    <div className="flex flex-wrap gap-1 mt-1.5">
                      {sp.is_verified && <span className="text-[10px] bg-primary/10 text-primary px-1.5 py-0.5 rounded-full">✓ מאומת</span>}
                      {sp.is_organic && <span className="text-[10px] bg-primary/10 text-primary px-1.5 py-0.5 rounded-full">🌿 אורגני</span>}
                      {sp.is_kosher && <span className="text-[10px] bg-primary/10 text-primary px-1.5 py-0.5 rounded-full">✡️ כשר</span>}
                    </div>
                  )}
                  {spPhone && (
                    <a href={getWhatsAppHref(spPhone, `היי! מצאתי אותך במהמקור — ${sp.name || ""}`)} target="_blank" rel="noopener noreferrer" onClick={() => pingWhatsAppBeacon(sp.id)} className="btn-whatsapp mt-2 w-full flex items-center justify-center gap-2 rounded-[8px] py-2.5 font-medium text-sm">
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
