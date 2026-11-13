"use client";

import dynamic from "next/dynamic";

import { useTranslations } from "next-intl";
import {
  CircleNotch,
  Leaf,
  MagnifyingGlass,
  MapTrifold,
  NavigationArrow,
  SquaresFour,
} from "@phosphor-icons/react";

import { CATEGORY_LEGEND } from "@/lib/category-registry";
import MapKey from "./MapKey";

// NearMePill sits at sheet-edge + 12px and is 44px tall; +12px again clears it.
const NEAR_ME_STACK_OFFSET_PX = 68;

// MEH-2517: `bottom` for a control in the mobile sheet-edge column, `offsetPx`
// above the sheet's top edge. The pane's bottom is the viewport's only while
// no cookie banner shows. With the banner up, MapClient pads the pane wrapper
// by the banner's footprint and publishes that length as --map-pane-reserve.
// A ride measured from the pane's bottom would count the strip twice. Measured
// at 375x667 before this: the column climbed to y=240, the key circle sat on
// «סינון», and axe target-size failed on both Leaflet zoom buttons. So the
// reserve is subtracted, and the result is floored at the slot the control
// would hold with NearMePill out of the column, because with the banner up the
// pill is behind the banner. With no banner the reserve is 0 and the floor
// never wins (sheet height + offset > offset - 56), so nothing moves.
const sheetRide = (offsetPx) =>
  `max(calc(var(--map-sheet-h, 14vh) + ${offsetPx}px - var(--map-pane-reserve, 0px)), ${offsetPx - NEAR_ME_STACK_OFFSET_PX + 12}px)`;

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
 * "search this area" button, the empty-state card, the desktop-only
 * GPS center button, and the collapsible category legend.
 *
 * RTL exception zone: this component carries 4 of MapClient's 6
 * `// rtl-ok` annotations. Physical left/right CSS is preserved
 * verbatim because /map controls are geographically positioned —
 * see .claude/rules/rtl.md → "Map z-index tokens" and the
 * "Intentional physical-property exceptions" list.
 *
 * Z-index tokens preserved verbatim:
 *   z-[800] legend ・ z-[1000] (×3) for "search this area",
 *   empty-state card, and desktop GPS button.
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
  // Sapir 13/11: the pickup-layer toggle (MEH-1412) and its reminder (MEH-2046)
  // are gone. Pickup points are always drawn; MapComponent defaults
  // showSecondaryLayer to true.
  // MEH-1611: id of the selected business (focus-on-select demote). Pure
  // pass-through — MapClient owns the state, MapComponent renders the effect.
  focusedProducerId,
  // overlay state + handlers
  mapMoved,
  onSearchThisArea,
  visibleProducers,
  allProducers,
  // MEH-2425: a filter is on, and the reset that clears every filter.
  filtered = false,
  onResetFilters,
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
        focusedProducerId={focusedProducerId}
      />


      {/* MEH-2148: ONE owner for the top-centre slot. Both of these used to be
          their own `absolute top-4 z-1000` — the search-area pill centred, the
          pickup notice at the inline start with `max-w-[240px]` — so at 375px
          they were laid out at the same y with overlapping x and simply drew on
          top of each other, and which one won was z-order tie-breaking by
          document order rather than a decision.

          This is the MEH-1187 rule from the GPS button below, applied to the
          other end of the pane: one corner, one job. A flex column owns the
          slot; whatever renders lands IN it, in order, and two things showing at
          once stack instead of collide. Adding a third top-centre element means
          adding a child here, not another `absolute`.

          `pointer-events-none` on the stack with `-auto` on each child: the
          column spans the full width at `top-4`, so without it this strip would
          swallow drags and clicks on the map underneath across the whole pane.
          Same shield idiom as BottomNav.jsx:358 and the Header.

          13/11: the pickup notice left with the layer toggle, so the
          search-area pill is the slot's only child for now. */}
      {/* MEH-2148: gated so the strip is absent from the DOM when nothing
          renders in it, which is the common case. `pointer-events-none` already made
          an empty wrapper harmless, but harmless is not absent -- a full-width
          transparent element across the top of the pane is something a future
          hit-test or a11y sweep would still have to reason about. */}
      {mapMoved && (
        <div className="absolute top-4 inset-x-0 z-[1000] px-4 flex flex-col items-center gap-2 pointer-events-none">
          <div className="pointer-events-auto">
            <button type="button" data-testid="map-search-this-area" onClick={(e) => { e.stopPropagation(); onSearchThisArea(); }} className="bg-surface-floating border border-border rounded-full px-5 py-2.5 text-sm font-medium hover:bg-green-50 transition flex items-center gap-2 focus-visible:ring-2 focus-visible:ring-primary/40">
                <MagnifyingGlass size={16} weight="bold" className="text-primary" />
                {t("map.pane.search_this_area")}
              </button>
          </div>
        </div>
      )}
      {!mapMoved && visibleProducers.length === 0 && allProducers.length > 0 && (
        // eslint-disable-next-line no-restricted-syntax -- rtl-ok: horizontal centering idiom
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 z-[1000] bg-surface-floating rounded-lg border border-border p-6 text-center max-w-[280px]" role="status">
          <Leaf size={44} className="text-primary mx-auto mb-3" aria-hidden="true" />
          {/* MEH-2425: this overlay fires when the loaded set is non-empty but
              nothing survives the client-side filters — i.e. mostly BECAUSE of
              a filter. "אין עסקים באזור זה עדיין" + "הוסיפו עסק" read as an
              empty region there; with a filter on it names the filters and
              offers to clear them instead. */}
          {filtered && onResetFilters ? (
            <>
              <h3 className="font-headline-md text-lg font-bold text-text mb-4" data-testid="map-pane-filtered-empty">{t("map.bottom_sheet.count_filtered_zero")}</h3>
              <button type="button" onClick={onResetFilters} className="inline-block bg-primary text-white px-4 py-2 rounded-sm text-sm hover:bg-primary-dark transition">{t("map.bottom_sheet.reset_filters")}</button>
            </>
          ) : (
            // MEH-2639: the body and the «הוסיפו עסק» link are gone. This
            // overlay is shown to a CONSUMER who is looking for somewhere to
            // buy; pitching her business registration answers a question she
            // did not ask, and the sheet underneath already offers the nearest
            // businesses. Only the statement of fact survives.
            <h3 className="font-headline-md text-lg font-bold text-text" data-testid="map-pane-empty">{t("map.pane.empty.heading")}</h3>
          )}
        </div>
      )}

      {/* GPS center button — desktop only; mobile has one in the filter bar.
          MEH-1187: moved to the bottom corner OPPOSITE the legend (one corner =
          one job, Google-Maps model) so the expanded legend can no longer sit on
          it. Physical `right-4` — NOT logical `end-`/`start-` — because the
          legend is anchored with physical `left-4`; a logical prop would flip per
          `dir` and re-collide with the legend in /en (LTR). z-[1000] controls
          tier + bottom-24 unchanged; the right corner has no growable chrome, so
          no measured offset is needed (the opposite-corner move removes it). */}
      <button
        type="button"
        onClick={onGpsClick}
        disabled={gpsLoading}
        data-testid="map-gps-button"
        aria-label={t("map.pane.aria.center_on_me")}
        // eslint-disable-next-line no-restricted-syntax -- rtl-ok: geographic map control; physical right keeps it opposite the physical-left legend in every locale
        className="hidden lg:flex absolute bottom-24 right-4 w-11 h-11 rounded-full bg-surface-floating border border-border shadow-md items-center justify-center text-primary hover:bg-green-50 transition-colors z-[1000] focus-visible:ring-2 focus-visible:ring-primary/40 disabled:opacity-60"
      >
        {gpsLoading
          ? <CircleNotch size={20} className="animate-spin" aria-hidden="true" />
          : <NavigationArrow size={20} weight="fill" aria-hidden="true" />
        }
      </button>

      {/* Collapsible category legend — desktop only (mobile reads identity off the photo markers). */}
      {/* MEH-979: lg:block (not md:block) — the mobile shell is lg:hidden (MapClient.jsx:336),
          so md:block leaked the legend into the 768–1023px band where it overlapped the
          NearMePill. lg matches the desktop GPS button (lg:flex) + desktop shell (lg:grid). */}
      {/* rtl-ok: map overlay, physical left = map-canvas start */}
      <div ref={legendRef} data-testid="map-legend" className="hidden lg:block absolute bottom-4 left-4 z-[800]">
        {/* MEH-1217: origin-bottom-left so the panel reads as growing up out
            of the toggle (its near/left edge already shares the button's left
            edge — both block children of the bottom-4 left-4 container).
            rtl-ok: the whole legend is physically anchored left-4 (documented
            map exception), so the physical bottom-left origin is correct. */}
        {legendOpen && (
          <div className="mb-2 origin-bottom-left bg-surface-floating border border-border rounded-lg p-2 min-w-[180px]" role="group" data-testid="map-legend-panel" aria-label={t("map.pane.aria.categories")}>
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
                  <button key={cat.name} type="button" data-testid="map-legend-row" onClick={disabled ? undefined : () => toggleCategory(cat.name)} disabled={disabled} aria-disabled={disabled} className={`w-full flex items-center gap-2 px-1.5 py-1 rounded-md text-start transition ${opacity} ${disabled ? "cursor-not-allowed" : "hover:bg-green-50"}`} aria-pressed={catActive}>
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
                <button type="button" onClick={() => setActiveCategoryNames(null)} className="w-full text-sm text-primary underline decoration-[1.5px] underline-offset-[5px] decoration-primary/35 hover:decoration-current mt-1 pt-1 border-t border-border">{t("map.pane.show_all")}</button>
              )}
            </div>
          </div>
        )}
        <button
          type="button"
          onClick={onLegendToggle}
          data-testid="map-legend-toggle"
          aria-label={t("map.pane.aria.categories")}
          aria-expanded={legendOpen}
          className="w-8 h-8 rounded-full bg-surface-floating border border-border flex items-center justify-center hover:bg-green-50 transition focus-visible:ring-2 focus-visible:ring-primary/40"
        >
          <SquaresFour size={16} weight="bold" className="text-text" />
        </button>
      </div>
      {/* MEH-2424: "מה רואים במפה?" — the marker key, one more circle in the
          control column. It took the slot the pickup-layer toggle left (Sapir
          13/11): desktop one step (44px + 8px) above the physical-right GPS
          circle; mobile rides the sheet edge one step above NearMePill. The panel drops in from the top of the pane: full-width on the
          phone, a 320px card in the desktop control column. Rendered LAST in
          the pane: the panel shares the map-control z token, so DOM
          order is what puts it over the other controls it can cover. */}
      <MapKey
        testIdSuffix="-desktop"
        // Physical right keeps it in the GPS circle's column, opposite the
        // physical-left legend, in every locale (the documented map exception).
        // rtl-ok: geographic map control
        buttonClassName="hidden lg:flex absolute bottom-[152px] right-4"
        panelClassName="hidden lg:block top-4 right-4 w-80" // rtl-ok: panel opens in that same column
      />
      <MapKey
        testIdSuffix="-mobile"
        buttonStyle={{
          bottom: sheetRide(NEAR_ME_STACK_OFFSET_PX),
          transitionProperty: "bottom, background-color",
          transitionDuration: "var(--map-sheet-anim, 300ms)",
        }}
        buttonClassName="lg:hidden flex absolute end-4"
        panelClassName="lg:hidden top-4 inset-x-4"
      />
    </div>
  );
}
