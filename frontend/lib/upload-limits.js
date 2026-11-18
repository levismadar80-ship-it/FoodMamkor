// @ts-check
// MEH-3399: upload size cap, in its own module so tests that mock
// "@/lib/api" (default export only) still get the real number.
// Vercel refuses request bodies over 4.5 MB before our backend sees them.

/** Largest file the browser sends to /upload/* (bytes). */
export const MAX_UPLOAD_BYTES = 4 * 1024 * 1024;

/**
 * The line shown for any upload the size cap or a 413 rejects. The existing
 * approved string the upload forms already show for an oversize pick — no
 * new copy, and none in code (HebrewLiteralRatchet).
 *
 * Loaded on demand: a static `import he from "../messages/he.json"` here put
 * the whole Hebrew catalogue (~110 KB gzipped) into every page that imports
 * lib/api.js, the home page included, and pushed v1.5.6 over the Lighthouse
 * script budget. Only an oversize upload or a 413 needs this line.
 *
 * @returns {Promise<string>}
 */
export async function uploadTooLargeDetail() {
  try {
    const { default: he } = await import("../messages/he.json");
    return he.settings.products.errors.upload_size;
  } catch {
    // The chunk failed to load (offline). The caller still gets the 413
    // shape and falls back to its own generic error line.
    return undefined;
  }
}
