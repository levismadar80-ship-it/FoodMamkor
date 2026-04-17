export default function Loading() {
  return (
    <div className="max-w-7xl mx-auto px-4 py-8">
      <div className="h-8 w-48 bg-border rounded-[12px] animate-pulse mb-8" />
      {[0, 1].map((row) => (
        <div key={row} className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-6">
          {[0, 1, 2, 3].map((col) => (
            <div key={col} className="rounded-[12px] overflow-hidden bg-white">
              <div className="h-[200px] bg-border animate-pulse" />
              <div className="p-4 space-y-2">
                <div className="h-4 bg-border rounded animate-pulse w-3/4" />
                <div className="h-3 bg-border rounded animate-pulse w-1/2" />
              </div>
            </div>
          ))}
        </div>
      ))}
    </div>
  );
}
