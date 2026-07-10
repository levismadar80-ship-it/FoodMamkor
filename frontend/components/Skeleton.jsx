"use client";

import { useTranslations } from "next-intl";

/**
 * Skeleton placeholder. Use in place of a spinner while fetching lists of
 * cards. MEH-991 (CARD-26): 1.8s opacity pulse on fg-muted@0.15 bars per the
 * ProducerCard v4 skeleton spec (was a gradient shimmer). Keyframed inline so
 * we don't depend on tailwind config edits.
 */

/**
 * MEH-1054: the `.skeleton-box` pulse rules, extracted from
 * SkeletonProducerGrid so other skeleton consumers (MapBottomSheet's MAP-16
 * list skeleton) can mount them without duplicating the keyframes (single
 * owner, MEH-271). styled-jsx dedupes identical global blocks, so rendering
 * this in several mounted components is safe. NOTE: SkeletonCard/SkeletonLine
 * alone do NOT inject styles — a page using them must render <SkeletonStyles/>
 * (or SkeletonProducerGrid) once.
 */
export function SkeletonStyles() {
  return (
    <style jsx global>{`
      .skeleton-box {
        /* fg-muted (#5c584f) @ 0.15 — ProducerCard v4 skeleton spec */
        background: rgba(92, 88, 79, 0.15);
        animation: skeleton-pulse 1.8s infinite ease-in-out;
      }
      @keyframes skeleton-pulse {
        0%,
        100% {
          opacity: 1;
        }
        50% {
          opacity: 0.5;
        }
      }
      @media (prefers-reduced-motion: reduce) {
        .skeleton-box {
          animation: none;
        }
      }
    `}</style>
  );
}

export function SkeletonCard({ className = "" }) {
  return (
    <div
      className={`skeleton-box rounded-[16px] ${className}`}
      style={{ height: "320px" }}
      aria-hidden="true"
    />
  );
}

export function SkeletonLine({ width = "100%", height = "14px", className = "" }) {
  return (
    <div
      className={`skeleton-box rounded-lg ${className}`}
      style={{ width, height }}
      aria-hidden="true"
    />
  );
}

/**
 * ProducerCard-shaped skeleton. Matches the Phase B anatomy so we don't
 * regress CLS: square image on mobile → 4:3 on desktop, body of name +
 * location + description + pills + footer rows, no icon grid.
 */
function SkeletonProducerCard() {
  return (
    <div
      className="bg-surface-card border border-border rounded-none overflow-hidden flex flex-col"
      aria-hidden="true"
    >
      <div className="bg-background w-full aspect-square lg:aspect-[4/3]" />
      <div className="p-4 flex-1 flex flex-col gap-2">
        <div className="skeleton-box rounded-lg h-[20px] w-[80%]" />
        <div className="skeleton-box rounded-lg h-[13px] w-[55%]" />
        <div className="skeleton-box rounded-lg h-[14px] w-[90%]" />
        <div className="flex gap-1.5 mt-1">
          <div className="skeleton-box rounded-full h-[20px] w-[54px]" />
          <div className="skeleton-box rounded-full h-[20px] w-[48px]" />
        </div>
        <div className="mt-auto pt-3 flex items-center justify-between">
          <div className="skeleton-box rounded-lg h-[16px] w-[60px]" />
          <div className="skeleton-box rounded-full h-[18px] w-[18px]" />
        </div>
      </div>
    </div>
  );
}

/**
 * Grid of skeleton cards — matches the producer grid layout.
 */
export function SkeletonProducerGrid({ count = 8 }) {
  const t = useTranslations("common.skeleton");
  return (
    <div
      className="grid grid-cols-2 gap-3 md:gap-6 lg:grid-cols-4"
      role="status"
      aria-label={t("loading_businesses")}
    >
      {Array.from({ length: count }).map((_, i) => (
        <SkeletonProducerCard key={i} />
      ))}
      {/* MEH-1054: rules extracted to SkeletonStyles (shared with MapBottomSheet) */}
      <SkeletonStyles />
    </div>
  );
}
