"use client";

import dynamic from "next/dynamic";
import Link from "next/link";
import { useTranslations } from "next-intl";
import {
  CircleNotch,
  Leaf,
  MagnifyingGlass,
  MapTrifold,
  NavigationArrow,
  SquaresFour,
} from "@phosphor-icons/react";

import { CATEGORY_LEGEND } from "@/lib/map-categories";

// MEH-473: extracted to a real component so useTranslations() works.
// next/dynamic's loading callback runs outside any component's render
// context, so hooks can't be called inline; wrapping in MapLoadingState
// gives us a proper render-time t() call.
function MapLoadingState() {
  const t = useTranslations();
  return (
    <div className="w-full h-full rounded-md bg-background animate-pulse flex flex-col items-center justify-center gap-3">
      <MapTrifold size={48} className="text-primary/30" />
      <p className="text-fg-muted text-sm">{t("map.client.loading_map")}</p>
    </div>
  );
}

// Dynamic <MapComponent/> with SSR disabled — moved verbatim from
// MapClient.jsx:28-36. The Hebrew loading text and pulse styling
// are part of the user-visible map mount sequence.
const MapComponent = dynamic(() => import("@/components/MapComponent"), {
  ssr: false,
  loading: () => <MapLoadingState />,
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
  viewportCategoryCounts,
}) {
  const t = useTranslations();
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
          className="absolute top-4 left-1/2 -translate-x-1/2 z-[900] px-5 py-2.5 rounded-md bg-primary-dark text-white text-sm font-medium shadow-lg animate-[slide-up_0.25s_ease-out] pointer-events-none"
          role="status"
        >
          {t("map.pane.hint")}
        </div>
      )}
      {mapMoved && (
        // eslint-disable-next-line no-restricted-syntax -- rtl-ok: horizontal centering idiom
        <div className="absolute top-4 left-1/2 -translate-x-1/2 z-[1000]">
          <button type="button" onClick={(e) => { e.stopPropagation(); onSearchThisArea(); }} className="bg-surface-floating border border-border rounded-full px-5 py-2.5 text-sm font-medium hover:bg-green-50 transition flex items-center gap-2 focus-visible:ring-2 focus-visible:ring-primary/40">
            <MagnifyingGlass size={16} weight="bold" className="text-primary" />
            {t("map.pane.search_this_area")}
          </button>
        </div>
      )}
      {!mapMoved && visibleProducers.length === 0 && allProducers.length > 0 && (
        // eslint-disable-next-line no-restricted-syntax -- rtl-ok: horizontal centering idiom
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 z-[1000] bg-surface-floating rounded-lg border border-border p-6 text-center max-w-[280px]" role="status">
          <Leaf size={44} className="text-primary mx-auto mb-3" aria-hidden="true" />
          <h3 className="font-headline-md text-lg font-bold text-text mb-2">{t("map.pane.empty.heading")}</h3>
          <p className="text-fg-muted text-sm mb-4">{t("map.pane.empty.body")}</p>
          <Link href="/register/producer" className="inline-block bg-primary text-white px-4 py-2 rounded-sm text-sm hover:bg-primary-dark transition">{t("map.pane.empty.cta")}</Link>
        </div>
      )}

      {/* GPS center button — desktop only; mobile has one in the filter bar */}
      <button
        type="button"
        onClick={onGpsClick}
        disabled={gpsLoading}
        aria-label={t("map.pane.aria.center_on_me")}
        className="hidden lg:flex absolute bottom-24 end-4 w-11 h-11 rounded-full bg-background border border-border items-center justify-center text-primary hover:bg-green-50 transition-colors z-[1000] focus-visible:ring-2 focus-visible:ring-primary/40 disabled:opacity-60"
      >
        {gpsLoading
          ? <CircleNotch size={20} className="animate-spin" aria-hidden="true" />
          : <NavigationArrow size={20} weight="fill" aria-hidden="true" />
        }
      </button>

      {/* Collapsible category legend — desktop only (mobile reads identity off the photo markers). */}
      {/* rtl-ok: map overlay, physical left = map-canvas start */}
      <div ref={legendRef} className="hidden md:block absolute bottom-4 left-4 z-[800]">
        {legendOpen && (
          <div className="mb-2 bg-surface-floating border border-border rounded-lg p-2 min-w-[180px]" role="group" aria-label={t("map.pane.aria.categories")}>
            <div className="space-y-0.5">
              {CATEGORY_LEGEND.map((cat) => {
                const catActive = isCategoryActive(cat.name);
                // MEH-722: 0 businesses in the current viewport → dead-end row.
                // Empty + inactive → fully disabled (no click). Empty + active →
                // stays clickable so the user can toggle out of an empty filter.
                const isEmpty = (viewportCategoryCounts?.[cat.name] ?? 0) === 0;
                const disabled = isEmpty && !catActive;
                const opacity = catActive
                  ? (isEmpty ? "opacity-60" : "opacity-100")
                  : (isEmpty ? "opacity-30" : "opacity-40");
                // F2 (MEH-763): pins no longer carry a category colour, so the
                // legend leads with the category Phosphor icon (identity); the
                // colour stays only as the icon's tint (secondary channel).
                // MEH-798: the bare icon becomes a 20px circle — light
                // category-colour wash (~10% alpha of the same map-categories
                // hex) behind a 12px icon in the full category colour. Flat
                // (F1) — no shadow. Click/aria/opacity behavior unchanged.
                const Icon = cat.icon;
                return (
                  <button key={cat.name} type="button" onClick={disabled ? undefined : () => toggleCategory(cat.name)} disabled={disabled} aria-disabled={disabled} className={`w-full flex items-center gap-2 px-1.5 py-1 rounded-md text-start transition ${opacity} ${disabled ? "cursor-not-allowed" : "hover:bg-green-50"}`} aria-pressed={catActive}>
                    <span
                      className="shrink-0 w-5 h-5 rounded-full flex items-center justify-center"
                      style={{ backgroundColor: `${cat.color}1A` }}
                      aria-hidden="true"
                    >
                      <Icon size={12} weight="fill" style={{ color: cat.color }} />
                    </span>
                    <span className="text-xs text-text">{cat.name.split(",")[0]}</span>
                  </button>
                );
              })}
              {activeCategoryNames !== null && (
                <button type="button" onClick={() => setActiveCategoryNames(null)} className="w-full text-[13px] text-primary hover:underline mt-1 pt-1 border-t border-border">{t("map.pane.show_all")}</button>
              )}
            </div>
          </div>
        )}
        <button
          type="button"
          onClick={onLegendToggle}
          aria-label={t("map.pane.aria.categories")}
          aria-expanded={legendOpen}
          className="w-8 h-8 rounded-full bg-surface-floating border border-border flex items-center justify-center hover:bg-green-50 transition focus-visible:ring-2 focus-visible:ring-primary/40"
        >
          <SquaresFour size={16} weight="bold" className="text-text" />
        </button>
      </div>
    </div>
  );
}
