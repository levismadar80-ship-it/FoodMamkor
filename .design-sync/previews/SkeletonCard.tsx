import { SkeletonCard } from "mehamakor-frontend";

// The .skeleton-box gradient/shimmer lives inside SkeletonProducerGrid's
// inline <style jsx global> (Skeleton.jsx). Standalone SkeletonCard/Line
// have no background unless that CSS is present, so re-declare it locally
// for the preview (preview glue only — mirrors in-app appearance).
const SHIMMER_CSS = `
  .skeleton-box {
    background: linear-gradient(90deg, #e8e0d0 25%, #f5f0e8 50%, #e8e0d0 75%);
    background-size: 200% 100%;
    animation: shimmer 1.5s infinite ease-in-out;
  }
  @keyframes shimmer {
    0% { background-position: 200% 0; }
    100% { background-position: -200% 0; }
  }
`;

export function Default() {
  return (
    <div style={{ width: 240 }}>
      <style>{SHIMMER_CSS}</style>
      <SkeletonCard />
    </div>
  );
}

export function Narrow() {
  return (
    <div style={{ width: 160 }}>
      <style>{SHIMMER_CSS}</style>
      <SkeletonCard />
    </div>
  );
}
