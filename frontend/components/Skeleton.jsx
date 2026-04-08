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
 * Grid of skeleton cards — matches the producer grid layout.
 */
export function SkeletonProducerGrid({ count = 8 }) {
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6" role="status" aria-label="טוענת עסקים טריים">
      {Array.from({ length: count }).map((_, i) => (
        <SkeletonCard key={i} />
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
