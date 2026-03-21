export default function CategoryTag({ category }) {
  return (
    <span className="inline-flex items-center gap-1 bg-cream text-text-secondary text-xs px-2 py-1 rounded-full">
      {category.emoji && <span>{category.emoji}</span>}
      <span>{category.name}</span>
    </span>
  );
}
