import { useLayoutEffect, useRef } from "react";
import { useTranslations } from "next-intl";
import { MapPin, X } from "@phosphor-icons/react";

import MapProducerCard from "@/components/MapProducerCard";

// The gap between the card and the sheet's top edge, and what it adds to the
// edge the map controls ride (card height + this gap, on both sides).
const GAP_PX = 8;

/**
 * Module:   MobileSheetSelectedCard
 * Purpose:  The business picked on the phone map, as ONE card floating over the
 *           map just above the collapsed bottom sheet (Airbnb / Google Maps
 *           pattern: pin → one preview card → tap to profile). Renders the
 *           shared compact <MapProducerCard active/>; contact happens on the
 *           profile, never here.
 * Does NOT: live inside the sheet. Until MEH-3119 it was pinned above the list
 *           in the sheet, so the picked business showed twice (pinned + its own
 *           row). MapClient mounts this only while the sheet is at PEEK; with
 *           the sheet open the list's own active row is the selection.
 *           Does not decide its own visibility, and holds no hero image /
 *           WhatsApp CTA / verified seal (MEH-1243 follow-up).
 * Related:  frontend/components/MapProducerCard.jsx (central — consumed as-is);
 *           frontend/app/[locale]/map/MapClient.jsx (call site + `onHeight`);
 *           frontend/components/MapBottomSheet.jsx (`--map-sheet-own-h`,
 *           `rideExtraPx`).
 * History:  MEH-1243 (extracted); MEH-1298 (scroll compensation, gone with the
 *           move out of the sheet); MEH-1412 (location label); MEH-3119 (floats
 *           over the map; X in its own row, off the photo).
 */
export default function MobileSheetSelectedCard({
  selectedProducer,
  selectedLocation,
  onClose,
  onHeight,
}) {
  const t = useTranslations();
  const rootRef = useRef(null);

  // MEH-3119: tell the host how much room the card takes above the sheet, so
  // the controls that ride the sheet edge (near-me, the «?» key, the
  // attribution) lift clear of it. 0 on unmount.
  useLayoutEffect(() => {
    const el = rootRef.current;
    if (!el || !onHeight) return undefined;
    // offsetHeight is 0 in the hidden desktop shell → report nothing there.
    const report = () => onHeight(el.offsetHeight ? Math.round(el.offsetHeight) + GAP_PX * 2 : 0);
    report();
    const ro = typeof ResizeObserver !== "undefined" ? new ResizeObserver(report) : null;
    ro?.observe(el);
    return () => {
      ro?.disconnect();
      onHeight(0);
    };
  }, [onHeight, selectedProducer?.id]);

  if (!selectedProducer) return null;

  // MEH-1412 (MEH-1388 chunk 3): business name (in the card) + the CLICKED
  // location's label. Only shows when the tapped marker carried a label
  // (pickup / market_stand / named branch).
  const locationLabel = selectedLocation?.label;

  // The compact card is always `active` here, so a tap on it navigates to the
  // profile. Pin re-tap does NOT deselect (useMapSync.handleMarkerClick always
  // selects), so the X is the deselect affordance. MEH-3119: it used to float
  // over the card's corner and, at 44px, covered the photo; it now ends the row
  // above the card (inline-END, rtl.md). Hit area 44px; -my-1.5 keeps the row
  // 32px so the target never reaches into the card under it.
  return (
    <div
      ref={rootRef}
      data-testid="map-selected-card"
      className="lg:hidden fixed inset-x-3 z-[598] mx-auto max-w-md rounded-xl border border-border bg-background p-2 shadow-lg"
      style={{
        bottom: `calc(var(--map-sheet-own-h, 14vh) + ${GAP_PX}px)`,
        transitionProperty: "bottom",
        transitionDuration: "var(--map-sheet-anim, 0ms)",
        transitionTimingFunction: "cubic-bezier(0.32,0.72,0,1)",
      }}
    >
      <div className="mb-1.5 flex items-center gap-1 ps-1 text-xs text-fg-muted">
        {locationLabel ? (
          <>
            <MapPin size={14} weight="fill" className="shrink-0 text-primary" />
            <span data-testid="map-selected-card-location" className="truncate">{locationLabel}</span>
          </>
        ) : null}
        <button
          type="button"
          onClick={onClose}
          aria-label={t("common.aria.close")}
          data-testid="map-selected-card-close"
          className="ms-auto -my-1.5 w-11 h-11 shrink-0 rounded-full flex items-center justify-center text-fg-muted hover:text-primary focus-ring"
        >
          <span className="w-8 h-8 rounded-full bg-surface border border-border flex items-center justify-center" aria-hidden="true">
            <X size={16} weight="bold" />
          </span>
        </button>
      </div>
      <MapProducerCard producer={selectedProducer} active />
    </div>
  );
}
