"use client";

import dynamic from "next/dynamic";
import Link from "next/link";
import {
  CircleNotch,
  Leaf,
  MagnifyingGlass,
  MapTrifold,
  NavigationArrow,
  SquaresFour,
} from "@phosphor-icons/react";

import { CATEGORY_LEGEND } from "@/lib/map-categories";

// Dynamic <MapComponent/> with SSR disabled — moved verbatim from
// MapClient.jsx:28-36. The Hebrew loading text and pulse styling
// are part of the user-visible map mount sequence.
const MapComponent = dynamic(() => import("@/components/MapComponent"), {
  ssr: false,
  loading: () => (
    <div className="w-full h-full rounded-[12px] bg-light animate-pulse flex flex-col items-center justify-center gap-3">
      <MapTrifold size={48} weight="duotone" className="text-primary/30" />
      <p className="text-site-muted text-sm">טוענת מפה...</p>
    </div>
  ),
});

/**
 * Map pane shared by desktop split-pane and mobile bottom-sheet
 * shells. Verbatim move of the `mapPane` JSX const from
 * MapClient.jsx:577-664 — the dynamic <MapComponent/>, the
 * showMapHint overlay, the "search this area" button, the
 * empty-state card, the desktop-only GPS center button, and the
 * collapsible category legend.
 *
 * RTL exception zone: this component carries 4 of MapClient's 6
 * `// rtl-ok` annotations. Physical left/right CSS is preserved
 * verbatim because /map controls are geographically positioned —
 * see .claude/rules/rtl.md → "Map z-index tokens" and the
 * "Intentional physical-property exceptions" list.
 *
 * Z-index tokens preserved verbatim:
 *   z-[800] legend ・ z-[900] showMapHint ・ z-[1000] (×3) for
 *   "search this area", empty-state card, and desktop GPS button.
 *   See .claude/rules/rtl.md → "Map z-index tokens".
 */
export default function MapPane({
  // <MapComponent/> wiring
  producers,
  onProducerClick,
  onProducerHover,
  onBoundsChange,
  onMapMove,
  onMapCanvasClick,
  registerApi,
  mapRef,
  visitedIds,
  // overlay state + handlers
  showMapHint,
  mapMoved,
  onSearchThisArea,
  visibleProducers,
  allProducers,
  // GPS button (desktop)
  gpsLoading,
  onGpsClick,
  // legend
  legendOpen,
  legendRef,
  onLegendToggle,
  isCategoryActive,
  toggleCategory,
  activeCategoryNames,
  setActiveCategoryNames,
}) {
  return (
    <div className="relative w-full h-full">
      <MapComponent
        producers={producers}
        onProducerClick={onProducerClick}
        onProducerHover={onProducerHover}
        onBoundsChange={onBoundsChange}
        onMapMove={onMapMove}
        onMapCanvasClick={onMapCanvasClick}
        registerApi={registerApi}
        mapRef={mapRef}
        visitedIds={visitedIds}
      />
      {showMapHint && (
        <div
          // eslint-disable-next-line no-restricted-syntax -- rtl-ok: horizontal centering idiom
          className="absolute top-4 left-1/2 -translate-x-1/2 z-[900] px-5 py-2.5 rounded-[10px] bg-primary-dark text-white text-sm font-medium shadow-lg animate-[slide-up_0.25s_ease-out] pointer-events-none"
          role="status"
        >
          לחצי על סמן עסק כדי לראות פרטים · גלגלי ברשימה מימין לכל העסקים
        </div>
      )}
      {mapMoved && (
        // eslint-disable-next-line no-restricted-syntax -- rtl-ok: horizontal centering idiom
        <div className="absolute top-4 left-1/2 -translate-x-1/2 z-[1000]">
          <button type="button" onClick={(e) => { e.stopPropagation(); onSearchThisArea(); }} className="bg-white border border-border rounded-full px-5 py-2.5 text-sm font-medium shadow-[0_2px_12px_rgba(0,0,0,0.12)] hover:bg-light transition flex items-center gap-2 focus-visible:ring-2 focus-visible:ring-primary/40">
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

      {/* GPS center button — desktop only; mobile has one in the filter bar */}
      <button
        type="button"
        onClick={onGpsClick}
        disabled={gpsLoading}
        aria-label="מרכזי את המפה על המיקום שלי"
        className="hidden lg:flex absolute bottom-24 end-4 w-11 h-11 rounded-full bg-background border border-border shadow-md items-center justify-center text-primary hover:bg-light transition-colors z-[1000] focus-visible:ring-2 focus-visible:ring-primary/40 disabled:opacity-60"
      >
        {gpsLoading
          ? <CircleNotch size={20} className="animate-spin" aria-hidden="true" />
          : <NavigationArrow size={20} weight="fill" aria-hidden="true" />
        }
      </button>

      {/* Collapsible category legend — desktop only; mobile sees emoji on markers */}
      {/* rtl-ok: map overlay, physical left = map-canvas start */}
      <div ref={legendRef} className="hidden md:block absolute bottom-4 left-4 z-[800]">
        {legendOpen && (
          <div className="mb-2 bg-white border border-border rounded-lg shadow-[0_4px_16px_rgba(0,0,0,0.12)] p-2 min-w-[180px]" role="group" aria-label="קטגוריות">
            <div className="space-y-0.5">
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
          </div>
        )}
        <button
          type="button"
          onClick={onLegendToggle}
          aria-label="קטגוריות"
          aria-expanded={legendOpen}
          className="w-8 h-8 rounded-full bg-white border border-[#e5e7eb] shadow-[0_2px_8px_rgba(0,0,0,0.1)] flex items-center justify-center hover:bg-light transition focus-visible:ring-2 focus-visible:ring-primary/40"
        >
          <SquaresFour size={16} weight="bold" className="text-site-text" />
        </button>
      </div>
    </div>
  );
}
