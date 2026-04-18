"use client";

/**
 * Shimmer skeleton placeholder. Use in place of a spinner while fetching
 * lists of cards. The shimmer animation is keyframed inline so we don't
 * depend on tailwind config edits.
 */
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
      className={`skeleton-box rounded ${className}`}
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
      className="bg-background border border-border rounded-2xl overflow-hidden flex flex-col"
      aria-hidden="true"
    >
      <div className="skeleton-box w-full aspect-square lg:aspect-[4/3]" />
      <div className="p-4 flex-1 flex flex-col gap-2">
        <div className="skeleton-box rounded h-[20px] w-[80%]" />
        <div className="skeleton-box rounded h-[13px] w-[55%]" />
        <div className="skeleton-box rounded h-[14px] w-[90%]" />
        <div className="flex gap-1.5 mt-1">
          <div className="skeleton-box rounded-full h-[20px] w-[54px]" />
          <div className="skeleton-box rounded-full h-[20px] w-[48px]" />
        </div>
        <div className="mt-auto pt-3 flex items-center justify-between">
          <div className="skeleton-box rounded h-[16px] w-[60px]" />
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
  return (
    <div
      className="grid grid-cols-2 gap-3 md:gap-6 lg:grid-cols-4"
      role="status"
      aria-label="טוענת עסקים טריים"
    >
      {Array.from({ length: count }).map((_, i) => (
        <SkeletonProducerCard key={i} />
      ))}
      <style jsx global>{`
        .skeleton-box {
          background: linear-gradient(
            90deg,
            #e8e0d0 25%,
            #f5f0e8 50%,
            #e8e0d0 75%
          );
          background-size: 200% 100%;
          animation: shimmer 1.5s infinite ease-in-out;
        }
        @keyframes shimmer {
          0% {
            background-position: 200% 0;
          }
          100% {
            background-position: -200% 0;
          }
        }
        @media (prefers-reduced-motion: reduce) {
          .skeleton-box {
            animation: none;
            background: #e8e0d0;
          }
        }
      `}</style>
    </div>
  );
}
