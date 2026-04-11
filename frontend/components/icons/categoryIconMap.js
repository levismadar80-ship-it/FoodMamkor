// frontend/components/icons/categoryIconMap.js
//
// Maps categories (stored in backend) to Lucide React icon components.
//
// The backend `categories` table currently has { id, name, emoji }.
// Phase 5 of the icon migration will add an `icon_name` column. Until then,
// this file resolves icons by matching on the Hebrew `name` string.
//
// When adding a new category, pick an icon name from `CATEGORY_ICON_MAP` and
// add its Hebrew name to `CATEGORY_NAME_TO_ICON_NAME`. If no good match exists,
// the fallback is `Package`.

import {
  Apple,
  Beef,
  CookingPot,
  Droplet,
  Egg,
  Flame,
  Flower2,
  Leaf,
  Milk,
  Package,
  Pill,
  Salad,
  Sparkles,
  Sprout,
  UtensilsCrossed,
  Wheat,
} from "lucide-react";

// Registry of allowed icon names → component.
// Phase 5 will validate the backend `icon_name` column against this map.
export const CATEGORY_ICON_MAP = {
  Apple,
  Beef,
  CookingPot,
  Droplet,
  Egg,
  Flame,
  Flower2,
  Leaf,
  Milk,
  Pill,
  Salad,
  Sparkles,
  Sprout,
  UtensilsCrossed,
  Wheat,
};

// Pre-migration fallback: resolve by Hebrew category name.
// These 15 names mirror backend/seed_data.py :: CATEGORIES.
export const CATEGORY_NAME_TO_ICON_NAME = {
  "בשר ודגים": "Beef",
  "חלב וגבינות": "Milk",
  "ביצים": "Egg",
  "לחמים ואפייה": "Wheat",
  "שמנים ודבש": "Droplet",
  "ירקות": "Salad",
  "פירות": "Apple",
  "מותססים וכבושים": "CookingPot",
  "מוצרים מוכנים": "UtensilsCrossed",
  "צמחי מרפא ותוספים": "Leaf",
  "סבונים טבעיים": "Sparkles",
  "קרמים ושמנים": "Flower2",
  "תכשירי צמחים": "Sprout",
  "נרות וארומה": "Flame",
  "תוספי תזונה": "Pill",
};

/**
 * Resolves a Lucide component for a category.
 * Accepts either a full category object ({ name, icon_name, ... }) or an
 * icon name string. Returns the `Package` fallback if nothing matches.
 */
export function resolveCategoryIcon(category) {
  if (!category) return Package;

  // String form: treat as icon_name directly.
  if (typeof category === "string") {
    return CATEGORY_ICON_MAP[category] || Package;
  }

  // Preferred path (post Phase 5): backend supplies icon_name.
  if (category.icon_name && CATEGORY_ICON_MAP[category.icon_name]) {
    return CATEGORY_ICON_MAP[category.icon_name];
  }

  // Fallback path (Phases 1–4): match by Hebrew name.
  if (category.name) {
    const iconName = CATEGORY_NAME_TO_ICON_NAME[category.name];
    if (iconName && CATEGORY_ICON_MAP[iconName]) {
      return CATEGORY_ICON_MAP[iconName];
    }
  }

  return Package;
}
