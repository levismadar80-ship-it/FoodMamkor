// Cloudinary URL helper — injects f_auto,q_auto so images ship as WebP/AVIF
// with automatic quality. Safe for non-Cloudinary URLs (returned unchanged).
//
// Example (no options):
//   https://res.cloudinary.com/demo/image/upload/v1/foo.jpg
// becomes:
//   https://res.cloudinary.com/demo/image/upload/f_auto,q_auto/v1/foo.jpg
//
// Example (aspectRatio="4:3"):
//   https://res.cloudinary.com/demo/image/upload/v1/foo.jpg
// becomes:
//   https://res.cloudinary.com/demo/image/upload/f_auto,q_auto,c_fill,g_auto,ar_4:3/v1/foo.jpg
//
// c_fill + g_auto = smart-crop to the requested aspect ratio using
// Cloudinary's saliency model (keeps faces / main subject). Used by
// ProducerCard so portrait producer photos don't crop heads off at 4:3.
//
// MEH-788: `width` (positive integer) caps the delivered width. Without
// aspectRatio it pairs with c_limit (downscale only — never upscales a
// smaller original); with aspectRatio the w_ rides the existing c_fill.
// Used by HomeHero so the 4032px hero original ships at w_1920.
export function optimizeCloudinary(url, opts = {}) {
  if (!url || typeof url !== "string") return url;
  if (!url.includes("res.cloudinary.com")) return url;
  // Already transformed — leave it alone.
  if (/\/upload\/[^/]*(f_auto|q_auto)/.test(url)) return url;

  const parts = ["f_auto", "q_auto"];
  const ar = opts.aspectRatio;
  const hasAspect = ar && typeof ar === "string" && /^\d+:\d+$/.test(ar);
  if (hasAspect) {
    parts.push("c_fill", "g_auto", `ar_${ar}`);
  }
  const width = opts.width;
  if (Number.isInteger(width) && width > 0) {
    // Intentional: with aspectRatio, w_ rides c_fill — which MAY upscale a
    // smaller original (fill semantics). Width-only gets c_limit (never
    // upscales). HomeHero combines both (ar_16:9 + w_1920) — safe there
    // because the 4032px hero original only ever downscales to 1920.
    if (!hasAspect) parts.push("c_limit");
    parts.push(`w_${width}`);
  }
  return url.replace("/upload/", `/upload/${parts.join(",")}/`);
}

// MEH-1229: Per-surface producer-image aspect ratios — the single source of
// truth for crop ratios across the site. Every producer / product / event
// image delivery imports its ratio from here and passes it to
// `optimizeCloudinary`'s `aspectRatio`, so the same uploaded photo crops
// identically on every surface. That per-surface consistency is what
// separates "a brand" from "another AI directory" (visibility research,
// 16/07, template 05 — recommendation #1).
//
// Brand LOCK (05-photography-style + onboarding email #3): consistency here
// means crop + f_auto/q_auto/dpr ONLY. No auto color-grade / filters — that
// is a separate brand-book decision (brand-book-precedes-code).
//
// Surfaces that intentionally OPT OUT (full/intrinsic photo, no fixed crop) —
// they still ship through optimizeCloudinary for f_auto,q_auto:
//   - ProducerDetail <ImageGallery> hero + <Lightbox>: art-directed showcase
//     whose cells have several shapes; one crop would distort them.
//   - MapProducerCard thumbnail: MEH-1133 measures the loaded image's
//     intrinsic aspect to letterbox wide logos (object-contain) — a server
//     crop would collapse that ratio and break the logo path.
export const IMAGE_RATIOS = {
  card: "4:3", // ProducerCard grid tile · dashboard-edit photo grid · recipe card
  featured: "4:5", // HomeFeaturedProducer editorial portrait (reference — MEH-1214; do not change)
  strip: "16:10", // horizontal producer strips (home recently-viewed, friday-delivery)
  square: "1:1", // square thumbnails: products, map-marker popup, event/product thumbs
  banner: "16:9", // wide bg-cover banners: map bottom-sheet, event & experience images
};
