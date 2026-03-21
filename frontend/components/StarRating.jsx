export default function StarRating({ avg, count }) {
  if (!count || count === 0) return null;

  return (
    <div className="flex items-center gap-1 text-sm">
      <span className="text-yellow-500">⭐</span>
      <span className="font-medium">{avg?.toFixed(1)}</span>
      <span className="text-text-secondary">({count} דירוגים)</span>
    </div>
  );
}
