export default function CategoryTag({ category }) {
  return (
    <span className="inline-flex items-center gap-1 bg-cream text-muted text-xs px-2 py-1 rounded-full">
      <span>{category.name}</span>
    </span>
  );
}
