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
  Stack,
} from "@phosphor-icons/react";

import { CATEGORY_LEGEND } from "@/lib/category-registry";

// MEH-2046: the token set every circular /map control already shares — the
// desktop GPS circle below and NearMePill.jsx:62 both carry it. Extracted to a
// constant here because the layer toggle now makes three, and three copies of a
// class string is how they drift apart.
const MAP_CONTROL_CLASS =
  "w-11 h-11 rounded-full shadow-md items-center justify-center transition-colors z-[1000] focus-visible:ring-2 focus-visible:ring-primary/40";
const MAP_CONTROL_ON = "bg-primary text-white border border-primary";
const MAP_CONTROL_OFF = "bg-surface-floating text-primary border border-border hover:bg-green-50";
// NearMePill sits at sheet-edge + 12px and is 44px tall; +12px again clears it.
const NEAR_ME_STACK_OFFSET_PX = 68;

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
  visitedIds,
  // MEH-1412: pickup/market_stand layer toggle (state owned by MapClient).
  showSecondaryLayer,
  onToggleSecondaryLayer,
  // MEH-2046: ≥1 business currently drops off the map because the layer is off
  // (producerPoints rule 2 — the layer toggle; it was rule 3 until MEH-1938
  // chunk 5a deleted the Producer.lat/lng fallback rule). Computed in
  // MapClient, which owns the feed.
  secondaryHidden = false,
  // MEH-1611: id of the selected business (focus-on-select demote). Pure
  // pass-through — MapClient owns the state, MapComponent renders the effect.
  focusedProducerId,
  // overlay state + handlers
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
        showSecondaryLayer={showSecondaryLayer}
        focusedProducerId={focusedProducerId}
      />
      {/* MEH-2046: the layer toggle moved OFF the canvas and into the map's own
          control corners. As a labelled pill at top-start it read as a filter —
          it sat where filters sit and looked like the chip row above it — while
          it actually controls which markers are drawn. Icon-only, in the control
          cluster, it reads as what it is. The MEH-1412 behaviour is unchanged:
          same handler, same aria-pressed, same secondary layer.

          Two placements because the two breakpoints have different control
          corners, and this control joins whichever one already exists rather
          than opening a third: desktop stacks above the GPS circle (physical
          right, the documented geo exception), mobile stacks above NearMePill
          in the bottom-END corner and rides the sheet edge the same way. Only
          one is ever rendered — `hidden lg:flex` / `lg:hidden`. */}
      <button
        type="button"
        onClick={onToggleSecondaryLayer}
        aria-pressed={showSecondaryLayer}
        aria-label={t("map.pane.pickup_layer.aria")}
        data-testid="pickup-layer-toggle-desktop"
        // rtl-ok: geographic map control; physical right keeps it in the GPS
        // circle's column, opposite the physical-left legend, in every locale.
        // No eslint-disable here: no-restricted-syntax reads string-literal
        // classNames only, so it never sees this template literal — the
        // check-rtl.sh hook is what covers it, and the marker is what it reads.
        className={`hidden lg:flex absolute bottom-[152px] right-4 ${MAP_CONTROL_CLASS} ${
          showSecondaryLayer ? MAP_CONTROL_ON : MAP_CONTROL_OFF
        }`}
      >
        <Stack size={20} weight={showSecondaryLayer ? "fill" : "regular"} aria-hidden="true" />
      </button>
      <button
        type="button"
        onClick={onToggleSecondaryLayer}
        aria-pressed={showSecondaryLayer}
        aria-label={t("map.pane.pickup_layer.aria")}
        data-testid="pickup-layer-toggle-mobile"
        // REUSES: NearMePill.jsx:51 — the same `--map-sheet-h` ride, one row up,
        // so the two move together instead of one crossing the other on a drag.
        // A plain `bottom-4` was tried and is WRONG: once Leaflet mounts, the
        // pane's box reaches down into the cookie-banner band (measured: the
        // button landed at 760–804 with the banner at 728–820 and z-1100 over
        // it). The sheet-edge ride is what keeps a bottom control clear of that,
        // which is why the pill already uses it.
        style={{
          bottom: `calc(var(--map-sheet-h, 14vh) + ${NEAR_ME_STACK_OFFSET_PX}px)`,
          transitionProperty: "bottom, background-color",
          transitionDuration: "var(--map-sheet-anim, 300ms)",
        }}
        className={`lg:hidden flex absolute end-4 ${MAP_CONTROL_CLASS} ${
          showSecondaryLayer ? MAP_CONTROL_ON : MAP_CONTROL_OFF
        }`}
      >
        <Stack size={20} weight={showSecondaryLayer ? "fill" : "regular"} aria-hidden="true" />
      </button>

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
          Same shield idiom as BottomNav.jsx:358 and the Header. */}
      {/* MEH-2148: gated so the strip is absent from the DOM when neither child
          renders, which is the common case. `pointer-events-none` already made
          an empty wrapper harmless, but harmless is not absent -- a full-width
          transparent element across the top of the pane is something a future
          hit-test or a11y sweep would still have to reason about. */}
      {(mapMoved || secondaryHidden) && (
        <div className="absolute top-4 inset-x-0 z-[1000] px-4 flex flex-col items-center gap-2 pointer-events-none">
          {mapMoved && (
            <div className="pointer-events-auto">
              <button type="button" onClick={(e) => { e.stopPropagation(); onSearchThisArea(); }} className="bg-surface-floating border border-border rounded-full px-5 py-2.5 text-sm font-medium hover:bg-green-50 transition flex items-center gap-2 focus-visible:ring-2 focus-visible:ring-primary/40">
                <MagnifyingGlass size={16} weight="bold" className="text-primary" />
                {t("map.pane.search_this_area")}
              </button>
            </div>
          )}
        {/* MEH-2046: the reminder, in the slot the pill vacated. A business whose
            only points are pickup rows yields NO points at all when the layer is
            off (producerPoints rule 2, deliberate) — so it does not fade or move,
            it disappears. Silence there is the failure mode this line exists to
            prevent; it renders only while businesses are actually being hidden.
            MEH-2148: `self-start` keeps its original inline-start alignment
            inside the centred column — logical, so it follows the locale. */}
          {secondaryHidden && (
            <div
              role="status"
              data-testid="pickup-layer-hidden-notice"
              className="pointer-events-auto self-start max-w-[240px] rounded-lg border border-border bg-surface-floating px-3 py-1.5 text-xs text-fg-muted shadow-md"
            >
              {t("map.pane.pickup_layer.hidden_notice")}
            </div>
          )}
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
      <div ref={legendRef} className="hidden lg:block absolute bottom-4 left-4 z-[800]">
        {/* MEH-1217: origin-bottom-left so the panel reads as growing up out
            of the toggle (its near/left edge already shares the button's left
            edge — both block children of the bottom-4 left-4 container).
            rtl-ok: the whole legend is physically anchored left-4 (documented
            map exception), so the physical bottom-left origin is correct. */}
        {legendOpen && (
          <div className="mb-2 origin-bottom-left bg-surface-floating border border-border rounded-lg p-2 min-w-[180px]" role="group" aria-label={t("map.pane.aria.categories")}>
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
