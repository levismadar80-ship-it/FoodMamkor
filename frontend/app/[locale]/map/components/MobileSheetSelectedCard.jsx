import { useLayoutEffect, useRef } from "react";
import { useTranslations } from "next-intl";
import { MapPin, X } from "@phosphor-icons/react";

import MapProducerCard from "@/components/MapProducerCard";

// MEH-1298: nearest scrollable ancestor (the sheet's overflow-y-auto content
// div in MapBottomSheet). Walk up rather than assume a direct parent so a
// future wrapper around this panel doesn't silently break the compensation.
function findScrollParent(node) {
  let el = node?.parentElement;
  while (el) {
    const oy = window.getComputedStyle(el).overflowY;
    if (oy === "auto" || oy === "scroll") return el;
    el = el.parentElement;
  }
  return null;
}

/**
 * Module:   MobileSheetSelectedCard
 * Purpose:  Pinned preview of the just-tapped map pin at the top of the mobile
 *           bottom sheet — renders the shared compact <MapProducerCard active/>
 *           (Airbnb/Yelp/Zillow pattern: pin → compact preview → tap to profile).
 *           Contact happens on the profile (dynamic CTA + sticky bar), never here.
 * Does NOT: hold a hero image / hardcoded WhatsApp CTA / verified seal — those
 *           expanded affordances were dropped (MEH-1243 follow-up). Card = select,
 *           page = act; the profile owns primary_contact_method routing.
 * Related:  frontend/components/MapProducerCard.jsx (active/nav gesture, central —
 *           consumed as-is); frontend/app/[locale]/map/MapClient.jsx (call site);
 *           frontend/components/MapBottomSheet.jsx (scroll-anchor context).
 * History:  MEH-1243 (extracted expanded pinned card); MEH-1243 follow-up
 *           (Refs MEH-1243 — expanded card → compact MapProducerCard).
 */
export default function MobileSheetSelectedCard({
  selectedProducer,
  selectedLocation,
  onClose,
}) {
  const t = useTranslations();
  const rootRef = useRef(null);

  // MEH-1298: this panel mounts as the FIRST child of the sheet's scroll
  // container (above {cardList} — MapClient.jsx), so its height pushes the whole
  // list DOWN. That moved the just-tapped card out from under the finger between
  // the two taps of the MEH-1243 select→navigate gesture. Add the panel's
  // rendered height (incl. its mb-3 gap) to the scroll parent's scrollTop in
  // useLayoutEffect (before paint) so the list stays visually fixed; reverse on
  // unmount / re-selection so nothing accumulates and the close (X) doesn't jump
  // the list. offsetHeight is 0 in the hidden desktop shell → no-op there.
  // Requires the scroll container's browser scroll-anchoring to be OFF
  // (`[overflow-anchor:none]` on MapBottomSheet's content div) — otherwise
  // Chromium anchors the shift itself and this comp double-shifts. See
  // MapBottomSheet.jsx.
  useLayoutEffect(() => {
    const el = rootRef.current;
    if (!el) return;
    const scroller = findScrollParent(el);
    if (!scroller) return;
    const marginBottom = parseFloat(window.getComputedStyle(el).marginBottom) || 0;
    const shift = el.offsetHeight + marginBottom;
    if (shift <= 0) return;
    scroller.scrollTop += shift;
    return () => { scroller.scrollTop -= shift; };
  }, [selectedProducer?.id]);

  if (!selectedProducer) return null;

  // The compact card carries its own active Pin-Echo border/tint + chevron and
  // navigates to the profile on body/chevron tap (it is always `active` here, so
  // no onClick select handler is needed). We only add a minimal deselect X —
  // MapProducerCard is a central component and must not be modified, so the X
  // lives on the wrapper as a sibling of the card, top-START corner (right in
  // RTL). Pin re-tap does NOT deselect (useMapSync.handleMarkerClick always
  // selects), so this X is the sheet's only deselect affordance.
  // MEH-1412 (MEH-1388 chunk 3): the tooltip context = business name (in the
  // card) + the CLICKED location's label. Rendered on the wrapper (the frozen
  // MapProducerCard is untouched); only shows when the tapped marker carried a
  // label (pickup / market_stand / named branch — null for the lat/lng fallback
  // marker and unlabelled primary rows). Logical props (start/gap) — RTL-safe.
  const locationLabel = selectedLocation?.label;

  return (
    <div ref={rootRef} className="relative mb-3">
      {locationLabel ? (
        // ps-9 clears the deselect × (top-start, w-7) so the label never sits
        // under it in RTL (start = right, where both live).
        <div className="mb-1.5 flex items-center gap-1 ps-9 pe-1 text-xs text-fg-muted">
          <MapPin size={13} weight="fill" className="shrink-0 text-primary" />
          <span className="truncate">{locationLabel}</span>
        </div>
      ) : null}
      <MapProducerCard producer={selectedProducer} active />
      <button
        type="button"
        onClick={onClose}
        aria-label={t("common.aria.close")}
        className="absolute top-1 start-1 z-10 w-7 h-7 rounded-full bg-white/90 border border-border shadow-sm flex items-center justify-center text-fg-muted focus-ring"
      >
        <X size={14} weight="bold" />
      </button>
    </div>
  );
}
