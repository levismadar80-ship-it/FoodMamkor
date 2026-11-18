// @ts-check
// MEH-3399: upload size cap, in its own module so tests that mock
// "@/lib/api" (default export only) still get the real number.
// Vercel refuses request bodies over 4.5 MB before our backend sees them.
import he from "../messages/he.json";

/** Largest file the browser sends to /upload/* (bytes). */
export const MAX_UPLOAD_BYTES = 4 * 1024 * 1024;

/**
 * The line shown for any upload the size cap or a 413 rejects. The existing
 * approved string the upload forms already show for an oversize pick — no
 * new copy, and none in code (HebrewLiteralRatchet).
 */
export const UPLOAD_TOO_LARGE_DETAIL = he.settings.products.errors.upload_size;
