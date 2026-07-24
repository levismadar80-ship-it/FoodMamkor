// Category card data for the homepage category grid.
// Pure module (no React imports) so it can be consumed by both the
// HomeCategoryGrid component (frontend/app/[locale]/home/HomeCategoryGrid.jsx)
// and the page-level state hook (frontend/lib/use-home-page.js)
// without creating an app/ → lib/ import direction.

// MEH-1080 [T-A]: 1:1 card↔DB-category set (Sapir-locked 10/07/26). Each
// card names exactly one DB category (`name` = DB value verbatim, both
// locales — mirrors the /producers chips convention) and links to
// /producers?category=<id>. The previous 6 merged-label cards
// ("בשר, עוף ודגים" etc.) with fuzzy `match` arrays are gone — the
// includes()-first-match mapping silently hid producers whose category
// appeared later in a card's label (MEH-1077 DISC-03).
// Ordering: hero cards lead (first 2); the rest follow. Cards render photos
// (MEH-1183); the geometric glyph is the no-photo fallback only.
// MEH-683: the CATEGORY_ICONS fallback is keyed by `name` (canonical DB value),
// not `key` — `key` remains the stable React key + link slug.
//
// MEH-1183: `image` is a TEMPORARY bridge asset — Unsplash free-license
// stock (MEH-1182 wired the `images.unsplash.com` remotePattern + CSP
// img-src allowlist in next.config.js). These are placeholders to be
// replaced by real business photos after MEH-1184; deliberately NOT
// Cloudinary (bridge assets, not user uploads). A card without an `image`
// falls back to its hand-drawn glyph / Phosphor Leaf, unchanged.
// Base params: q=80 (quality) · w=1200 (max render width) · auto=format
// (WebP/AVIF negotiation) · fit=crop.
// July 2026 (Sapir picks): drinks / fruit / bread bridge photo IDs
// swapped for 3 new Unsplash stills. Still TEMPORARY bridge assets —
// same replace-after-MEH-1184 plan applies (real business photos).
const unsplash = (id) =>
  `https://images.unsplash.com/${id}?q=80&w=1200&auto=format&fit=crop`;

export const CATEGORY_CARDS = [
  { key: "meat",   name: "בשר",              image: unsplash("photo-1613454320437-0c228c8b1723") },
  { key: "veg",    name: "ירקות",            image: unsplash("photo-1575218823251-f9d243b6f720") },
  { key: "dairy",  name: "חלב וגבינות",      image: unsplash("photo-1667645895855-2d3f7000a7be") },
  { key: "bread",  name: "לחמים ואפייה",     image: unsplash("photo-1509440159596-0249088772ff") },
  { key: "oil",    name: "שמנים",            image: unsplash("photo-1474979266404-7eaacbcd87c5") },
  { key: "care",   name: "סבונים טבעיים",    image: unsplash("photo-1614806687007-2215a9db3b1c") },
  { key: "fish",   name: "דגים",             image: unsplash("photo-1500732917506-30dc38b6477f") },
  { key: "fruit",  name: "פירות",            image: unsplash("photo-1610832958506-aa56368176cf") },
  { key: "drinks", name: "יין, בירה ומשקאות", image: unsplash("photo-1556442281-77c90134c61f") },
  // MEH-1098 (A1): DB category renamed → "קוסמטיקה טבעית". MEH-1104 (contract
  // phase, ADR-007): production rename confirmed, transitional matchAliases
  // removed — the card now resolves on the new DB value only.
  { key: "cream",  name: "קוסמטיקה טבעית",   image: unsplash("photo-1612817288484-6f916006741a") },
];

// Exact-name resolution — category ids differ per environment
// (autoincrement), so they resolve at runtime against GET /categories.
// A card whose category is absent gets categoryId:null and renders
// inert (no dead link).
// MEH-1080: exact `===` match replaced includes()-first-match (DISC-03).
export function matchCategoryId(cards, categories) {
  return cards.map((card) => {
    // Primary name first, then any transitional aliases (MEH-1098 expand phase).
    const names = [card.name, ...(card.matchAliases || [])];
    const found = categories.find((c) => names.includes(c.name));
    return { ...card, categoryId: found ? found.id : null };
  });
}
