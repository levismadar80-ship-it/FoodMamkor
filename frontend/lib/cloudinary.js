// Cloudinary URL helper — injects f_auto,q_auto so images ship as WebP/AVIF
// with automatic quality. Safe for non-Cloudinary URLs (returned unchanged).
//
// Example:
//   https://res.cloudinary.com/demo/image/upload/v1/foo.jpg
// becomes:
//   https://res.cloudinary.com/demo/image/upload/f_auto,q_auto/v1/foo.jpg
export function optimizeCloudinary(url) {
  if (!url || typeof url !== "string") return url;
  if (!url.includes("res.cloudinary.com")) return url;
  // Already transformed — leave it alone.
  if (/\/upload\/[^/]*(f_auto|q_auto)/.test(url)) return url;
  return url.replace("/upload/", "/upload/f_auto,q_auto/");
}
