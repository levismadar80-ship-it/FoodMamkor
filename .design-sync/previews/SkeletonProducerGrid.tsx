import { SkeletonProducerGrid } from "mehamakor-frontend";

export function FullGrid() {
  return (
    <div style={{ width: "100%", maxWidth: 720 }}>
      <SkeletonProducerGrid count={8} />
    </div>
  );
}

export function FourCards() {
  return (
    <div style={{ width: "100%", maxWidth: 720 }}>
      <SkeletonProducerGrid count={4} />
    </div>
  );
}
