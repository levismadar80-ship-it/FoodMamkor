// Category card data for the homepage category grid.
// Pure module (no React imports) so it can be consumed by both the
// HomeCategoryGrid component (frontend/app/home/HomeCategoryGrid.jsx)
// and the page-level state hook (frontend/lib/use-home-page.js)
// without creating an app/ → lib/ import direction.

// PREMIUM_DESIGN: category cards now use hand-drawn SVG line-art
// (see CategoryIcons.jsx) instead of Phosphor — warmer, more unique
// than a generic icon library. Match-terms + Unsplash images unchanged.
export const CATEGORY_CARDS = [
  { key: "meat",  name: "בשר, עוף ודגים",    match: ["בשר", "עוף", "דגים"],        image: "https://images.unsplash.com/photo-1607623814075-e51df1bdc82f?w=600&fit=crop&auto=format&q=80&fm=webp" },
  { key: "veg",   name: "ירקות, פירות ומשקים", match: ["ירקות", "פירות", "משקה"],   image: "https://images.unsplash.com/photo-1540420773420-3366772f4999?w=600&fit=crop&auto=format&q=80&fm=webp" },
  { key: "dairy", name: "חלב וגבינות",        match: ["חלב", "גבינה", "גבינות"],  image: "https://images.unsplash.com/photo-1771578742735-36009188c207?w=600&fit=crop&auto=format&q=80&fm=webp" },
  { key: "bread", name: "לחמים ואפייה",       match: ["לחם", "אפייה", "מאפים"],    image: "https://images.unsplash.com/photo-1509440159596-0249088772ff?w=600&fit=crop&auto=format&q=80&fm=webp" },
  { key: "oil",   name: "שמנים ודבש",         match: ["שמן", "דבש"],                image: "https://images.unsplash.com/photo-1474979266404-7eaacbcd87c5?w=600&fit=crop&auto=format&q=80&fm=webp" },
  { key: "care",  name: "טיפוח וסבונים",      match: ["טיפוח", "סבון", "קוסמטיקה"], image: "https://images.unsplash.com/photo-1600857544200-b2f666a9a2ec?w=600&fit=crop&auto=format&q=80&fm=webp" },
];

export function matchCategoryId(cards, categories) {
  return cards.map((card) => {
    const found = categories.find((c) =>
      card.match.some((m) => c.name && c.name.includes(m))
    );
    return { ...card, categoryId: found ? found.id : null };
  });
}
