import { SkeletonLine } from "mehamakor-frontend";

// .skeleton-box gradient lives in SkeletonProducerGrid's inline <style>.
// Re-declare locally so standalone SkeletonLine is visible in the preview.
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

export function ParagraphLines() {
  return (
    <div style={{ width: 320, display: "flex", flexDirection: "column", gap: 10 }}>
      <style>{SHIMMER_CSS}</style>
      <SkeletonLine width="90%" height="16px" />
      <SkeletonLine width="100%" />
      <SkeletonLine width="75%" />
      <SkeletonLine width="60%" />
    </div>
  );
}

export function TitleAndMeta() {
  return (
    <div style={{ width: 280, display: "flex", flexDirection: "column", gap: 8 }}>
      <style>{SHIMMER_CSS}</style>
      <SkeletonLine width="70%" height="22px" />
      <SkeletonLine width="40%" height="13px" />
    </div>
  );
}
