import { useTranslations } from "next-intl";
import { Leaf } from "@phosphor-icons/react";

import MapProducerCard from "@/components/MapProducerCard";
import { SkeletonStyles } from "@/components/Skeleton";

/**
 * Vertical list of producer cards. Verbatim move of the `cardList`
 * JSX const from MapClient.jsx:667-706. Renders one
 * <MapProducerCard/> per visible producer, with hover + active
 * highlight rings driven by useMapSync state.
 *
 * The empty-state branch ("לא נמצאו עסקים") includes an "אפסי סינון"
 * button that does a wider reset than useMapFilters.resetAllFilters
 * — it ALSO clears cityFilter (was MapClient.jsx:693-697 inline).
 * That wider-reset behavior is preserved by passing onResetAll as
 * a prop callback that the slim shell constructs from the same
 * five setter calls the source used inline.
 *
 * The ref callback at the producer-card wrapper registers into
 * useMapSync.cardRefs so handleMarkerClick can scrollIntoView by id.
 *
 * MEH-1010: cardRefs maps producer.id → Set of wrapper nodes, NOT a
 * single node. This list renders TWICE in MapClient.jsx (desktop
 * sidebar + mobile bottom sheet); a plain id→node Map let the mobile
 * instance (last mount) overwrite the desktop node, so on desktop
 * scrollIntoView targeted a display:none element and silently no-oped.
 * handleMarkerClick picks the VISIBLE node from the Set at click time
 * (same visible-instance discipline as useMapSync.registerMapApi).
 * React 18 callback refs get null on unmount without telling us which
 * node died, so removal happens by pruning disconnected nodes at both
 * registration and pick time instead.
 */
export default function MapCardList({
  visibleProducers,
  hoveredProducerId,
  activeProducerId,
  cardRefs,
  onCardMouseEnter,
  onCardMouseLeave,
  onCardClick,
  onResetAll,
  // MEH-1671: while the first /producers fetch is in flight the list is
  // empty for a reason that is NOT "no results" — rendering the empty state
  // then is the desktop-sidebar flash this prop closes. The mobile sheet was
  // already guarded one level up (MapBottomSheet `loading`, MEH-1054); this
  // guard lives here so NO host can show "לא נמצאו" during load. Skeleton
  // only when loading AND empty: a refetch with stale rows keeps the rows
  // (no flash), and a genuine empty (loading resolved) still shows the pin.
  loading = false,
}) {
  const t = useTranslations();
  if (loading && visibleProducers.length === 0) {
    return (
      // REUSES: frontend/components/MapBottomSheet.jsx:25 SheetListSkeleton —
      // same geometry (h-20 rounded-[16px] bars), same role="status" + label
      // recipe, same styled-jsx mount (skeleton-box is not global CSS).
      <div data-testid="sidebar-list-skeleton" role="status" aria-label={t("common.skeleton.loading_businesses")}>
        {[0, 1, 2].map((i) => (
          <div key={i} className="skeleton-box rounded-[16px] h-20 mb-3" aria-hidden="true" />
        ))}
        <SkeletonStyles />
      </div>
    );
  }
  return (
    <div className="space-y-3">
      {visibleProducers.map((p) => (
        <div
          key={p.id}
          id={`card-${p.id}`}
          ref={(el) => {
            if (!el) return; // unmount: pruned lazily (see docblock)
            const nodes = cardRefs.current.get(p.id) ?? new Set();
            nodes.add(el);
            for (const n of nodes) if (!n.isConnected) nodes.delete(n);
            cardRefs.current.set(p.id, nodes);
          }}
          onMouseEnter={() => onCardMouseEnter(p.id)}
          onMouseLeave={onCardMouseLeave}
          // MEH-1010: marker-hover highlights the card with a ring (two-way sync).
          // MEH-1243: the SELECTED (active) visual is now the card's own Pin-Echo
          // (category-color border + 6% tint, rendered inside MapProducerCard) —
          // the wrapper no longer paints its own active border/tint, which would
          // double up with the pin-echo. `active` is still passed to the card below.
          className={`${hoveredProducerId === p.id ? "ring-2 ring-primary rounded-lg" : ""} transition`}
        >
          <MapProducerCard
            producer={p}
            active={activeProducerId === p.id}
            onClick={onCardClick}
          />
        </div>
      ))}
      {visibleProducers.length === 0 && (
        <div className="text-center py-12">
          <Leaf size={44} className="text-primary mx-auto mb-3" aria-hidden="true" />
          <h3 className="font-headline-md text-lg font-bold text-text mb-2">{t("map.card_list.empty.heading")}</h3>
          <p className="text-fg-muted text-sm mb-3">{t("map.card_list.empty.body")}</p>
          <button
            type="button"
            onClick={onResetAll}
            className="text-sm text-primary font-medium hover:underline"
          >
            {t("map.card_list.empty.reset_filters")}
          </button>
        </div>
      )}
    </div>
  );
}
