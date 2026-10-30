"use client";

import { useTranslations } from "next-intl";

import FadeInSection, { REVEAL_PRESET } from "@/components/FadeInSection";
import ProducerCard from "@/components/ProducerCard";

// MEH-1146 chunk C: the discovery loop ("עוד בתי עסק באזור") renders only when
// at least this many same-city businesses (excluding the current one) come
// back — below it the section hides entirely so it never shows a thin 1-2 card
// row. Documented const per the spec.
export const MIN_NEARBY_BUSINESSES = 4;
// MEH-102: the similar row needs at least three cards to read as a row.
export const MIN_SIMILAR_BUSINESSES = 3;

/**
 * MEH-2592: the two rows of OTHER businesses — similar (MEH-102) and nearby
 * (MEH-1146 chunk C) — moved out of ProducerSections to the very end of the
 * page. Before, «בתי עסק דומים» sat between the reviews and the business's own
 * order schedule / location, so a reader left the business and came back
 * twice. Now everything about the business ends with the fine print, and this
 * band follows it: darker cream, so the eye sees where the business stops.
 * Full bleed on phones (cancels the page's px-4), a rounded band spanning both
 * columns on desktop. Renders nothing when neither row clears its minimum —
 * an empty band would be a coloured gap.
 */
export default function OtherBusinesses({ producer, similarProducers = [], nearbyProducers = [] }) {
  const t = useTranslations();
  const showSimilar = similarProducers.length >= MIN_SIMILAR_BUSINESSES;
  const showNearby = nearbyProducers.length >= MIN_NEARBY_BUSINESSES;
  if (!showSimilar && !showNearby) return null;

  return (
    <div
      data-testid="other-businesses"
      className="mt-12 -mx-4 px-4 py-8 bg-background-alt md:mx-0 md:px-6 md:rounded-2xl"
    >
      {showSimilar && (
        <FadeInSection as="section" {...REVEAL_PRESET}>
          <h2 className="font-headline-md text-2xl font-bold text-text mb-1">{t("producer.detail.sections.similar.heading")}</h2>
          {producer.categories?.[0]?.name && (
            <p className="text-sm text-fg-muted mb-4">
              {t("producer.detail.sections.similar.in_area", { category: producer.categories[0].name })}
            </p>
          )}
          <div className="flex gap-4 overflow-x-auto pb-2 md:grid md:grid-cols-3 md:overflow-visible">
            {similarProducers.map((p) => (
              <div key={p.id} className="flex-shrink-0 w-72 md:w-auto">
                <ProducerCard producer={p} referrer="similar" />
              </div>
            ))}
          </div>
        </FadeInSection>
      )}

      {showNearby && (
        <FadeInSection as="section" {...REVEAL_PRESET} className={showSimilar ? "mt-10" : undefined}>
          <h2 className="font-headline-md text-2xl font-bold text-text mb-4">
            {t("producer.detail.sections.nearby.heading")}
          </h2>
          <div className="flex gap-4 overflow-x-auto pb-2 md:grid md:grid-cols-3 md:overflow-visible">
            {nearbyProducers.slice(0, 6).map((p) => (
              <div key={p.id} className="flex-shrink-0 w-72 md:w-auto">
                <ProducerCard producer={p} referrer="nearby" />
              </div>
            ))}
          </div>
        </FadeInSection>
      )}
    </div>
  );
}
