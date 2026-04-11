import { resolveCategoryIcon } from "./categoryIconMap";

/**
 * Lucide icon wrapper for categories.
 *
 * Usage:
 *   <CategoryIcon category={cat} size={40} className="text-white" />
 *   <CategoryIcon category="Beef" size={24} />
 *
 * Pre-migration (Phases 1–4): resolves by Hebrew category.name.
 * Post Phase 5: resolves by category.icon_name from the backend.
 */
export default function CategoryIcon({
  category,
  size = 24,
  className = "",
  strokeWidth = 1.75,
}) {
  const Icon = resolveCategoryIcon(category);
  return (
    <Icon
      size={size}
      className={className}
      strokeWidth={strokeWidth}
      aria-hidden="true"
    />
  );
}
