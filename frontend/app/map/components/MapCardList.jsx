import { Leaf } from "@phosphor-icons/react";

import MapProducerCard from "@/components/MapProducerCard";

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
 * The ref callback at the producer-card wrapper writes to
 * useMapSync.cardRefs Map so handleCardMouseEnter can scrollIntoView
 * by id later.
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
}) {
  return (
    <div className="space-y-3">
      {visibleProducers.map((p) => (
        <div
          key={p.id}
          id={`card-${p.id}`}
          ref={(el) => { if (el) cardRefs.current.set(p.id, el); else cardRefs.current.delete(p.id); }}
          onMouseEnter={() => onCardMouseEnter(p.id)}
          onMouseLeave={onCardMouseLeave}
          className={`${hoveredProducerId === p.id ? "ring-2 ring-primary rounded-[16px]" : ""} ${activeProducerId === p.id ? "border-2 border-primary rounded-[16px] bg-light/[6%]" : ""} transition`}
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
          <Leaf size={44} weight="duotone" className="text-primary mx-auto mb-3" aria-hidden="true" />
          <h3 className="font-headline text-lg font-bold text-site-text mb-2">לא נמצאו עסקים</h3>
          <p className="text-site-muted text-sm mb-3">נסי להזיז את המפה או לשנות מסננים.</p>
          <button
            type="button"
            onClick={onResetAll}
            className="text-sm text-primary font-medium hover:underline"
          >
            אפסי סינון
          </button>
        </div>
      )}
    </div>
  );
}
