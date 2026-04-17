export default function Skeleton({ width, height, borderRadius = "8px", className = "" }) {
  return (
    <div
      className={`bg-border animate-pulse ${className}`}
      style={{ width, height, borderRadius }}
    />
  );
}

export function ProducerCardSkeleton() {
  return (
    <div className="bg-white rounded-[12px] overflow-hidden">
      <div className="h-56 bg-border animate-pulse" />
      <div className="p-4 space-y-3">
        <Skeleton height="20px" borderRadius="6px" className="w-3/4" />
        <Skeleton height="14px" borderRadius="6px" className="w-1/3" />
        <Skeleton height="14px" borderRadius="6px" className="w-1/2" />
        <div className="flex gap-2 pt-1">
          <Skeleton height="24px" width="60px" borderRadius="20px" />
          <Skeleton height="24px" width="72px" borderRadius="20px" />
        </div>
      </div>
    </div>
  );
}

export function ProducerGridSkeleton({ count = 8 }) {
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
      {Array.from({ length: count }).map((_, i) => (
        <ProducerCardSkeleton key={i} />
      ))}
    </div>
  );
}
