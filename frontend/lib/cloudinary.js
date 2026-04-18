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
export function optimizeCloudinary(url, opts = {}) {
  if (!url || typeof url !== "string") return url;
  if (!url.includes("res.cloudinary.com")) return url;
  // Already transformed — leave it alone.
  if (/\/upload\/[^/]*(f_auto|q_auto)/.test(url)) return url;

  const parts = ["f_auto", "q_auto"];
  const ar = opts.aspectRatio;
  if (ar && typeof ar === "string" && /^\d+:\d+$/.test(ar)) {
    parts.push("c_fill", "g_auto", `ar_${ar}`);
  }
  return url.replace("/upload/", `/upload/${parts.join(",")}/`);
}
